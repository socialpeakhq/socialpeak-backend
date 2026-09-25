/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { FacebookPage, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { subDays } from 'date-fns';
import { CreatePostDto } from './dtos/CreatePost.dto';
import { TokenCipher } from '../../../utils/token-cipher';
import {
  DEFAULT_GRAPH_API_VERSION,
  MetaService,
} from '../../meta/meta.service';
import { MetaGraphErrorResponse } from '../../meta/meta.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateVideoPost } from './dtos/CreateVideoPost.dto';
import { PostQueryDto } from './dtos/PostQuery.dto';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const MIN_ASPECT_RATIO = 0.8;
const MAX_ASPECT_RATIO = 1.91;

@Injectable()
export class PostsService {
  private readonly bucket = 'socialpeak-posts-images';

  constructor(
    private readonly config: ConfigService,
    private readonly metaService: MetaService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadImagesToPublicUrl(media: string[]): Promise<string[]> {
    if (!media?.length) {
      throw new BadRequestException('No media provided');
    }

    const r2 = new S3Client({
      region: 'auto',
      endpoint: this.getRequiredConfig('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.getRequiredConfig('R2_ACCESS_KEY'),
        secretAccessKey: this.getRequiredConfig('R2_SECRET_ACCESS_KEY'),
      },
    });
    const publicBaseUrl = this.getRequiredConfig('R2_PUBLIC_URL').replace(
      /\/+$/,
      '',
    );

    return Promise.all(
      media.map(async (image: string) => {
        const match = image.match(
          /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/,
        );
        if (!match) {
          throw new BadRequestException('Invalid image data URL');
        }

        const [, mimeType, base64Data] = match;
        const extension = EXTENSION_BY_MIME_TYPE[mimeType];
        if (!extension) {
          throw new BadRequestException(`Unsupported image type: ${mimeType}`);
        }

        let buffer: Buffer = Buffer.from(base64Data, 'base64');

        const { width, height } = imageSize(buffer);
        const aspectRatio = width / height;
        if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
          buffer = await this.padToSupportedAspectRatio(
            buffer,
            width,
            height,
            mimeType,
          );
        }

        const key = `${createHash('sha1').update(buffer).digest('hex')}.${extension}`;

        try {
          await r2.send(
            new PutObjectCommand({
              Bucket: this.bucket,
              Key: key,
              Body: buffer,
              ContentType: mimeType,
            }),
          );
        } catch (error) {
          throw new BadRequestException(error);
        }

        return `${publicBaseUrl}/${key}`;
      }),
    );
  }

  async createPost(userId: number, dto: CreatePostDto) {
    await this.metaService.assertWorkspaceOwnership(userId, dto.workspace_id);

    const page = await this.prisma.facebookPage.findFirstOrThrow({
      where: { workspace_id: dto.workspace_id },
    });

    const post = await this.prisma.post.create({
      data: {
        workspace_id: dto.workspace_id,
        caption: dto.caption,
        facebook_page_id: page.id,
        media_urls: dto.media_urls,
        type: 'post',
        targets: {
          create: dto.platforms.map((platform) => ({
            platform,
            status: 'pending',
          })),
        },
      },
      include: {
        targets: true,
      },
    });

    const results = await Promise.allSettled(
      dto.platforms.map((platform) =>
        platform === 'facebook'
          ? this.publishToFacebook(page, dto)
          : this.publishToInstagram(page, post.id, dto),
      ),
    );

    await Promise.all(
      results.map(async (result, index) => {
        const platform = dto.platforms[index];

        if (result.status === 'fulfilled' && result.value === null) {
          return null;
        }

        return result.status === 'fulfilled'
          ? this.prisma.postTarget.update({
              where: { post_id_platform: { post_id: post.id, platform } },
              data: {
                status: 'published',
                external_post_id: result.value,
                published_at: new Date(),
              },
            })
          : this.prisma.postTarget.update({
              where: { post_id_platform: { post_id: post.id, platform } },
              data: { status: 'failed', error_message: String(result.reason) },
            });
      }),
    );

    return this.prisma.post.findUnique({
      where: { id: post.id },
      include: { targets: true },
    });
  }

  async createVideoPost(userId: number, dto: CreateVideoPost) {
    await this.metaService.assertWorkspaceOwnership(userId, dto.workspace_id);

    const page = await this.prisma.facebookPage.findFirstOrThrow({
      where: { workspace_id: dto.workspace_id },
    });

    const token = this.cipher.decrypt(page.page_access_token);

    const post = await this.prisma.post.create({
      data: {
        workspace_id: dto.workspace_id,
        caption: dto.description,
        created_at: new Date(),
        facebook_page_id: page.id,
        media_urls: [dto.file_url],
        type: 'reel',
        targets: {
          create: dto.platforms.map((platform) => ({
            platform,
            status: 'pending',
          })),
        },
      },
      include: {
        targets: true,
      },
    });

    const results = await Promise.allSettled(
      dto.platforms.map(async (platform) => {
        if (platform === 'facebook') {
          return this.publishFacebookVideoPost(page, dto, token);
        }
        return this.deferInstagramContainer(
          page,
          post.id,
          {
            video_url: dto.file_url,
            caption: dto.description,
            media_type: 'REELS',
          },
          token,
        );
      }),
    );

    await Promise.all(
      results.map(async (result, index) => {
        const platform = dto.platforms[index];

        if (result.status === 'fulfilled' && result.value === null) {
          return null;
        }

        return result.status === 'fulfilled'
          ? this.prisma.postTarget.update({
              where: { post_id_platform: { post_id: post.id, platform } },
              data: {
                status: 'published',
                external_post_id: result.value,
                published_at: new Date(),
              },
            })
          : this.prisma.postTarget.update({
              where: { post_id_platform: { post_id: post.id, platform } },
              data: {
                status: 'failed',
                error_message: String(result.reason),
              },
            });
      }),
    );
    return this.prisma.post.findUnique({
      where: { id: post.id },
      include: { targets: true },
    });
  }

  async createStory(userId: number, dto: CreatePostDto) {
    await this.metaService.assertWorkspaceOwnership(userId, dto.workspace_id);

    const page = await this.prisma.facebookPage.findFirstOrThrow({
      where: { workspace_id: dto.workspace_id },
    });

    const token = this.cipher.decrypt(page.page_access_token);

    const post = await this.prisma.post.create({
      data: {
        media_urls: [dto.media_urls[0]],
        workspace_id: dto.workspace_id,
        facebook_page_id: page.id,
        type: 'story',
        caption: '',
        targets: {
          create: dto.platforms.map((platform) => ({
            platform,
            status: 'pending',
          })),
        },
      },
      include: {
        targets: true,
      },
    });

    const results = await Promise.allSettled(
      dto.platforms.map(async (platform) =>
        platform === 'facebook'
          ? this.publishFacebookStory(page, dto, token)
          : this.publishInstagramStory(page, post.id, dto, token),
      ),
    );

    await Promise.all(
      results.map(async (result, index) => {
        const platform = dto.platforms[index];

        if (result.status === 'fulfilled' && result.value === null) {
          return null;
        }

        return result.status === 'fulfilled'
          ? this.prisma.postTarget.update({
              where: {
                post_id_platform: { platform: platform, post_id: post.id },
              },
              data: {
                status: 'published',
                external_post_id: result.value,
                published_at: new Date(),
              },
            })
          : this.prisma.postTarget.update({
              where: { post_id_platform: { platform, post_id: post.id } },
              data: {
                status: 'failed',
                error_message: String(result.reason),
              },
            });
      }),
    );

    return this.prisma.post.findUnique({
      where: { id: post.id },
      include: { targets: true },
    });
  }

  async getWorkspacePosts(
    userId: number,
    workspaceId: number,
    querySearchParams: PostQueryDto,
  ) {
    await this.metaService.assertWorkspaceOwnership(userId, workspaceId);

    const { date, platforms, searchField, statuses, types } = querySearchParams;

    const where: Prisma.PostWhereInput = { workspace_id: workspaceId };

    const search = searchField.trim();
    if (search) {
      const or: Prisma.PostWhereInput[] = [
        { caption: { contains: search, mode: 'insensitive' } },
      ];
      if (/^\d+$/.test(search) && Number.isSafeInteger(Number(search))) {
        or.push({ id: Number(search) });
      }
      where.OR = or;
    }

    const typeList = this.parseFilterList(types);
    if (typeList) where.type = { in: typeList };

    const DATE_RANGES: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
    };
    if (DATE_RANGES[date]) {
      where.created_at = { gte: subDays(new Date(), DATE_RANGES[date]) };
    }

    const platformList = this.parseFilterList(platforms);
    const statusList = this.parseFilterList(statuses);
    if (platformList || statusList) {
      where.targets = {
        some: {
          ...(platformList && { platform: { in: platformList } }),
          ...(statusList && { status: { in: statusList } }),
        },
      };
    }

    return this.prisma.post.findMany({
      where,
      include: { targets: true },
      orderBy: { created_at: 'desc' },
    });
  }

  // PRIVATE FUNCTIONS //

  private parseFilterList(value: string): string[] | null {
    const list = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return list.length === 0 || list.includes('all') ? null : list;
  }

  private async padToSupportedAspectRatio(
    buffer: Buffer,
    width: number,
    height: number,
    mimeType: string,
  ): Promise<Buffer> {
    let targetWidth = width;
    let targetHeight = height;

    const aspectRatio = width / height;
    if (aspectRatio < MIN_ASPECT_RATIO) {
      targetWidth = Math.ceil(height * MIN_ASPECT_RATIO);
    } else if (aspectRatio > MAX_ASPECT_RATIO) {
      targetHeight = Math.ceil(width / MAX_ASPECT_RATIO);
    }

    const extraWidth = targetWidth - width;
    const extraHeight = targetHeight - height;
    const left = Math.floor(extraWidth / 2);
    const right = extraWidth - left;
    const top = Math.floor(extraHeight / 2);
    const bottom = extraHeight - top;

    const image = sharp(buffer).extend({
      top,
      bottom,
      left,
      right,
      background: { r: 255, g: 255, b: 255 },
    });

    switch (mimeType) {
      case 'image/png':
        return image.png().toBuffer();
      case 'image/webp':
        return image.webp().toBuffer();
      case 'image/gif':
        return image.gif().toBuffer();
      default:
        return image.jpeg().toBuffer();
    }
  }

  private async publishToFacebook(
    page: FacebookPage,
    dto: CreatePostDto,
  ): Promise<string> {
    const token = this.cipher.decrypt(page.page_access_token);

    if (!dto.media_urls?.length) {
      return this.publishFacebookTextLinkPosts(page, dto, token);
    }

    if (dto.media_urls.length === 1) {
      return this.publishFacebookSinglePhotoPost(page, dto, token);
    }

    return this.publishFacebookCarouselPost(page, dto, token);
  }

  private async publishToInstagram(
    page: FacebookPage,
    postId: number,
    dto: CreatePostDto,
  ): Promise<null> {
    if (!dto.media_urls?.length) {
      throw new BadRequestException(
        'Instagram requires at least one image or video',
      );
    }

    const token = this.cipher.decrypt(page.page_access_token);

    if (dto.media_urls.length === 1) {
      return this.deferInstagramContainer(
        page,
        postId,
        { image_url: dto.media_urls[0], caption: dto.caption },
        token,
      );
    }

    return this.deferInstagramCarousel(page, postId, dto, token);
  }

  // PUBLISH FACEBOOK FUNCTIONS //

  private async publishFacebookTextLinkPosts(
    page: FacebookPage,
    dto: CreatePostDto,
    token: string,
  ) {
    const url = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.page_id}/feed`,
    );
    url.searchParams.set('message', dto.caption);
    if (dto.link) url.searchParams.set('link', dto.link);
    url.searchParams.set('access_token', token);
    url.searchParams.set('published', String(dto.published));

    const result = await this.request<{ id: string }>(url, 'POST');

    return result.id;
  }

  private async publishFacebookSinglePhotoPost(
    page: FacebookPage,
    dto: CreatePostDto,
    token: string,
  ) {
    const url = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.page_id}/photos`,
    );
    url.searchParams.set('url', dto.media_urls[0]);
    url.searchParams.set('caption', dto.caption);
    url.searchParams.set('access_token', token);
    const result = await this.request<{ id: string; post_id: string }>(
      url,
      'POST',
    );

    return result.post_id;
  }

  private async publishFacebookCarouselPost(
    page: FacebookPage,
    dto: CreatePostDto,
    token: string,
  ) {
    const carouselData: { media_fbid: string }[] = [];

    await Promise.all(
      dto.media_urls.map(async (mediaUrl: string) => {
        const photoUrl = new URL(
          `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.page_id}/photos`,
        );
        photoUrl.searchParams.set('url', mediaUrl);
        photoUrl.searchParams.set('published', 'false');
        photoUrl.searchParams.set('access_token', token);
        const result = await this.request<{ id: string }>(photoUrl, 'POST');
        carouselData.push({ media_fbid: result.id });
      }),
    );

    const publishUrl = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.page_id}/feed`,
    );
    publishUrl.searchParams.set('message', dto.caption);
    publishUrl.searchParams.set('attached_media', JSON.stringify(carouselData));
    publishUrl.searchParams.set('access_token', token);

    const result = await this.request<{ id: string }>(publishUrl, 'POST');
    return result.id;
  }

  private async publishFacebookVideoPost(
    page: FacebookPage,
    dto: CreateVideoPost,
    token: string,
  ) {
    const url = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.page_id}/videos`,
    );
    url.searchParams.set('file_url', dto.file_url);
    url.searchParams.set('description', dto.description);
    url.searchParams.set('title', dto.title);
    url.searchParams.set('no_story', String(dto.no_story));
    url.searchParams.set('published', String(dto.published));
    url.searchParams.set('access_token', token);
    if (dto.isScheduled)
      url.searchParams.set('scheduled_publish_time', String(dto.timestamp));

    const result = await this.request<{ id: string }>(url, 'POST');

    return result.id;
  }

  private async publishFacebookStory(
    page: FacebookPage,
    dto: CreatePostDto,
    token: string,
  ) {
    const photosUrl = new URL(
      `${this.config.get('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.page_id}/photos`,
    );

    photosUrl.searchParams.set('url', dto.media_urls[0]);
    photosUrl.searchParams.set('published', 'false');
    photosUrl.searchParams.set('access_token', token);

    const result = await this.request<{ id: string }>(photosUrl, 'POST');

    const publishUrl = new URL(
      `${this.config.get('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/photo_stories`,
    );
    publishUrl.searchParams.set('photo_id', result.id);
    publishUrl.searchParams.set('access_token', token);
    const response = await this.request<{ id: string }>(publishUrl, 'POST');

    return response.id;
  }

  // PUBLISH FACEBOOK FUNCTIONS //

  // PUBLISH INSTAGRAM FUNCTIONS //
  private async createContainer(
    page: FacebookPage,
    dto: Record<string, number | string | string[] | boolean>,
    token: string,
  ) {
    const url = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.instagram_account_id}/media`,
    );

    Object.keys(dto).map((key: string) =>
      url.searchParams.set(key, String(dto[key])),
    );

    url.searchParams.set('access_token', token);

    const response = await this.request<{ id: string }>(url, 'POST');
    return response.id;
  }

  private async publishInstagramMedia(
    instagramAccountId: string,
    token: string,
    containerId: string,
  ) {
    const url = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${instagramAccountId}/media_publish`,
    );

    url.searchParams.set('creation_id', containerId);
    url.searchParams.set('access_token', token);

    const response = await this.request<{ id: string }>(url, 'POST');
    return response.id;
  }

  private async deferInstagramContainer(
    page: FacebookPage,
    postId: number,
    dto: Record<string, number | string | string[] | boolean>,
    token: string,
  ): Promise<null> {
    if (!page.instagram_account_id) {
      throw new BadRequestException(
        'This page has no linked Instagram account',
      );
    }

    const containerId = await this.createContainer(page, dto, token);

    await this.prisma.postTarget.update({
      where: { post_id_platform: { post_id: postId, platform: 'instagram' } },
      data: {
        status: 'processing',
        container_id: containerId,
        container_created_at: new Date(),
      },
    });

    return null;
  }

  private async deferInstagramCarousel(
    page: FacebookPage,
    postId: number,
    dto: CreatePostDto,
    token: string,
  ): Promise<null> {
    if (!page.instagram_account_id) {
      throw new BadRequestException(
        'This page has no linked Instagram account',
      );
    }

    const childContainerIds = await Promise.all(
      dto.media_urls.map((mediaUrl) =>
        this.createContainer(
          page,
          { image_url: mediaUrl, is_carousel_item: true },
          token,
        ),
      ),
    );

    await this.prisma.postTarget.update({
      where: { post_id_platform: { post_id: postId, platform: 'instagram' } },
      data: {
        status: 'processing',
        child_container_ids: childContainerIds,
        container_created_at: new Date(),
      },
    });

    return null;
  }

  private isVideoUrl(url: string): boolean {
    return /\.(mp4|mov|m4v|webm|avi|mkv)(\?.*)?$/i.test(url);
  }

  private async publishInstagramStory(
    page: FacebookPage,
    postId: number,
    dto: CreatePostDto,
    token: string,
  ): Promise<null> {
    const mediaUrl = dto.media_urls[0];

    return this.deferInstagramContainer(
      page,
      postId,
      this.isVideoUrl(mediaUrl)
        ? { video_url: mediaUrl, media_type: 'STORIES' }
        : { image_url: mediaUrl, media_type: 'STORIES' },
      token,
    );
  }

  private async getContainerStatus(
    containerId: string,
    token: string,
  ): Promise<string> {
    const url = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${containerId}`,
    );
    url.searchParams.set('fields', 'status_code');
    url.searchParams.set('access_token', token);

    const { status_code } = await this.request<{ status_code: string }>(
      url,
      'GET',
    );
    return status_code;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingInstagramContainers() {
    const pendingTargets = await this.prisma.postTarget.findMany({
      where: {
        status: 'processing',
        platform: 'instagram',
        OR: [
          { container_id: { not: null } },
          { child_container_ids: { isEmpty: false } },
        ],
      },
      include: { post: { include: { facebook_page: true } } },
    });

    await Promise.all(
      pendingTargets.map(async (target) => {
        try {
          const page = (
            target.post as unknown as {
              facebook_page: FacebookPage | null;
            }
          ).facebook_page;

          if (!page?.instagram_account_id) {
            throw new BadRequestException(
              'Instagram page is not available for this post',
            );
          }

          const token = this.cipher.decrypt(page.page_access_token);

          if (!target.container_id && target.child_container_ids.length > 0) {
            const childStatuses = await Promise.all(
              target.child_container_ids.map((id) =>
                this.getContainerStatus(id, token),
              ),
            );

            if (childStatuses.some((s) => s === 'ERROR' || s === 'EXPIRED')) {
              await this.prisma.postTarget.update({
                where: { id: target.id },
                data: {
                  status: 'failed',
                  error_message:
                    'One or more Instagram carousel items failed to process',
                },
              });
              return;
            }

            if (!childStatuses.every((s) => s === 'FINISHED')) {
              return;
            }

            const containerId = await this.createContainer(
              page,
              {
                media_type: 'CAROUSEL',
                children: target.child_container_ids,
                caption: target.post.caption,
              },
              token,
            );

            await this.prisma.postTarget.update({
              where: { id: target.id },
              data: { container_id: containerId },
            });
            return;
          }

          if (!target.container_id) return;

          const statusCode = await this.getContainerStatus(
            target.container_id,
            token,
          );

          if (statusCode === 'FINISHED') {
            const publishId = await this.publishInstagramMedia(
              page.instagram_account_id,
              token,
              target.container_id,
            );
            await this.prisma.postTarget.update({
              where: { id: target.id },
              data: {
                status: 'published',
                external_post_id: publishId,
                published_at: new Date(),
              },
            });
          } else if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
            await this.prisma.postTarget.update({
              where: { id: target.id },
              data: {
                status: 'failed',
                error_message: `Instagram container failed to process: ${statusCode}`,
              },
            });
          }
        } catch (error) {
          await this.prisma.postTarget.update({
            where: { id: target.id },
            data: { status: 'failed', error_message: String(error) },
          });
        }
      }),
    );
  }

  // PUBLISH INSTAGRAM FUNCTIONS //

  // HELPER FUNCTIONS //
  private async request<T>(
    url: URL,
    method: 'GET' | 'POST' = 'GET',
  ): Promise<T> {
    const response = await fetch(url.toString(), { method });
    const body = (await response.json()) as T | MetaGraphErrorResponse;

    if (!response.ok || (body as MetaGraphErrorResponse).error) {
      const message =
        (body as MetaGraphErrorResponse).error?.message ??
        'Meta Graph API request failed';
      throw new BadRequestException(message);
    }
    return body as T;
  }

  private get graphVersion(): string {
    return (
      this.config.get<string>('META_GRAPH_API_VERSION') ??
      DEFAULT_GRAPH_API_VERSION
    );
  }

  private get cipher(): TokenCipher {
    return TokenCipher.fromBase64(
      this.getRequiredConfig('TOKEN_ENCRYPTION_KEY'),
    );
  }

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new Error(`${key} not found!`);
    }

    return value;
  }
}

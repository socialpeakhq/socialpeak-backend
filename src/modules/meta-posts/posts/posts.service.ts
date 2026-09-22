import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { FacebookPage } from '@prisma/client';
import { createHash } from 'crypto';
import { imageSize } from 'image-size';
import sharp from 'sharp';
import { CreatePostDto } from './dtos/CreatePost.dto';
import { TokenCipher } from '../../../utils/token-cipher';
import {
  DEFAULT_GRAPH_API_VERSION,
  MetaService,
} from '../../meta/meta.service';
import { MetaGraphErrorResponse } from '../../meta/meta.types';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateVideoPost } from './dtos/CreateVideoPost.dto';

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
          : this.publishToInstagram(page, dto),
      ),
    );

    await Promise.all(
      results.map(async (result, index) => {
        const platform = dto.platforms[index];
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
        await this.publishInstagramVideoReel(
          page,
          post.id,
          {
            video_url: dto.file_url,
            caption: dto.description,
            media_type: 'REELS',
          },
          token,
        );
        return null;
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
          : null,
      ),
    );

    await Promise.all(
      results.map((result, index) => {
        const platform = dto.platforms[index];
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

  async getWorkspacePosts(userId: number, workspaceId: number) {
    await this.metaService.assertWorkspaceOwnership(userId, workspaceId);

    const posts = await this.prisma.post.findMany({
      where: { workspace_id: workspaceId },
      include: { targets: true },
    });

    return posts;
  }

  // PRIVATE FUNCTIONS //

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
    dto: CreatePostDto,
  ): Promise<string> {
    if (!dto.media_urls?.length) {
      throw new BadRequestException(
        'Instagram requires at least one image or video',
      );
    }

    const token = this.cipher.decrypt(page.page_access_token);

    const containerUrl = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.instagram_account_id}/media`,
    );
    containerUrl.searchParams.set('image_url', dto.media_urls[0]);
    containerUrl.searchParams.set('caption', dto.caption);
    containerUrl.searchParams.set('access_token', token);
    const container = await this.request<{ id: string }>(containerUrl, 'POST');

    const publishUrl = new URL(
      `${this.config.get<string>('FACEBOOK_GRAPH_URL') ?? ''}/${this.graphVersion}/${page.instagram_account_id}/media_publish`,
    );
    publishUrl.searchParams.set('creation_id', container.id);
    publishUrl.searchParams.set('access_token', token);
    const published = await this.request<{ id: string }>(publishUrl, 'POST');
    return published.id;
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

  private async publishInstagramSinglePhoto(
    page: FacebookPage,
    dto: Record<string, number | string | string[] | boolean>,
    token: string,
  ) {
    if (!page.instagram_account_id) {
      throw new BadRequestException(
        'This page has no linked Instagram account',
      );
    }

    const containerId = await this.createContainer(page, dto, token);

    const publishId = await this.publishInstagramMedia(
      page.instagram_account_id,
      token,
      containerId,
    );

    return publishId;
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

  private async publishInstagramVideoReel(
    page: FacebookPage,
    postId: number,
    dto: Record<string, number | string | string[] | boolean>,
    token: string,
  ): Promise<void> {
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
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingInstagramContainers() {
    const pendingTargets = await this.prisma.postTarget.findMany({
      where: { status: 'processing', container_id: { not: null } },
      include: { post: { include: { facebook_page: true } } },
    });

    await Promise.all(
      pendingTargets.map(async (target) => {
        try {
          const targetWithPage = target as {
            container_id: string | null;
            post: { facebook_page: FacebookPage | null };
          };
          const { container_id: containerId, post } = targetWithPage;
          const page = post.facebook_page;

          if (!containerId || !page?.instagram_account_id) {
            throw new BadRequestException(
              'Instagram page or container is not available',
            );
          }

          const token = this.cipher.decrypt(page.page_access_token);
          const statusCode = await this.getContainerStatus(containerId, token);

          if (statusCode === 'FINISHED') {
            const publishId = await this.publishInstagramMedia(
              page.instagram_account_id,
              token,
              containerId,
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
          // IN_PROGRESS: leave as 'processing', picked up again next tick.
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

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FacebookPage } from '@prisma/client';
import { createHash } from 'crypto';
import { CreatePostDto } from './dtos/CreatePost.dto';
import { TokenCipher } from '../../../utils/token-cipher';
import {
  DEFAULT_GRAPH_API_VERSION,
  MetaService,
} from '../../meta/meta.service';
import { MetaGraphErrorResponse } from '../../meta/meta.types';
import { PrismaService } from '../../../prisma/prisma.service';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

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

        const buffer = Buffer.from(base64Data, 'base64');
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
      results.map((result, index) => {
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

  // PRIVATE FUNCTIONS //

  private async publishToFacebook(
    page: FacebookPage,
    dto: CreatePostDto,
  ): Promise<string> {
    const token = this.cipher.decrypt(page.page_access_token);
    const url = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${page.page_id}/photos`,
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

  private async publishToInstagram(
    page: FacebookPage,
    dto: CreatePostDto,
  ): Promise<string> {
    const token = this.cipher.decrypt(page.page_access_token);

    const containerUrl = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${page.instagram_account_id}/media`,
    );
    containerUrl.searchParams.set('image_url', dto.media_urls[0]);
    containerUrl.searchParams.set('caption', dto.caption);
    containerUrl.searchParams.set('access_token', token);
    const container = await this.request<{ id: string }>(containerUrl, 'POST');

    const publishUrl = new URL(
      `https://graph.facebook.com/${this.graphVersion}/${page.instagram_account_id}/media_publish`,
    );
    publishUrl.searchParams.set('creation_id', container.id);
    publishUrl.searchParams.set('access_token', token);
    const published = await this.request<{ id: string }>(publishUrl, 'POST');
    return published.id;
  }

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

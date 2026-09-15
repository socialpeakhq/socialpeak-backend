import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

@Injectable()
export class PostsService {
  private readonly bucket = 'socialpeak-posts-images';

  constructor(private readonly config: ConfigService) {}

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

  // PRIVATE FUNCTIONS //

  private getRequiredConfig(key: string): string {
    const value = this.config.get<string>(key);

    if (!value) {
      throw new Error(`${key} not found!`);
    }

    return value;
  }
}

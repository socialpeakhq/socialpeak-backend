import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PostsService {
  constructor(private readonly config: ConfigService) {}

  // PRIVATE FUNCTIONS //

  async uploadImagesToPublicUrl(media: string[]) {
    // const urls = [];
    const r2 = new S3Client({
      region: 'auto',
      endpoint: this.getRequiredConfig('R2_ENDPOINT') ?? '',
      credentials: {
        accessKeyId: this.getRequiredConfig('R2_ACCESS_KEY') ?? '',
        secretAccessKey: this.getRequiredConfig('R2_SECRET_ACCESS_KEY') ?? '',
      },
    });

    await Promise.all(
      media.map(async (image: string) => {
        const [meta, base64Data] = image.split(',');
        const buffer = Buffer.from(base64Data, 'base64');

        const putObjectCommand = new PutObjectCommand({
          Bucket: 'socialpeak-posts-images',
          Key: base64Data,
          Body: buffer,
        });

        try {
          const response = await r2.send(putObjectCommand);
          return response;
        } catch (error) {
          throw new BadRequestException(error);
        }
      }),
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

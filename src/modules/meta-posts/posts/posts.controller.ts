import { Body, Controller, Post } from '@nestjs/common';
import { PostsService } from './posts.service';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('media/upload-media')
  postUploadMedia(@Body() media: string[]) {
    return this.postsService.uploadImagesToPublicUrl(media);
  }
}

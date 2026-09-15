import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CurrentUser } from '../../../decorators/current-user.decorator';
import type { JwtPayload } from '../../../decorators/current-user.decorator';
import { CreatePostDto } from './dtos/CreatePost.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  @UsePipes(ValidationPipe)
  async createPost(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createPost(user.sub, dto);
  }

  @Post('media/upload-media')
  postUploadMedia(@Body() media: string[]) {
    return this.postsService.uploadImagesToPublicUrl(media);
  }

  @Get('list/:workspaceId')
  async getWorkspacePosts(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
  ) {
    return this.postsService.getWorkspacePosts(user.sub, workspaceId);
  }
}

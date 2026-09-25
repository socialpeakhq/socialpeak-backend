import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { CurrentUser } from '../../../decorators/current-user.decorator';
import type { JwtPayload } from '../../../decorators/current-user.decorator';
import { CreatePostDto } from './dtos/CreatePost.dto';
import { CreateVideoPost } from './dtos/CreateVideoPost.dto';
import { PostQueryDto } from './dtos/PostQuery.dto';
import { UpdateScheduledPostDto } from './dtos/EditPost.dto';

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

  @Post('video')
  @UsePipes(ValidationPipe)
  async createVideoPost(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateVideoPost,
  ) {
    return this.postsService.createVideoPost(user.sub, dto);
  }

  @Post('story')
  @UsePipes(ValidationPipe)
  async createStory(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePostDto,
  ) {
    return this.postsService.createStory(user.sub, dto);
  }

  @Post('media/upload-media')
  postUploadMedia(@Body() media: string[]) {
    return this.postsService.uploadImagesToPublicUrl(media);
  }

  @Get('list/:workspaceId')
  async getWorkspacePosts(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Query(new ValidationPipe({ transform: true })) query: PostQueryDto,
  ) {
    return this.postsService.getWorkspacePosts(user.sub, workspaceId, query);
  }

  @Patch('schedule/:id')
  @UsePipes(ValidationPipe)
  async updateScheduledPost(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduledPostDto,
  ) {
    return this.postsService.updateScheduledPost(user.sub, id, dto);
  }

  @Delete('schedule/:id')
  async cancelScheduledPost(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.postsService.cancelScheduledPost(user.sub, id);
  }

  @Get('scheduled/:workspace_id')
  async getScheduledPosts(
    @CurrentUser() user: JwtPayload,
    @Param('workspace_id', ParseIntPipe) workspace_id: number,
  ) {
    return this.postsService.getScheduledPosts(user.sub, workspace_id);
  }
}

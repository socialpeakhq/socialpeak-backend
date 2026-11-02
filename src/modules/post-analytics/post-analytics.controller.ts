import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { PostAnalyticsService } from './post-analytics.service';
import type { JwtPayload } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('post')
export class PostAnalyticsController {
  constructor(private readonly postAnalyticsService: PostAnalyticsService) {}

  @Get('/analytics/:workspaceId')
  getPostsAnalytics(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
  ) {
    return this.postAnalyticsService.getWorkspacePostAnalytics(
      user.sub,
      workspaceId,
    );
  }

  @Get('/analytics/:workspaceId/:postId')
  getSinglePostAnalytics(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Param('postId', ParseIntPipe) postId: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.postAnalyticsService.getSinglePostAnalytics(
      user.sub,
      workspaceId,
      postId,
      days,
    );
  }
}

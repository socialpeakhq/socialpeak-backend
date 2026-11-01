import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { PostAnalyticsService } from './post-analytics.service';
import type { JwtPayload } from '../../decorators/current-user.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';

@Controller('post-analytics')
export class PostAnalyticsController {
  constructor(private readonly postAnalyticsService: PostAnalyticsService) {}

  @Get('/post/analytics/:workspaceId')
  getPostsAnalytics(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
  ) {
    return this.postAnalyticsService.getWorkspacePostAnalytics(
      user.sub,
      workspaceId,
    );
  }

  @Get('/post/analytics/:workspaceId/:postId')
  getSinglePostAnalytics(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Param('postId', ParseIntPipe) postId: number,
  ) {
    return this.postAnalyticsService.getSinglePostAnalytics(
      user.sub,
      workspaceId,
      postId,
    );
  }
}

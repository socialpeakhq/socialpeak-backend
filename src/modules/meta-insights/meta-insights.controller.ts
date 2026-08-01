import { Body, Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MetaInsightsService } from './meta-insights.service';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { JwtPayload } from '../../decorators/current-user.decorator';

@Controller('meta-insights')
export class MetaInsightsController {
  constructor(private readonly metaInsightsService: MetaInsightsService) {}

  @Get('/workspace/:workspaceId/:platform')
  getMetaInsightsByPlatform(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Param('platform') platform: string,
  ) {
    return this.metaInsightsService.getMetaInsights(
      user.sub,
      workspaceId,
      platform,
    );
  }

  @Get('/workspace/insights/:workspaceId/:pageId/manual')
  syncOneAccountManually(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Param('pageId', ParseIntPipe) pageId: number,
  ) {
    return this.metaInsightsService.syncOneAccountManually(user.sub, {
      page_id: pageId,
      workspaceId: workspaceId,
    });
  }
}

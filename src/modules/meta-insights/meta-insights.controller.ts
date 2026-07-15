import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { MetaInsightsService } from './meta-insights.service';

@Controller('meta-insights')
export class MetaInsightsController {
  constructor(private readonly metaInsightsService: MetaInsightsService) {}

  @Get('/workspace/:workspaceId')
  getMetaInsights(@Param('workspaceId', ParseIntPipe) workspaceId: number) {
    return workspaceId;
  }
}

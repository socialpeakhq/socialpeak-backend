import {
  Controller,
  forwardRef,
  Get,
  Inject,
  Logger,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { MetaService } from './meta.service';
import { MetaInsightsService } from '../meta-insights/meta-insights.service';
import { MetaCallbackDto } from './dtos/meta-callback.dto';
import { MetaConnectDto } from './dtos/meta-connect.dto';
import { Public } from '../../decorators/public.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { JwtPayload } from '../../decorators/current-user.decorator';

@Controller('meta')
export class MetaController {
  private readonly logger = new Logger(MetaController.name);

  constructor(
    private readonly metaService: MetaService,
    @Inject(forwardRef(() => MetaInsightsService))
    private readonly metaInsightsService: MetaInsightsService,
  ) {}

  @Get('connect')
  @UsePipes(ValidationPipe)
  async connect(
    @CurrentUser() user: JwtPayload,
    @Query() query: MetaConnectDto,
  ) {
    const url = await this.metaService.createAuthorizationUrl(
      user.sub,
      query.workspace_id,
    );
    return { url };
  }

  @Public()
  @Get('callback')
  @UsePipes(ValidationPipe)
  async callback(@Query() query: MetaCallbackDto, @Res() res: Response) {
    const payload = await this.metaService.processCallback(query);

    if (payload.linked && payload.workspace_id) {
      this.metaInsightsService
        .backfillWorkspaceHistory(payload.workspace_id)
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to backfill history for workspace ${payload.workspace_id}`,
            error instanceof Error ? error.stack : error,
          );
        });
    }

    const { html, nonce } = this.metaService.buildPopupResponse(payload);

    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; script-src 'nonce-${nonce}'`,
    );
    res.type('html').send(html);
  }

  @Get('workspace/:workspaceId/accounts')
  async getWorkspaceAccounts(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
  ) {
    return this.metaService.getWorkspaceAccounts(user.sub, workspaceId);
  }
}

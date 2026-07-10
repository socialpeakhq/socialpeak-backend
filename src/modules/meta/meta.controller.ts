import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { MetaService } from './meta.service';
import { MetaCallbackDto } from './dtos/meta-callback.dto';
import { MetaConnectDto } from './dtos/meta-connect.dto';
import { Public } from '../../decorators/public.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { JwtPayload } from '../../decorators/current-user.decorator';

@Controller('meta')
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

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

  @Get('workspace/:workspaceId/today-insights/:id')
  async getTodayInsights(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.metaService.getPageInsights(user.sub, workspaceId, id);
  }
}

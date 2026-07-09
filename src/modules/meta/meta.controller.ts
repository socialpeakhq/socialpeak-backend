import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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
  async callback(@Query() query: MetaCallbackDto) {
    if (query.error) {
      return {
        linked: false,
        error: query.error,
        error_description: query.error_description ?? query.error_reason,
      };
    }

    if (!query.code || !query.state) {
      throw new BadRequestException('Missing code or state parameter');
    }

    const result = await this.metaService.handleCallback(
      query.code,
      query.state,
    );

    return { linked: true, ...result };
  }

  @Get('workspace/:workspaceId/accounts')
  async getWorkspaceAccounts(
    @CurrentUser() user: JwtPayload,
    @Param('workspaceId', ParseIntPipe) workspaceId: number,
  ) {
    return this.metaService.getWorkspaceAccounts(user.sub, workspaceId);
  }
}

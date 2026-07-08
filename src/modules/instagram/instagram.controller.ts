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
import { InstagramService } from './instagram.service';
import { InstagramCallbackDto } from './dtos/instagram-callback.dto';
import { InstagramConnectDto } from './dtos/instagram-connect.dto';
import { Public } from '../../decorators/public.decorator';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { JwtPayload } from '../../decorators/current-user.decorator';

@Controller('instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('connect')
  @UsePipes(ValidationPipe)
  async connect(
    @CurrentUser() user: JwtPayload,
    @Query() query: InstagramConnectDto,
  ) {
    const url = await this.instagramService.createAuthorizationUrl(
      user.sub,
      query.workspace_id,
    );
    return { url };
  }

  @Public()
  @Get('callback')
  @UsePipes(ValidationPipe)
  async callback(@Query() query: InstagramCallbackDto) {
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

    const result = await this.instagramService.handleCallback(
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
    return this.instagramService.getWorkspaceAccounts(user.sub, workspaceId);
  }
}

import { Controller, Get } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CurrentUser } from '../../decorators/current-user.decorator';
import type { JwtPayload } from '../../decorators/current-user.decorator';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get(':id')
  getWorkspaces(@CurrentUser() user: JwtPayload) {
    return this.workspaceService.getAllWorkspaces(user.sub);
  }
}

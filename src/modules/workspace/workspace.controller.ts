import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get(':id')
  getWorkspaces(@Param('id', ParseIntPipe) id: number) {
    return this.workspaceService.getAllWorkspaces(id);
  }
}

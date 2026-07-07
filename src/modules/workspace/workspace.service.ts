import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  getAllWorkspaces(id: number) {
    const workspaces = this.prisma.workspace.findMany({
      where: { owner_id: id },
    });

    return workspaces;
  }
}

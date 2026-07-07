import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { WorkspaceService } from './modules/workspace/workspace.service';
import { WorkspaceController } from './modules/workspace/workspace.controller';

@Module({
  controllers: [AppController, WorkspaceController],
  providers: [AppService, WorkspaceService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    WorkspaceModule,
  ],
})
export class AppModule {}

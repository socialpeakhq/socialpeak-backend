import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { AuthGuard } from './guards/auth.guard';
import { InstagramModule } from './modules/instagram/instagram.module';

@Module({
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    WorkspaceModule,
    InstagramModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { WorkspaceModule } from './modules/workspace/workspace.module';
import { AuthGuard } from './guards/auth.guard';
import { MetaModule } from './modules/meta/meta.module';
import { MetaInsightsModule } from './modules/meta-insights/meta-insights.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PostsService } from './modules/meta-posts/posts/posts.service';
import { PostsController } from './modules/meta-posts/posts/posts.controller';
import { PostsModule } from './modules/meta-posts/posts/posts.module';

@Module({
  controllers: [AppController, PostsController],
  providers: [AppService, { provide: APP_GUARD, useClass: AuthGuard }, PostsService],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    WorkspaceModule,
    MetaModule,
    MetaInsightsModule,
    PostsModule,
  ],
})
export class AppModule {}

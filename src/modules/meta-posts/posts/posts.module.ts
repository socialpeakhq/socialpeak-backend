import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}

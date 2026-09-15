import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../prisma/prisma.module';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { MetaModule } from '../../meta/meta.module';

@Module({
  imports: [ConfigModule, PrismaModule, MetaModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}

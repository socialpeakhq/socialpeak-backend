import { Module } from '@nestjs/common';
import { PostAnalyticsController } from './post-analytics.controller';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { PostAnalyticsService } from './post-analytics.service';
import { MetaModule } from '../meta/meta.module';

@Module({
  imports: [ConfigModule, PrismaModule, MetaModule],
  controllers: [PostAnalyticsController],
  providers: [PostAnalyticsService],
  exports: [PostAnalyticsService],
})
export class PostAnalyticsModule {}

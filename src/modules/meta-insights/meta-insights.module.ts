import { forwardRef, Module } from '@nestjs/common';
import { MetaInsightsController } from './meta-insights.controller';
import { MetaInsightsService } from './meta-insights.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { MetaModule } from '../meta/meta.module';

@Module({
  imports: [ConfigModule, PrismaModule, forwardRef(() => MetaModule)],
  controllers: [MetaInsightsController],
  providers: [MetaInsightsService],
  exports: [MetaInsightsService],
})
export class MetaInsightsModule {}

import { Test, TestingModule } from '@nestjs/testing';
import { MetaInsightsService } from './meta-insights.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from '../meta/meta.service';

describe('MetaInsightsService', () => {
  let service: MetaInsightsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetaInsightsService,
        { provide: PrismaService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: MetaService, useValue: {} },
      ],
    }).compile();

    service = module.get<MetaInsightsService>(MetaInsightsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

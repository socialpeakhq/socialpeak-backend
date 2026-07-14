import { Test, TestingModule } from '@nestjs/testing';
import { MetaInsightsService } from './meta-insights.service';

describe('MetaInsightsService', () => {
  let service: MetaInsightsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetaInsightsService],
    }).compile();

    service = module.get<MetaInsightsService>(MetaInsightsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { PostAnalyticsService } from './post-analytics.service';

describe('PostAnalyticsService', () => {
  let service: PostAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PostAnalyticsService],
    }).compile();

    service = module.get<PostAnalyticsService>(PostAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

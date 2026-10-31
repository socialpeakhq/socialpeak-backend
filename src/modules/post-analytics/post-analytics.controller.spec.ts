import { Test, TestingModule } from '@nestjs/testing';
import { PostAnalyticsController } from './post-analytics.controller';

describe('PostAnalyticsController', () => {
  let controller: PostAnalyticsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PostAnalyticsController],
    }).compile();

    controller = module.get<PostAnalyticsController>(PostAnalyticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

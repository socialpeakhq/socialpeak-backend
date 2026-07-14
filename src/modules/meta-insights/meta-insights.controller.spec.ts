import { Test, TestingModule } from '@nestjs/testing';
import { MetaInsightsController } from './meta-insights.controller';

describe('MetaInsightsController', () => {
  let controller: MetaInsightsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetaInsightsController],
    }).compile();

    controller = module.get<MetaInsightsController>(MetaInsightsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

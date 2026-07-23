import { IsIn, IsNotEmpty, IsNumber } from 'class-validator';

export class ManualInsights {
  @IsNumber()
  @IsNotEmpty()
  workspaceId!: number;

  @IsNumber()
  @IsNotEmpty()
  page_id!: number;

  @IsNotEmpty()
  @IsIn(['facebook', 'instagram'])
  platform!: string;
}

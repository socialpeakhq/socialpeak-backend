import { IsNotEmpty, IsNumber } from 'class-validator';

export class ManualInsights {
  @IsNumber()
  @IsNotEmpty()
  workspaceId!: number;

  @IsNumber()
  @IsNotEmpty()
  page_id!: number;
}

import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class InstagramConnectDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  workspace_id!: number;
}

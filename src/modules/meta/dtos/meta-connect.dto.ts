import { Type } from 'class-transformer';
import { IsInt, IsPositive } from 'class-validator';

export class MetaConnectDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  workspace_id!: number;
}

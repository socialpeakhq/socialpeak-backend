import { IsOptional, IsString } from 'class-validator';

export class PostQueryDto {
  @IsOptional()
  @IsString()
  searchField: string = '';

  @IsOptional()
  @IsString()
  date: string = 'all';

  @IsOptional()
  @IsString()
  platforms: string = 'all';

  @IsOptional()
  @IsString()
  statuses: string = 'all';

  @IsOptional()
  @IsString()
  types: string = 'all';
}

import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateVideoPost {
  @IsNumber()
  workspace_id!: number;

  @IsString()
  file_url!: string;

  @IsString()
  description!: string;

  @IsString()
  title!: string;

  @IsBoolean()
  no_story: boolean = false;

  @IsBoolean()
  @IsOptional()
  published: boolean = true;

  @IsBoolean()
  @IsOptional()
  isScheduled: boolean = false;

  @IsOptional()
  @IsInt()
  scheduled_at?: number;

  @IsNumber()
  @IsOptional()
  timestamp!: number;

  @IsArray()
  @IsIn(['facebook', 'instagram'], { each: true })
  platforms!: ('facebook' | 'instagram')[];
}

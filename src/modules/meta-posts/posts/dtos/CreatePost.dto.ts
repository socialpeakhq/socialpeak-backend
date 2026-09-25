import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreatePostDto {
  @IsInt()
  workspace_id!: number;

  @IsString()
  caption!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media_urls!: string[];

  @IsOptional()
  @IsString()
  link!: string;

  @IsBoolean()
  published: boolean = true;

  @IsBoolean()
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

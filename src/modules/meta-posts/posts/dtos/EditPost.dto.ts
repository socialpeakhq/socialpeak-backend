import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateScheduledPostDto {
  @IsOptional() @IsString() caption?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) media_urls?: string[];
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsBoolean() no_story?: boolean;
  @IsOptional() @IsString() link?: string;
  @IsOptional()
  @IsArray()
  @IsIn(['facebook', 'instagram'], { each: true })
  platforms?: ('facebook' | 'instagram')[];
  @IsOptional() @IsInt() scheduled_at?: number;
}

import { IsArray, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class CreatePostDto {
  @IsInt()
  workspace_id!: number;

  @IsString()
  caption!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  media_urls?: string[];

  @IsArray()
  @IsIn(['facebook', 'instagram'], { each: true })
  platforms!: ('facebook' | 'instagram')[];
}

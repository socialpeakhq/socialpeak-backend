import { IsArray, IsIn, IsInt, IsString } from 'class-validator';

export class CreatePostDto {
  @IsInt()
  workspace_id!: number;

  @IsString()
  caption!: string;

  @IsArray()
  @IsString({ each: true })
  media_urls!: string[];

  @IsArray()
  @IsIn(['facebook', 'instagram'], { each: true })
  platforms!: ('facebook' | 'instagram')[];
}

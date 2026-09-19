import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateVideoPost {
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

  @IsNumber()
  @IsOptional()
  timestamp!: number;
}

import { IsString, IsUUID, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  parentId?: string;

  @IsNumber()
  displayOrder: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

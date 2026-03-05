import { IsString, IsUUID, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class UpdateCategoryDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    slug?: string;

    @IsOptional()
    @IsUUID()
    parentId?: string;

    @IsOptional()
    @IsNumber()
    displayOrder?: number;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}

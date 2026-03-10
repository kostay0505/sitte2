import { IsUUID, IsNumber, IsBoolean, IsOptional, Min, IsString, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export enum OrderBy {
    DATE = 'date',
    PRICE = 'price',
}

export enum SortDirection {
    ASC = 'asc',
    DESC = 'desc',
}

export class GetProductsDto {
    @IsOptional()
    @IsUUID()
    brandId?: string;

    @IsOptional()
    @IsString()
    sellerId?: string;

    @IsOptional()
    @IsUUID()
    categoryId?: string;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsNumber()
    priceCashFrom?: number;

    @IsOptional()
    @Transform(({ value }) => Number(value))
    @IsNumber()
    priceCashTo?: number;

    @IsOptional()
    @Transform(({ value }) => value === 'true')
    @IsBoolean()
    isFavorite?: boolean;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(OrderBy)
    orderBy?: OrderBy = OrderBy.DATE;

    @IsOptional()
    @IsEnum(SortDirection)
    sortDirection?: SortDirection = SortDirection.DESC;

    @Transform(({ value }) => Number(value))
    @IsNumber()
    @Min(1)
    limit: number = 25;

    @Transform(({ value }) => Number(value))
    @IsNumber()
    @Min(0)
    offset: number = 0;
}

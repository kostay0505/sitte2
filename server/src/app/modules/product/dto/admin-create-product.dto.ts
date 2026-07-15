import { IsString, IsNumber, IsUUID, IsEnum, IsArray, IsBoolean, IsOptional } from 'class-validator';
import { CurrencyList, QuantityType, ProductStatus } from '../types/enums';

export class AdminCreateProductDto {
    @IsString()
    userId: string;

    @IsString()
    name: string;

    @IsNumber()
    priceCash: number;

    @IsNumber()
    priceNonCash: number;

    @IsEnum(CurrencyList)
    currency: CurrencyList;

    @IsString()
    preview: string;

    @IsArray()
    files: string[];

    @IsString()
    description: string;

    @IsUUID()
    categoryId: string;

    @IsUUID()
    brandId: string;

    @IsNumber()
    quantity: number;

    @IsEnum(QuantityType)
    quantityType: QuantityType;

    @IsEnum(ProductStatus)
    status: ProductStatus;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    customId?: string;
}

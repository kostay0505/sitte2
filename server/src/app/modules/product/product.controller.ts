import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    Request,
    NotFoundException,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdminCreateProductDto } from './dto/admin-create-product.dto';
import { AdminUpdateProductDto } from './dto/admin-update-product.dto';
import { GetProductsDto } from './dto/get-products.dto';
import { DeleteProductDto } from './dto/delete-product.dto';
import { ToggleFavoriteDto } from './dto/toggle-favorite.dto';
import { MarkViewedDto } from './dto/mark-viewed.dto';
import { JwtAuth } from '../../decorators/jwt-auth.decorator';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { ProductShort, type Product } from './schemas/products';
import { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { OptionalJwtAuth } from '../../guards/optional-jwt-auth.guard';

@Controller('products')
export class ProductController {
    constructor(private readonly service: ProductService) { }

    @Get('basic-info')
    @OptionalJwtAuth()
    async getBasicInfo(@Request() req: RequestWithUser): Promise<{
        new: Array<ProductShort>;
        mainSeller: Array<ProductShort>;
        popular: Array<ProductShort>;
    }> {
        return this.service.getBasicInfo(req?.user?.tgId ?? null);
    }

    @Get('available')
    @OptionalJwtAuth()
    async findAllAvailable(
        @Request() req: RequestWithUser,
        @Query() query: GetProductsDto
    ): Promise<ProductShort[]> {
        return this.service.findAllAvailable(query, req?.user?.tgId ?? null);
    }

    @Get('my')
    @JwtAuth()
    async findAllMy(@Request() req: RequestWithUser): Promise<ProductShort[]> {
        return this.service.findAllMy(req.user.tgId);
    }

    @Get()
    @AdminJwtAuth()
    async findAll(): Promise<Product[]> {
        return this.service.findAll();
    }

    @Get(':id')
    @OptionalJwtAuth()
    async findOne(
        @Request() req: RequestWithUser,
        @Param('id') id: string
    ): Promise<Product> {
        const product = await this.service.findById(id, req?.user?.tgId ?? null);
        if (!product) {
            throw new NotFoundException('Товар не найден');
        }
        return product;
    }

    @Post()
    @JwtAuth()
    @HttpCode(HttpStatus.CREATED)
    async create(
        @Request() req: RequestWithUser,
        @Body() dto: CreateProductDto
    ): Promise<Product> {
        return this.service.create(req.user.tgId, dto);
    }

    @Put(':id')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async update(
        @Request() req: RequestWithUser,
        @Param('id') id: string,
        @Body() dto: UpdateProductDto
    ): Promise<boolean> {
        return this.service.update(req.user.tgId, id, dto);
    }

    @Put('toggle-activate/:id')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async toggleActivate(
        @Request() req: RequestWithUser,
        @Param('id') id: string
    ): Promise<boolean> {
        return this.service.toggleActivate(req.user.tgId, id);
    }

    @Delete()
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async delete(
        @Request() req: RequestWithUser,
        @Body() dto: DeleteProductDto
    ): Promise<boolean> {
        return this.service.delete(req.user.tgId, dto.id);
    }

    @Post('admin')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.CREATED)
    async adminCreate(
        @Body() dto: AdminCreateProductDto
    ): Promise<Product> {
        return this.service.adminCreate(dto);
    }

    @Put('admin/:id')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async adminUpdate(
        @Param('id') id: string,
        @Body() dto: AdminUpdateProductDto
    ): Promise<boolean> {
        return this.service.adminUpdate(id, dto);
    }

    @Post('favorite')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async toggleFavorite(
        @Request() req: RequestWithUser,
        @Body() dto: ToggleFavoriteDto
    ): Promise<boolean> {
        return this.service.toggleFavorite(req.user.tgId, dto);
    }

    @Post('viewed')
    @JwtAuth()
    @HttpCode(HttpStatus.OK)
    async markViewed(
        @Request() req: RequestWithUser,
        @Body() dto: MarkViewedDto
    ): Promise<boolean> {
        return this.service.markViewed(req.user.tgId, dto.id);
    }
}
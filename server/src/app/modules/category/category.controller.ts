import {
    Controller,
    Get,
    Post,
    Put,
    Body,
    Param,
    HttpCode,
    HttpStatus,
    NotFoundException,
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { type Category } from './schemas/categories';

@Controller('categories')
export class CategoryController {
    constructor(private readonly service: CategoryService) { }

    @Get()
    @AdminJwtAuth()
    async findAll(): Promise<Omit<Category, 'createdAt' | 'updatedAt'>[]> {
        const categories = await this.service.findAll();
        return categories;
    }

    @Get('available')
    async findAllAvailable(): Promise<Omit<Category, 'createdAt' | 'updatedAt'>[]> {
        const categories = await this.service.findAllAvailable();
        return categories;
    }

    @Get('slug/:slug')
    async getBySlug(@Param('slug') slug: string): Promise<Omit<Category, 'createdAt' | 'updatedAt'>> {
        const category = await this.service.findBySlug(slug);
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        return category;
    }

    @Get(':id')
    @AdminJwtAuth()
    async findOne(@Param('id') id: string): Promise<Omit<Category, 'createdAt' | 'updatedAt'>> {
        const category = await this.service.findById(id);
        if (!category) {
            throw new NotFoundException('Category not found');
        }
        return category;
    }

    @Post()
    @AdminJwtAuth()
    @HttpCode(HttpStatus.CREATED)
    async create(@Body() dto: CreateCategoryDto): Promise<Omit<Category, 'createdAt' | 'updatedAt'>> {
        return this.service.create(dto);
    }

    @Put(':id')
    @AdminJwtAuth()
    @HttpCode(HttpStatus.OK)
    async update(
        @Param('id') id: string,
        @Body() dto: UpdateCategoryDto
    ): Promise<Omit<Category, 'createdAt' | 'updatedAt'>> {
        await this.service.update(id, dto);
        const updatedCategory = await this.service.findById(id);
        if (!updatedCategory) {
            throw new NotFoundException('Category not found after update');
        }
        return updatedCategory;
    }
}

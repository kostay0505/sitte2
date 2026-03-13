import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Body,
  Request,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
  BadRequestException
} from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { MergeAccountsDto } from './dto/merge-accounts.dto';
import { JwtAuth } from '../../decorators/jwt-auth.decorator';
import { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import { UserShort, type User } from './schemas/users';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { OptionalJwtAuth } from '../../guards/optional-jwt-auth.guard';

@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Get('me')
  @JwtAuth()
  async getMe(@Request() req: RequestWithUser): Promise<User> {
    const user = await this.service.findByTgId(req.user.tgId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    return user;
  }

  @Get('seller/:id')
  @OptionalJwtAuth()
  async getSeller(@Param('id') id: string): Promise<UserShort> {
    let user = await this.service.findShortByTgId(id);

    if (!user && id.length === 12) {
      const fullUser = await this.service.findByShortHash(id);
      if (fullUser) {
        user = await this.service.findShortByTgId(fullUser.tgId);
      }
    }

    if (!user) {
      throw new Error('Пользователь не найден');
    }
    return user;
  }

  @Put()
  @JwtAuth()
  @HttpCode(HttpStatus.OK)
  async update(
    @Request() req: RequestWithUser,
    @Body() dto: UpdateUserDto
  ): Promise<boolean> {
    return this.service.update(req.user.tgId, dto);
  }

  @Post('merge')
  @JwtAuth()
  @HttpCode(HttpStatus.OK)
  async mergeAccounts(
    @Request() req: RequestWithUser,
    @Body() dto: MergeAccountsDto
  ): Promise<User> {
    return this.service.mergeAccountsWithPassword(
      req.user.tgId,
      dto.email,
      dto.password
    );
  }

  @Get()
  @AdminJwtAuth()
  async findAll(): Promise<User[]> {
    return this.service.findAll();
  }

  @Put(':tgId')
  @AdminJwtAuth()
  @HttpCode(HttpStatus.OK)
  async updateUser(
    @Param('tgId') tgId: string,
    @Body() dto: UpdateUserDto
  ): Promise<boolean> {
    return this.service.update(tgId, dto);
  }

  @Post(':tgId/activate')
  @AdminJwtAuth()
  @HttpCode(HttpStatus.OK)
  async activateUser(@Param('tgId') tgId: string): Promise<void> {
    await this.service.activateUser(tgId);
  }

  @Post(':tgId/deactivate')
  @AdminJwtAuth()
  @HttpCode(HttpStatus.OK)
  async deactivateUser(@Param('tgId') tgId: string): Promise<void> {
    await this.service.deactivateUser(tgId);
  }

  @Post(':tgId/ban')
  @AdminJwtAuth()
  @HttpCode(HttpStatus.OK)
  async banUser(@Param('tgId') tgId: string): Promise<void> {
    await this.service.banUser(tgId);
  }

  @Post(':tgId/unban')
  @AdminJwtAuth()
  @HttpCode(HttpStatus.OK)
  async unbanUser(@Param('tgId') tgId: string): Promise<void> {
    await this.service.unbanUser(tgId);
  }

  @Patch(':tgId/role')
  @AdminJwtAuth()
  @HttpCode(HttpStatus.OK)
  async updateRole(
    @Param('tgId') tgId: string,
    @Body('role') role: string
  ): Promise<void> {
    const allowed = ['user', 'shop', 'admin'];
    if (!allowed.includes(role)) {
      throw new BadRequestException(`Недопустимая роль: ${role}`);
    }
    await this.service.updateRole(tgId, role);
  }
}

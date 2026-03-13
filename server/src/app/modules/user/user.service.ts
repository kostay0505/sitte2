import {
  Injectable,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef
} from '@nestjs/common';
import { type User, UserShort } from './schemas/users';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRepository } from './user.repository';
import * as crypto from 'crypto';
import { MailService } from '../../services/mail/mail.service';
import { TelegramBot } from '../telegram/telegram.bot';

@Injectable()
export class UserService {
  private readonly adminIds: string[];

  constructor(
    private readonly userRepository: UserRepository,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => TelegramBot))
    private readonly telegramBot: TelegramBot
  ) {
    if (!process.env.TELEGRAM_ADMIN_IDS) {
      throw new Error('Admin ids env is empty. Please set in ENV');
    }

    this.adminIds = process.env.TELEGRAM_ADMIN_IDS?.split(',') || [];
  }

  async findOrCreate(dto: CreateUserDto): Promise<User> {
    const existingUser = await this.userRepository.findById(dto.tgId);

    if (existingUser) {
      return existingUser;
    }

    return this.userRepository.create(dto);
  }

  async findByTgId(tgId: string): Promise<User | null> {
    return this.userRepository.findById(tgId);
  }

  async findShortByTgId(tgId: string): Promise<UserShort | null> {
    return this.userRepository.findShortById(tgId);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async findByShortHash(shortHash: string): Promise<User | null> {
    return this.userRepository.findByShortHash(shortHash);
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  async update(tgId: string, dto: UpdateUserDto): Promise<boolean> {
    const currentUser = await this.findByTgId(tgId);
    if (!currentUser) {
      throw new BadRequestException('Пользователь не найден');
    }

    if (dto.email !== undefined && dto.email !== currentUser.email) {
      const newEmail = dto.email?.trim() || null;

      if (currentUser.emailVerified && currentUser.email) {
        throw new BadRequestException('Нельзя изменить подтвержденный email');
      }

      if (newEmail) {
        const existingUser = await this.findByEmail(newEmail);

        if (existingUser && existingUser.tgId !== tgId) {
          if (existingUser.emailVerified) {
            if (existingUser.username !== null) {
              throw new ConflictException(
                'Email привязан к другому Telegram аккаунту'
              );
            } else {
              throw new BadRequestException(
                'Email привязан к другому аккаунту'
              );
            }
          } else {
            const verificationCode = crypto
              .randomBytes(3)
              .toString('hex')
              .toUpperCase();

            await this.userRepository.update(tgId, {
              ...dto,
              email: newEmail,
              emailVerified: false,
              emailVerificationCode: verificationCode
            });

            await this.mailService.sendEmailVerification(
              newEmail,
              verificationCode
            );

            return true;
          }
        } else {
          const verificationCode = crypto
            .randomBytes(3)
            .toString('hex')
            .toUpperCase();

          await this.userRepository.update(tgId, {
            ...dto,
            email: newEmail,
            emailVerified: false,
            emailVerificationCode: verificationCode
          });

          await this.mailService.sendEmailVerification(
            newEmail,
            verificationCode
          );

          return true;
        }
      } else {
        await this.userRepository.update(tgId, {
          ...dto,
          email: null,
          emailVerified: false,
          emailVerificationCode: null
        });

        return true;
      }
    }

    return this.userRepository.update(tgId, dto);
  }

  async mergeAccountsWithPassword(
    telegramTgId: string,
    email: string,
    password: string
  ): Promise<User> {
    const telegramUser = await this.findByTgId(telegramTgId);
    if (!telegramUser) {
      throw new BadRequestException('Telegram пользователь не найден');
    }

    const emailUser = await this.findByEmail(email);
    if (!emailUser) {
      throw new BadRequestException('Пользователь с таким email не найден');
    }

    if (emailUser.tgId === telegramTgId) {
      return telegramUser;
    }

    if (!emailUser.emailVerified) {
      throw new BadRequestException('Email не подтвержден');
    }

    if (emailUser.username) {
      throw new ConflictException('Email привязан к другому Telegram аккаунту');
    }

    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');
    if (emailUser.passwordHash !== passwordHash) {
      throw new BadRequestException('Неверный пароль');
    }

    return this.userRepository.mergeAccounts(telegramUser, emailUser);
  }

  async updateUsername(tgId: string, username: string): Promise<boolean> {
    return this.userRepository.update(tgId, { username } as UpdateUserDto);
  }

  async activateUser(tgId: string): Promise<void> {
    await this.userRepository.update(tgId, { isActive: true } as UpdateUserDto);
  }

  async deactivateUser(tgId: string): Promise<void> {
    await this.userRepository.update(tgId, {
      isActive: false
    } as UpdateUserDto);
  }

  async banUser(tgId: string): Promise<void> {
    await this.userRepository.update(tgId, {
      isBanned: true,
      subscribedToNewsletter: false
    } as UpdateUserDto);

    if (!tgId.startsWith('email:')) {
      await this.telegramBot
        .getBotApi()
        .sendMessage(
          tgId,
          'Вы получили бан на нашей платформе. Обратитесь к администратору проекта.'
        );
    }
  }

  async updateRole(tgId: string, role: string): Promise<void> {
    await this.userRepository.update(tgId, { role } as UpdateUserDto);
  }

  async unbanUser(tgId: string): Promise<void> {
    await this.userRepository.update(tgId, {
      isBanned: false
    } as UpdateUserDto);

    if (!tgId.startsWith('email:')) {
      await this.telegramBot
        .getBotApi()
        .sendMessage(
          tgId,
          'Ваш аккаунт Touring Expert снова активен. Вы можете продолжить пользоваться сервисом.'
        );
    }
  }

  async getIdsForBroadcastBatch(
    offset: number,
    limit: number,
    userIds?: string[]
  ): Promise<string[]> {
    return this.userRepository.getIdsForBroadcastBatch(offset, limit, userIds);
  }

  isAdmin(tgId: string): boolean {
    return this.adminIds.includes(tgId);
  }

  getAdminIds(): string[] {
    return this.adminIds;
  }

  async getStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    usersByLangCode: Record<string, number>;
  }> {
    return this.userRepository.getStats();
  }

  async transferUserData(oldTgId: string, newTgId: string): Promise<void> {
    return this.userRepository.transferUserData(oldTgId, newTgId);
  }

  async mergeAccounts(telegramUser: User, emailUser: User): Promise<User> {
    return this.userRepository.mergeAccounts(telegramUser, emailUser);
  }
}

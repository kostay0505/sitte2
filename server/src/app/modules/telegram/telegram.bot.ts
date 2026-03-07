import { Bot, BotError, InlineKeyboard, type Context } from 'grammy';
import { BOT_COMMANDS } from './bot.commands';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { CreateUserDto } from '../user/dto/create-user.dto';
import { type User } from '../user/schemas/users';
import { UserService } from '../user/user.service';
import { BroadcastHandler } from './broadcast/broadcast.handler';
import { ModerationService } from './moderation/moderation.service';
import { ProductService } from '../product/product.service';
import { BrandService } from '../brand/brand.service';

@Injectable()
export class TelegramBot {
  private readonly logger = new Logger(TelegramBot.name);

  private readonly bot: Bot;
  readonly chatId: string;
  private readonly adminIds: string[];
  private readonly appUrl: string;
  private cachedBotInfo: { username: string } | null = null;

  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
    @Inject(forwardRef(() => BrandService))
    private readonly brandService: BrandService,
    private readonly broadcastHandler: BroadcastHandler,
    @Inject(forwardRef(() => ModerationService))
    private readonly moderationService: ModerationService
  ) {
    if (
      !process.env.TELEGRAM_BOT_TOKEN ||
      !process.env.TELEGRAM_CHAT_ID ||
      !process.env.TELEGRAM_ADMIN_IDS ||
      !process.env.APP_URL
    ) {
      throw new Error('Main telegram bot env is empty. Please set in ENV');
    }
    this.chatId = process.env.TELEGRAM_CHAT_ID;
    this.adminIds = (process.env.TELEGRAM_ADMIN_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    this.appUrl = process.env.APP_URL;
    this.bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

    this.initializeBot();
  }

  private initializeBot(): void {
    this.userHandler();
    this.setupAdminHandlers();
    this.setupBroadcastHandlers();
    this.setupModerationHandlers();
    this.bot.start();

    this.bot.catch((err: BotError) => {
      const ctx = err.ctx;
      const error: any = err.error;
      if (
        error.error_code === 403 &&
        error.description?.includes('bot was blocked')
      ) {
        if (ctx?.from?.id) {
          this.userService.deactivateUser(ctx.from.id.toString());
        }
        this.logger.error(`User ${ctx?.from?.id} has blocked the bot.`);
      } else {
        this.logger.error(`An error occurred: ${err.stack}`);
      }
    });
  }

  /*
  --- USER --- 
  */

  private userHandler(): void {
    this.bot.command(BOT_COMMANDS.START, async context => {
      await this.commandStart(context);
    });
  }

  /*
  --- ADMIN --- 
  */

  private setupAdminHandlers(): void {
    this.bot.command(BOT_COMMANDS.STATS, async ctx => {
      await this.commandStats(ctx);
    });
  }

  private setupBroadcastHandlers(): void {
    this.bot.command(BOT_COMMANDS.BROADCAST, async ctx => {
      await this.broadcastHandler.handleBroadcast(ctx, 'all');
    });

    this.bot.on('message:text', async ctx => {
      if (ctx.message.text.startsWith('/broadcast_retry_')) {
        await this.broadcastHandler.handleBroadcastRetry(ctx);
      }
    });
  }

  private setupModerationHandlers(): void {
    this.bot.on('callback_query', async ctx => {
      const callbackData = ctx.callbackQuery.data;

      if (!callbackData) return;

      if (callbackData.startsWith(BOT_COMMANDS.APPROVE_PRODUCT)) {
        await this.handleApproveProduct(ctx);
      } else if (callbackData.startsWith(BOT_COMMANDS.REJECT_PRODUCT)) {
        await this.handleRejectProduct(ctx);
      }
    });
  }

  private async handleApproveProduct(ctx: Context): Promise<void> {
    if (!ctx?.from?.id || !ctx.callbackQuery?.data) return;
    const userId = ctx.from.id.toString();
    if (!this.userService.isAdmin(userId)) {
      await ctx.answerCallbackQuery(
        'У вас нет прав для выполнения этой команды.'
      );
      return;
    }

    const callbackData = ctx.callbackQuery.data;
    const productId = callbackData.split('_')[2];

    if (!productId) {
      await ctx.answerCallbackQuery('Неверный ID объявления.');
      return;
    }

    try {
      await this.moderationService.approveProduct(productId);

      const message = ctx.callbackQuery.message;
      if (message && 'text' in message) {
        const updatedText = message.text + '\n\n✅ ОДОБРЕНО';
        await ctx.editMessageText(updatedText, { reply_markup: undefined });
      }

      await ctx.answerCallbackQuery('Объявление одобрено!');
    } catch (error) {
      this.logger.error('Ошибка при одобрении объявления:', error);
      await ctx.answerCallbackQuery(
        'Произошла ошибка при одобрении объявления.'
      );
    }
  }

  private async handleRejectProduct(ctx: Context): Promise<void> {
    if (!ctx?.from?.id || !ctx.callbackQuery?.data) return;

    const userId = ctx.from.id.toString();
    if (!this.userService.isAdmin(userId)) {
      await ctx.answerCallbackQuery(
        'У вас нет прав для выполнения этой команды.'
      );
      return;
    }

    const callbackData = ctx.callbackQuery.data;
    const productId = callbackData.split('_')[2];

    if (!productId) {
      await ctx.answerCallbackQuery('Неверный ID объявления.');
      return;
    }

    try {
      await this.moderationService.rejectProduct(productId);

      const message = ctx.callbackQuery.message;
      if (message && 'text' in message) {
        const updatedText = message.text + '\n\n❌ ОТКЛОНЕНО';
        await ctx.editMessageText(updatedText, { reply_markup: undefined });
      }

      await ctx.answerCallbackQuery('Объявление отклонено!');
    } catch (error) {
      this.logger.error('Ошибка при отклонении объявления:', error);
      await ctx.answerCallbackQuery(
        'Произошла ошибка при отклонении объявления.'
      );
    }
  }

  private async commandStart(context: Context): Promise<void> {
    if (!context?.chatId) {
      return;
    }

    const invatedBy = this.extractRefCode(context.message?.text);
    const user = await this.getTgUser(context?.chatId, context, invatedBy);
    if (!user || user.isBanned) {
      return;
    }
    if (!user.isActive) {
      await this.userService.activateUser(user.tgId);
    }

    if (invatedBy) {
      const handled = await this.handleInvitationCode(context, invatedBy);
      if (handled) {
        return;
      }
    }

    const message = `${user.firstName}, привет!`;
    const keyboard = new InlineKeyboard().webApp(
      'Открыть приложение',
      this.appUrl
    );

    await context.reply(message, { reply_markup: keyboard });
  }

  private async handleInvitationCode(context: Context, invatedBy: string): Promise<boolean> {
    const handlers = {
      [BOT_COMMANDS.SHARE_PRODUCT]: (id: string) => this.handleProductUnit(context, id),
      [BOT_COMMANDS.SHARE_BRAND]: (id: string) => this.handleBrandUnit(context, id),
      [BOT_COMMANDS.SHARE_SELLER]: (id: string) => this.handleSellerUnit(context, id)
    };

    for (const [prefix, handler] of Object.entries(handlers)) {
      if (invatedBy.startsWith(prefix)) {
        const id = invatedBy.replace(prefix, '');
        await handler(id);
        return true;
      }
    }

    return false;
  }

  private async handleBrandUnit(context: Context, id: string): Promise<void> {
    try {
      const brand = await this.brandService.findById(id);
      const appUrl = this.appUrl.endsWith('/') ? this.appUrl : `${this.appUrl}/`;
      const message = `Перейти к товарам бренда "${brand?.name}"`;
      const keyboard = new InlineKeyboard().webApp(
        'Перейти на страницу бренда',
        `${appUrl}catalog/brands/${id}`
      );
      await context.reply(message, { reply_markup: keyboard });
    } catch (error) {
      this.logger.error(`Error handling code access: ${error.message}`);
      await context.reply(
        '❌ Произошла ошибка при обработке. Попробуйте позже.'
      );
    }
  }
  private async handleSellerUnit(context: Context, id: string): Promise<void> {
    try {
      let seller = await this.userService.findByTgId(id);
      let sellerId = id;
      
      if (!seller && id.length === 12) {
        seller = await this.userService.findByShortHash(id);
        if (seller) {
          sellerId = id;
        }
      }
      
      if (!seller) {
        await context.reply('Продавец не найден');
        return;
      }
      
      if (seller.tgId.startsWith('email:')) {
        const crypto = require('crypto');
        const uuid = seller.tgId.replace('email:', '');
        const hash = crypto.createHash('sha256').update(uuid).digest('hex');
        sellerId = hash.substring(0, 12);
      }
      
      const appUrl = this.appUrl.endsWith('/') ? this.appUrl : `${this.appUrl}/`;
      const message = `Перейти к продавцу "${seller?.firstName || 'Продавец'}"`;
      const keyboard = new InlineKeyboard().webApp(
        'Перейти на страницу продaвца',
        `${appUrl}/catalog/seller/${sellerId}`
      );
      await context.reply(message, { reply_markup: keyboard });
    } catch (error) {
      this.logger.error(`Error handling code access: ${error.message}`);
      await context.reply(
        '❌ Произошла ошибка при обработке. Попробуйте позже.'
      );
    }
  }
  private async handleProductUnit(context: Context, id: string): Promise<void> {
    try {
      const product = await this.productService.findById(id);
      const appUrl = this.appUrl.endsWith('/') ? this.appUrl : `${this.appUrl}/`;
      const message = `Перейти к товару "${product?.name}"`;
      const keyboard = new InlineKeyboard().webApp(
        'Перейти на страницу товара',
        `${appUrl}catalog/${id}`
      );
      await context.reply(message, { reply_markup: keyboard });
    } catch (error) {
      this.logger.error(`Error handling code access: ${error.message}`);
      await context.reply(
        '❌ Произошла ошибка при обработке. Попробуйте позже.'
      );
    }
  }
  private async commandStats(context: Context): Promise<void> {
    if (!context?.from?.id) {
      return;
    }

    const userId = context.from.id.toString();

    if (!this.userService.isAdmin(userId)) {
      await context.reply('У вас нет прав для выполнения этой команды.');
      return;
    }

    try {
      const stats = await this.userService.getStats();

      const langCodeStatsText = Object.entries(stats.usersByLangCode)
        .map(([lang, count]) => `  - ${lang}: ${count}`)
        .join('\n');

      const message =
        `Статистика пользователей:` +
        `\nВсего пользователей: ${stats.totalUsers}` +
        `\n✅ Активных: ${stats.activeUsers}` +
        `\n❌ Неактивных: ${stats.inactiveUsers}` +
        `\nПо языкам:\n${langCodeStatsText || 'Нет данных'}`;

      await context.reply(message);
    } catch (error) {
      this.logger.error('Ошибка при получении статистики:', error);
      await context.reply('Произошла ошибка при получении статистики.');
    }
  }

  private extractRefCode(message: string | undefined): string {
    if (message && message.startsWith(`/${BOT_COMMANDS.START} `)) {
      return message.substring(7);
    }
    return '';
  }

  private async getTgUser(
    chatId: number,
    context: Context | undefined,
    invatedBy?: string | null
  ): Promise<User | null> {
    const user = context?.from;
    if (!user) {
      await this.bot.api.sendMessage(
        chatId,
        `Oops! You are hidden under masks of shadows. Please write from another account or device.`
      );
      await this.logger.error(
        `Error: Info about user (tgId: ${chatId}) is hidden.`
      );
      return null;
    }

    const dto: CreateUserDto = {
      tgId: user.id.toString(),
      username: user.username ?? null,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      photoUrl: null,
      email: null,
      phone: null,
      cityId: null,
      langCode: user.language_code ?? null,
      invitedBy: invatedBy || null,
      subscribedToNewsletter: true
    };

    return await this.userService.findOrCreate(dto);
  }

  getBotApi() {
    return this.bot.api;
  }
  public async getBotInfo(): Promise<{ username: string }> {
    if (this.cachedBotInfo) return this.cachedBotInfo;
    try {
      const botInfo = await this.bot.api.getMe();
      this.cachedBotInfo = { username: botInfo.username };
      return this.cachedBotInfo;
    } catch (error) {
      this.logger.error(`Error getting bot info: ${error.message}`);
      throw new Error('Не удалось получить информацию о боте');
    }
  }
}

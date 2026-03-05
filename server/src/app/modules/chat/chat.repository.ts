import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../../../database/schema';

@Injectable()
export class ChatRepository {
  constructor(@Inject('DATABASE') private db: Database) {}

  private rows(result: any): any[] {
    return result[0] as unknown as any[];
  }

  async findOrCreateChat(productId: string, buyerId: string, sellerId: string) {
    const existing = await this.db.execute(
      sql`SELECT id, productId, buyerId, sellerId, unreadBuyer, unreadSeller, lastMessageAt, createdAt
          FROM Chats WHERE productId = ${productId} AND buyerId = ${buyerId} LIMIT 1`
    );
    const rows = this.rows(existing);
    if (rows.length > 0) return rows[0];

    const id = crypto.randomUUID();
    await this.db.execute(
      sql`INSERT INTO Chats (id, productId, buyerId, sellerId, unreadBuyer, unreadSeller, lastMessageAt, createdAt)
          VALUES (${id}, ${productId}, ${buyerId}, ${sellerId}, 0, 0, NOW(), NOW())`
    );
    const created = await this.db.execute(
      sql`SELECT id, productId, buyerId, sellerId, unreadBuyer, unreadSeller, lastMessageAt, createdAt
          FROM Chats WHERE id = ${id} LIMIT 1`
    );
    return this.rows(created)[0];
  }

  async getChatsForUser(userId: string, cursor?: string) {
    const limit = 20;
    let rows: any[];
    if (cursor) {
      const result = await this.db.execute(
        sql`SELECT c.id, c.productId, c.buyerId, c.sellerId, c.unreadBuyer, c.unreadSeller, c.lastMessageAt, c.createdAt,
                   p.name as productName, p.preview as productPreview,
                   buyer.firstName as buyerFirstName, buyer.username as buyerUsername, buyer.photoUrl as buyerPhoto,
                   seller.firstName as sellerFirstName, seller.username as sellerUsername, seller.photoUrl as sellerPhoto,
                   (SELECT body FROM Messages m WHERE m.chatId = c.id ORDER BY m.createdAt DESC LIMIT 1) as lastMessage
            FROM Chats c
            LEFT JOIN Products p ON p.id = c.productId
            LEFT JOIN Users buyer ON buyer.tgId = c.buyerId
            LEFT JOIN Users seller ON seller.tgId = c.sellerId
            WHERE (c.buyerId = ${userId} OR c.sellerId = ${userId})
              AND c.lastMessageAt < (SELECT lastMessageAt FROM Chats WHERE id = ${cursor} LIMIT 1)
            ORDER BY c.lastMessageAt DESC
            LIMIT ${limit}`
      );
      rows = this.rows(result);
    } else {
      const result = await this.db.execute(
        sql`SELECT c.id, c.productId, c.buyerId, c.sellerId, c.unreadBuyer, c.unreadSeller, c.lastMessageAt, c.createdAt,
                   p.name as productName, p.preview as productPreview,
                   buyer.firstName as buyerFirstName, buyer.username as buyerUsername, buyer.photoUrl as buyerPhoto,
                   seller.firstName as sellerFirstName, seller.username as sellerUsername, seller.photoUrl as sellerPhoto,
                   (SELECT body FROM Messages m WHERE m.chatId = c.id ORDER BY m.createdAt DESC LIMIT 1) as lastMessage
            FROM Chats c
            LEFT JOIN Products p ON p.id = c.productId
            LEFT JOIN Users buyer ON buyer.tgId = c.buyerId
            LEFT JOIN Users seller ON seller.tgId = c.sellerId
            WHERE (c.buyerId = ${userId} OR c.sellerId = ${userId})
            ORDER BY c.lastMessageAt DESC
            LIMIT ${limit}`
      );
      rows = this.rows(result);
    }
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return { items: rows, nextCursor };
  }

    async getMessages(chatId: string, cursor?: string, limit = 100) {
    const result = await this.db.execute(
      sql`SELECT id, chatId, senderId, body, imageUrl, isRead, createdAt
          FROM Messages
          WHERE chatId = ${chatId}
          ORDER BY createdAt ASC
          LIMIT ${limit}`
    );
    const rows = this.rows(result);
    return { items: rows, nextCursor: null };
  }

  
  async createMessage(chatId: string, senderId: string, body: string | null, imageUrl: string | null, sellerId: string, buyerId: string) {
    const id = crypto.randomUUID();
    await this.db.execute(
      sql`INSERT INTO Messages (id, chatId, senderId, body, imageUrl, isRead, createdAt)
          VALUES (${id}, ${chatId}, ${senderId}, ${body}, ${imageUrl}, false, NOW())`
    );
    if (senderId === sellerId) {
      await this.db.execute(
        sql`UPDATE Chats SET lastMessageAt = NOW(), unreadBuyer = unreadBuyer + 1 WHERE id = ${chatId}`
      );
    } else {
      await this.db.execute(
        sql`UPDATE Chats SET lastMessageAt = NOW(), unreadSeller = unreadSeller + 1 WHERE id = ${chatId}`
      );
    }
    const result = await this.db.execute(
      sql`SELECT id, chatId, senderId, body, imageUrl, isRead, createdAt FROM Messages WHERE id = ${id} LIMIT 1`
    );
    return this.rows(result)[0];
  }

  async markRead(chatId: string, userId: string, chat: any) {
    if (chat.buyerId === userId) {
      await this.db.execute(sql`UPDATE Chats SET unreadBuyer = 0 WHERE id = ${chatId}`);
    } else {
      await this.db.execute(sql`UPDATE Chats SET unreadSeller = 0 WHERE id = ${chatId}`);
    }
  }

  async getChatById(chatId: string) {
    const result = await this.db.execute(
      sql`SELECT c.id, c.productId, c.buyerId, c.sellerId, c.unreadBuyer, c.unreadSeller, c.lastMessageAt, c.createdAt,
                 p.name as productName, p.preview as productPreview,
                 buyer.firstName as buyerFirstName, buyer.username as buyerUsername, buyer.photoUrl as buyerPhoto,
                 seller.firstName as sellerFirstName, seller.username as sellerUsername, seller.photoUrl as sellerPhoto,
                 seller.tgId as sellerTgId
          FROM Chats c
          LEFT JOIN Products p ON p.id = c.productId
          LEFT JOIN Users buyer ON buyer.tgId = c.buyerId
          LEFT JOIN Users seller ON seller.tgId = c.sellerId
          WHERE c.id = ${chatId} LIMIT 1`
    );
    const rows = this.rows(result);
    return rows[0] ?? null;
  }

  async getMessageCount(chatId: string): Promise<number> {
    const result = await this.db.execute(
      sql`SELECT COUNT(*) as cnt FROM Messages WHERE chatId = ${chatId}`
    );
    return Number(this.rows(result)[0]?.cnt ?? 0);
  }
}

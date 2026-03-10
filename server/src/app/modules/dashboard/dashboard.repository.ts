import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Database } from '../../../database/schema';

@Injectable()
export class DashboardRepository {
  constructor(@Inject('DATABASE') private db: Database) {}

  private rows(result: any): any[] {
    return result[0] as unknown as any[];
  }

  private esc(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  async ensureTasksTable() {
    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS DashboardTasks (
        id VARCHAR(36) NOT NULL PRIMARY KEY,
        text TEXT NOT NULL,
        completed TINYINT NOT NULL DEFAULT 0,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
  }

  async getOverallStats() {
    const dealStats = await this.db.execute(sql`
      SELECT stage, COUNT(*) AS cnt FROM CrmDeals GROUP BY stage
    `);
    const rows = this.rows(dealStats);
    const byStage: Record<string, number> = {};
    for (const r of rows) byStage[r.stage] = Number(r.cnt);

    const usersResult = await this.db.execute(sql`SELECT COUNT(*) AS cnt FROM Users`);
    const productsResult = await this.db.execute(sql`SELECT COUNT(*) AS cnt FROM Products`);

    return {
      completed: byStage['completed'] ?? 0,
      lost: byStage['lost'] ?? 0,
      leads: byStage['lead'] ?? 0,
      negotiation: byStage['negotiation'] ?? 0,
      agreed: byStage['agreed'] ?? 0,
      paid: byStage['paid'] ?? 0,
      totalUsers: Number(this.rows(usersResult)[0]?.cnt ?? 0),
      totalProducts: Number(this.rows(productsResult)[0]?.cnt ?? 0),
    };
  }

  async getWeeklyViews() {
    const result = await this.db.execute(sql`
      SELECT
        DATE(createdAt) AS day,
        COUNT(*) AS views
      FROM ViewedProducts
      WHERE createdAt >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(createdAt)
      ORDER BY day ASC
    `);
    return this.rows(result);
  }

  async getTasks() {
    const result = await this.db.execute(sql`
      SELECT id, text, completed, createdAt FROM DashboardTasks ORDER BY createdAt DESC
    `);
    return this.rows(result);
  }

  async createTask(text: string) {
    const id = crypto.randomUUID();
    await this.db.execute(sql`
      INSERT INTO DashboardTasks (id, text, completed, createdAt) VALUES (${id}, ${text}, 0, NOW())
    `);
    const result = await this.db.execute(sql`
      SELECT id, text, completed, createdAt FROM DashboardTasks WHERE id = ${id}
    `);
    return this.rows(result)[0];
  }

  async updateTask(id: string, data: { text?: string; completed?: boolean }) {
    const sets: string[] = [];
    if (data.text !== undefined) sets.push(`text = '${this.esc(data.text)}'`);
    if (data.completed !== undefined) sets.push(`completed = ${data.completed ? 1 : 0}`);
    if (sets.length === 0) return null;
    await this.db.execute(sql`
      UPDATE DashboardTasks SET ${sql.raw(sets.join(', '))} WHERE id = ${id}
    `);
    const result = await this.db.execute(sql`
      SELECT id, text, completed, createdAt FROM DashboardTasks WHERE id = ${id}
    `);
    return this.rows(result)[0];
  }

  async deleteTask(id: string) {
    await this.db.execute(sql`DELETE FROM DashboardTasks WHERE id = ${id}`);
  }

  async getNotifications() {
    const newUsers = await this.db.execute(sql`
      SELECT 'new_user' AS type,
        COALESCE(firstName, username, 'Пользователь') AS title,
        createdAt
      FROM Users ORDER BY createdAt DESC LIMIT 5
    `);
    const newLeads = await this.db.execute(sql`
      SELECT 'new_lead' AS type,
        COALESCE(title, 'Новая сделка') AS title,
        createdAt
      FROM CrmDeals WHERE stage = 'lead' ORDER BY createdAt DESC LIMIT 5
    `);
    const newProducts = await this.db.execute(sql`
      SELECT 'new_product' AS type, name AS title, createdAt
      FROM Products ORDER BY createdAt DESC LIMIT 5
    `);
    const all = [
      ...this.rows(newUsers),
      ...this.rows(newLeads),
      ...this.rows(newProducts),
    ];
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return all.slice(0, 10);
  }

  async getActiveLeads() {
    const result = await this.db.execute(sql`
      SELECT
        d.id, d.title, d.stage, d.amount, d.currency, d.createdAt, d.updatedAt,
        buyer.firstName AS buyerFirstName, buyer.username AS buyerUsername, buyer.photoUrl AS buyerPhoto,
        p.name AS productName, p.preview AS productPreview
      FROM CrmDeals d
      LEFT JOIN Users buyer ON buyer.tgId = d.buyerId
      LEFT JOIN Products p ON p.id = d.productId
      WHERE d.stage NOT IN ('completed', 'lost')
      ORDER BY d.updatedAt DESC
      LIMIT 20
    `);
    return this.rows(result);
  }
}

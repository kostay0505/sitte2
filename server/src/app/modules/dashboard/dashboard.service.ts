import { Injectable, OnModuleInit } from '@nestjs/common';
import { DashboardRepository } from './dashboard.repository';

@Injectable()
export class DashboardService implements OnModuleInit {
  constructor(private readonly repo: DashboardRepository) {}

  async onModuleInit() {
    await this.repo.ensureTasksTable();
  }

  getStats() { return this.repo.getOverallStats(); }
  getWeeklyViews() { return this.repo.getWeeklyViews(); }
  getTasks() { return this.repo.getTasks(); }
  createTask(text: string) { return this.repo.createTask(text); }
  updateTask(id: string, data: { text?: string; completed?: boolean }) { return this.repo.updateTask(id, data); }
  deleteTask(id: string) { return this.repo.deleteTask(id); }
  getNotifications() { return this.repo.getNotifications(); }
  getActiveLeads() { return this.repo.getActiveLeads(); }
}

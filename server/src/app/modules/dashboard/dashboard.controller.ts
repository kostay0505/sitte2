import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminJwtAuth } from '../../decorators/admin-jwt-auth.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@AdminJwtAuth()
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get('stats')
  getStats() { return this.svc.getStats(); }

  @Get('weekly-views')
  getWeeklyViews() { return this.svc.getWeeklyViews(); }

  @Get('tasks')
  getTasks() { return this.svc.getTasks(); }

  @Post('tasks')
  createTask(@Body('text') text: string) { return this.svc.createTask(text); }

  @Patch('tasks/:id')
  updateTask(@Param('id') id: string, @Body() body: { text?: string; completed?: boolean }) {
    return this.svc.updateTask(id, body);
  }

  @Delete('tasks/:id')
  deleteTask(@Param('id') id: string) { return this.svc.deleteTask(id); }

  @Get('notifications')
  getNotifications() { return this.svc.getNotifications(); }

  @Get('active-leads')
  getActiveLeads() { return this.svc.getActiveLeads(); }
}

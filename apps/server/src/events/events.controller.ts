import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { EVENT_CATEGORIES, type EventCategory } from '@meets/shared';
import { AuthGuard, CurrentUserId } from '../auth/auth.guard';
import { EventReportDto } from './events.dto';
import { EventsService } from './events.service';

/** 사용자 앱: 행사 선택과 행사 제보 */
@Controller()
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get('events')
  list(@Query('q') q?: string, @Query('category') category?: string) {
    const cat = EVENT_CATEGORIES.includes(category as EventCategory) ? (category as EventCategory) : undefined;
    return this.events.list({ q: typeof q === 'string' ? q : '', category: cat });
  }

  @Get('events/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.events.detail(id);
  }

  @Post('event-reports')
  @HttpCode(200)
  report(@CurrentUserId() userId: string, @Body() body: EventReportDto) {
    return this.events.report(userId, body);
  }
}

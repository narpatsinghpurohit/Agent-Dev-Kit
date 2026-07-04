import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  QueueEntryCreateDto,
  QueueEntryDto,
  QueueEntryUpdateDto,
  QueueListResponseDto,
} from './dto/queue.dto';
import { QueueService } from './queue.service';

// No @Public() anywhere here — the global AuthGuard protects every route.
@ApiTags('queue')
@ApiBearerAuth()
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /** Today's queue (current UTC day), earliest scheduledAt first. */
  @Get()
  @ZodResponse({ status: 200, type: QueueListResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.queueService.listToday(user.userId);
  }

  @Post()
  @ZodResponse({ status: 201, type: QueueEntryDto })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: QueueEntryCreateDto) {
    return this.queueService.create(user.userId, body);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: QueueEntryDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: QueueEntryUpdateDto,
  ) {
    return this.queueService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.queueService.delete(user.userId, id);
  }
}

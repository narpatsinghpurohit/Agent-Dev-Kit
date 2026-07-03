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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  TaskCreateDto,
  TaskDto,
  TaskListQueryDto,
  TaskListResponseDto,
  TaskUpdateDto,
} from './dto/tasks.dto';
import { TasksService } from './tasks.service';

// No @Public() anywhere here — the global AuthGuard protects every route.
@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ZodResponse({ status: 200, type: TaskListResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: TaskListQueryDto) {
    return this.tasksService.list(user.userId, query);
  }

  @Post()
  @ZodResponse({ status: 201, type: TaskDto })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: TaskCreateDto) {
    return this.tasksService.create(user.userId, body);
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: TaskDto })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasksService.get(user.userId, id);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: TaskDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: TaskUpdateDto,
  ) {
    return this.tasksService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.tasksService.delete(user.userId, id);
  }
}

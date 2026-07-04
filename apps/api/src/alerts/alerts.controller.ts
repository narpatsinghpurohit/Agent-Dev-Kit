import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';
import { AlertsListResponseDto } from './dto/alerts.dto';

// No @Public() anywhere here — the global AuthGuard protects every route.
@ApiTags('alerts')
@ApiBearerAuth()
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @ZodResponse({ status: 200, type: AlertsListResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.alertsService.list(user.userId);
  }

  @Post(':id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.alertsService.dismiss(user.userId, id);
  }
}

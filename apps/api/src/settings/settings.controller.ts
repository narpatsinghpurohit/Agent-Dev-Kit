import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { SettingsResponseSchema, SettingsUpdateSchema } from '@repo/schemas';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AdminGuard } from '../common/guards/admin.guard';
import { SettingsService } from './settings.service';

class SettingsResponseDto extends createZodDto(SettingsResponseSchema) {}
class SettingsUpdateDto extends createZodDto(SettingsUpdateSchema) {}

/** Admin-only runtime settings. Secrets are write-only (masked on reads). */
@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Current runtime settings (secrets masked)' })
  @ZodResponse({ status: 200, type: SettingsResponseDto })
  get() {
    return this.settingsService.toResponse();
  }

  @Put()
  @ApiOperation({ summary: 'Update runtime settings (validated as a whole before saving)' })
  @ZodResponse({ status: 200, type: SettingsResponseDto })
  async update(@CurrentUser() user: AuthenticatedUser, @Body() body: SettingsUpdateDto) {
    return this.settingsService.update(body, user.userId);
  }
}

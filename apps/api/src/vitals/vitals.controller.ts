import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { VitalCreateDto, VitalDto, VitalsListResponseDto } from './dto/vitals.dto';
import { VitalsService } from './vitals.service';

// No @Public() anywhere here — the global AuthGuard protects every route.
@ApiTags('vitals')
@ApiBearerAuth()
@Controller('patients/:patientId/vitals')
export class VitalsController {
  constructor(private readonly vitalsService: VitalsService) {}

  @Post()
  @ZodResponse({ status: 201, type: VitalDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Body() body: VitalCreateDto,
  ) {
    return this.vitalsService.create(user.userId, patientId, body);
  }

  @Get()
  @ZodResponse({ status: 200, type: VitalsListResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser, @Param('patientId') patientId: string) {
    return this.vitalsService.list(user.userId, patientId);
  }
}

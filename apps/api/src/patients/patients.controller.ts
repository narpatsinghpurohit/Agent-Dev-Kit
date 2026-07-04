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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  ClinicalProfileUpdateDto,
  PatientClinicalProfileDto,
  PatientCreateDto,
  PatientDto,
  PatientListQueryDto,
  PatientListResponseDto,
  PatientUpdateDto,
} from './dto/patients.dto';
import { PatientsService } from './patients.service';

// No @Public() anywhere here — the global AuthGuard protects every route.
@ApiTags('patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  @ZodResponse({ status: 200, type: PatientListResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: PatientListQueryDto) {
    return this.patientsService.list(user.userId, query);
  }

  @Post()
  @ZodResponse({ status: 201, type: PatientDto })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: PatientCreateDto) {
    return this.patientsService.create(user.userId, body);
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: PatientDto })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patientsService.get(user.userId, id);
  }

  @Patch(':id')
  @ZodResponse({ status: 200, type: PatientDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: PatientUpdateDto,
  ) {
    return this.patientsService.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.patientsService.delete(user.userId, id);
  }

  // The clinical profile has its own endpoints on purpose — it never rides
  // on the PatientDto wire shape.
  @Get(':id/clinical')
  @ZodResponse({ status: 200, type: PatientClinicalProfileDto })
  async getClinical(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.patientsService.getClinical(user.userId, id);
  }

  @Put(':id/clinical')
  @ZodResponse({ status: 200, type: PatientClinicalProfileDto })
  async updateClinical(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: ClinicalProfileUpdateDto,
  ) {
    return this.patientsService.updateClinical(user.userId, id, body);
  }
}

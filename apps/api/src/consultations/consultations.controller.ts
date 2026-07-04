import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ZodResponse } from 'nestjs-zod';
import { CurrentUser, type AuthenticatedUser } from '../common/decorators/current-user.decorator';
import {
  AnswerResponseDto,
  AnswerTextRequestDto,
  AskRequestDto,
  AskResponseDto,
  ConsultationCreateDto,
  ConsultationDto,
  ConsultationListQueryDto,
  ConsultationListResponseDto,
  SummaryUpdateDto,
} from './dto/consultations.dto';
import { ConsultationsService } from './consultations.service';

// Voice turns hit Sarvam (Starter: 30-60 req/min account-wide) — throttle
// per user well below that so one session cannot starve the account.
const VOICE_THROTTLE = { default: { limit: 20, ttl: 60_000 } };
// Sarvam's real-time STT caps at ~30s of audio; webm/opus at 48kHz stays
// well under this size for that duration.
const MAX_ANSWER_AUDIO_BYTES = 10 * 1024 * 1024;

// No @Public() anywhere here — the global AuthGuard protects every route.
@ApiTags('consultations')
@ApiBearerAuth()
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Post()
  @ZodResponse({ status: 201, type: ConsultationDto })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: ConsultationCreateDto) {
    return this.consultationsService.create(user.userId, body);
  }

  @Get()
  @ZodResponse({ status: 200, type: ConsultationListResponseDto })
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ConsultationListQueryDto) {
    return this.consultationsService.list(user.userId, query);
  }

  @Get(':id')
  @ZodResponse({ status: 200, type: ConsultationDto })
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.consultationsService.get(user.userId, id);
  }

  /** Doctor asks — returns the stored turn + spoken audio for the patient. */
  @Post(':id/ask')
  @Throttle(VOICE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: AskResponseDto })
  async ask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AskRequestDto,
  ) {
    return this.consultationsService.ask(user.userId, id, body.text);
  }

  /** Patient answers by microphone (push-to-talk clip, <30s). */
  @Post(':id/answer')
  @Throttle(VOICE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_ANSWER_AUDIO_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { audio: { type: 'string', format: 'binary' } },
      required: ['audio'],
    },
  })
  @ZodResponse({ status: 200, type: AnswerResponseDto })
  async answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Missing "audio" file field');
    return this.consultationsService.answerAudio(user.userId, id, file);
  }

  /** Typed fallback when the microphone is unavailable. */
  @Post(':id/answer-text')
  @Throttle(VOICE_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: AnswerResponseDto })
  async answerText(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: AnswerTextRequestDto,
  ) {
    return this.consultationsService.answerText(user.userId, id, body.text);
  }

  /** Finish the interview — drafts the structured summary (a real LLM call). */
  @Post(':id/finish')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ZodResponse({ status: 200, type: ConsultationDto })
  async finish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.consultationsService.finish(user.userId, id);
  }

  /** Doctor's corrections to the drafted summary. */
  @Patch(':id/summary')
  @ZodResponse({ status: 200, type: ConsultationDto })
  async updateSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: SummaryUpdateDto,
  ) {
    return this.consultationsService.updateSummary(user.userId, id, body);
  }
}

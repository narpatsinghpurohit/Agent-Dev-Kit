import {
  BadRequestException,
  Controller,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';
import { TranscribeResponseSchema, TtsRequestSchema } from '@repo/schemas';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { SpeechService } from './speech.service';

class TtsRequestDto extends createZodDto(TtsRequestSchema) {}
class TranscribeResponseDto extends createZodDto(TranscribeResponseSchema) {}

const SPEECH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
// Gemini inline audio caps at 20MB — stay under it and cap uploads early.
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class SpeechController {
  constructor(private readonly speechService: SpeechService) {}

  @Post('transcribe')
  @Throttle(SPEECH_THROTTLE)
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { audio: { type: 'string', format: 'binary' } },
      required: ['audio'],
    },
  })
  @ZodResponse({ status: 201, type: TranscribeResponseDto })
  async transcribe(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file) throw new BadRequestException('Missing "audio" file field');
    return this.speechService.transcribe(user.userId, file);
  }

  @Post('tts')
  @Throttle(SPEECH_THROTTLE)
  @ApiOperation({ summary: 'Text to speech — returns audio/wav bytes' })
  async tts(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: TtsRequestDto,
    @Res() response: Response,
  ): Promise<void> {
    const wav = await this.speechService.textToSpeech(user.userId, body);
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Cache-Control', 'no-store');
    response.send(wav);
  }
}

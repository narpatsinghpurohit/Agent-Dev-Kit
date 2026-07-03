import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { ChatRequestSchema } from '@repo/schemas';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ModelRegistryService } from '../model-registry.service';
import { ChatService } from './chat.service';

class ChatRequestDto extends createZodDto(ChatRequestSchema) {}

// AI endpoints are the most expensive in the app — tighter throttle than the
// global default, and the daily token budget guards the economics.
const AI_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly models: ModelRegistryService,
  ) {}

  @Post('chat')
  @Throttle(AI_THROTTLE)
  @ApiOperation({
    summary: 'Copilot chat stream (AI SDK UI-message SSE protocol — not plain JSON)',
  })
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ChatRequestDto,
    @Req() request: Request,
    @Res() response: Response, // raw mode: the AI SDK writes the SSE stream
  ): Promise<void> {
    await this.chatService.streamChat(user.userId, body, request, response);
  }

  @Get('conversations')
  async conversations(@CurrentUser() user: AuthenticatedUser) {
    return this.chatService.listConversations(user.userId);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Stored UIMessages for resuming a conversation' })
  async messages(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.chatService.loadConversationMessages(user.userId, id);
  }

  @Get('models')
  @ApiOperation({ summary: 'Which model serves each AI feature (public metadata)' })
  models_(): { features: ReturnType<ModelRegistryService['info']> } {
    return { features: this.models.info() };
  }
}

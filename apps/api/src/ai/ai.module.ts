import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksModule } from '../tasks/tasks.module';
import { UsersModule } from '../users/users.module';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import {
  Conversation,
  ConversationMessage,
  ConversationMessageSchema,
  ConversationSchema,
} from './conversations/conversation.schema';
import { ConversationsRepository } from './conversations/conversations.repository';
import { CopilotToolsService } from './copilot/copilot-tools.service';
import { ModelRegistryService } from './model-registry.service';
import { SpeechController } from './speech/speech.controller';
import { SpeechService } from './speech/speech.service';
import { AiBudgetDay, AiBudgetDaySchema, AiUsage, AiUsageSchema } from './usage/ai-usage.schema';
import { AiUsageService } from './usage/ai-usage.service';

@Module({
  imports: [
    TasksModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationMessage.name, schema: ConversationMessageSchema },
      { name: AiUsage.name, schema: AiUsageSchema },
      { name: AiBudgetDay.name, schema: AiBudgetDaySchema },
    ]),
  ],
  controllers: [ChatController, SpeechController],
  providers: [
    ModelRegistryService,
    CopilotToolsService,
    ChatService,
    SpeechService,
    AiUsageService,
    ConversationsRepository,
  ],
})
export class AiModule {}

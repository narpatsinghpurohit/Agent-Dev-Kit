import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConsultationsModule } from '../consultations/consultations.module';
import { PatientsModule } from '../patients/patients.module';
import { UsersModule } from '../users/users.module';
import { AiCoreModule } from './ai-core.module';
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
import { SpeechController } from './speech/speech.controller';
import { SpeechService } from './speech/speech.service';

@Module({
  imports: [
    AiCoreModule,
    PatientsModule,
    ConsultationsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ConversationMessage.name, schema: ConversationMessageSchema },
    ]),
  ],
  controllers: [ChatController, SpeechController],
  providers: [CopilotToolsService, ChatService, SpeechService, ConversationsRepository],
})
export class AiModule {}

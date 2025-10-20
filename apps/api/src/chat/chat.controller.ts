import { Body, Controller, Post, UseGuards, Logger } from '@nestjs/common';
import { KindeGuard } from '../auth/kinde.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(KindeGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private svc: ChatService) {}

  @Post('complete')
  async complete(@Body() dto: { prompt: string; mode: 'plan' | 'auto'; teamId: number }) {
    this.logger.log('📥 [POST /chat/complete] Request received', {
      timestamp: new Date().toISOString(),
      mode: dto.mode,
      teamId: dto.teamId,
      promptLength: dto.prompt?.length || 0,
      promptPreview: dto.prompt?.substring(0, 50) + (dto.prompt?.length > 50 ? '...' : ''),
    });

    const result = await this.svc.handlePrompt(dto);

    this.logger.log('📤 [POST /chat/complete] Response sent', {
      timestamp: new Date().toISOString(),
      messagesCount: result.messages?.length || 0,
    });

    return result;
  }

  @Post('agent')
  async agent(@Body() dto: { prompt: string }) {
    this.logger.log('📥 [POST /chat/agent] Request received', {
      timestamp: new Date().toISOString(),
      promptLength: dto.prompt?.length || 0,
    });

    const result = await this.svc.runAgent(dto.prompt);

    this.logger.log('📤 [POST /chat/agent] Response sent', {
      timestamp: new Date().toISOString(),
    });

    return result;
  }
}

import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { KindeGuard } from '../auth/kinde.guard';
import { ChatService } from './chat.service';

@Controller('chat')
@UseGuards(KindeGuard)
export class ChatController {
  constructor(private svc: ChatService) {}

  @Post('complete')
  complete(@Body() dto: { prompt: string; mode: 'plan' | 'auto'; teamId: number }) {
    return this.svc.handlePrompt(dto);
  }

  @Post('agent')
  agent(@Body() dto: { prompt: string }) {
    return this.svc.runAgent(dto.prompt);
  }
}

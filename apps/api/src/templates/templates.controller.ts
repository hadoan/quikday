import { BadRequestException, Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto } from './dto/create-template.dto';

@Controller('templates')
export class TemplatesController {
  constructor(private svc: TemplatesService) {}

  @Get()
  list(@Query('locale') locale = 'en', @Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id ?? 'anonymous';
    const loc = (locale === 'de' ? 'de' : 'en') as 'en' | 'de';
    return this.svc.list(loc, userId);
  }

  @Post()
  async create(@Body() dto: CreateTemplateDto, @Req() req: any) {
    // Require explicit confirmation flag to guard writes
    if (!dto.confirm) throw new BadRequestException('Confirmation required');

    const userId = req.user?.sub ?? req.user?.id ?? 'anonymous';
    return this.svc.create(dto, userId);
  }
}


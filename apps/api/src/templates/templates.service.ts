import { Injectable } from '@nestjs/common';
import { PrismaService } from '@quikday/prisma';
import { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private prisma: PrismaService) {}

  async list(locale: 'en' | 'de', _userId: string) {
    const rows = await this.prisma.template.findMany({
      where: { OR: [{ locale }, { isDefault: true }] },
      orderBy: { label: 'asc' },
    });
    // Map DB fields to API contract
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.label,
      sample_text: r.sampleText,
      variables: r.variables as any,
      locale: r.locale as 'en' | 'de',
      is_default: r.isDefault,
      is_user_custom: r.isUserCustom,
    }));
  }

  async create(dto: CreateTemplateDto, userId: string) {
    const created = await this.prisma.template.create({
      data: {
        kind: dto.kind,
        label: dto.label,
        sampleText: dto.sample_text,
        variables: (dto.variables as any) ?? undefined,
        locale: dto.locale,
        isUserCustom: dto.is_user_custom ?? true,
        createdBy: userId,
      },
    });
    return {
      id: created.id,
      kind: created.kind,
      label: created.label,
      sample_text: created.sampleText,
      variables: created.variables as any,
      locale: created.locale as 'en' | 'de',
      is_default: created.isDefault,
      is_user_custom: created.isUserCustom,
    };
  }
}


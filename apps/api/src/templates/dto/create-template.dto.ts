import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  kind!: string;

  @IsString()
  label!: string;

  @IsString()
  sample_text!: string;

  @IsOptional()
  variables?: Array<{ key: string; type: string; required?: boolean }>;

  @IsIn(['en', 'de'])
  locale: 'en' | 'de' = 'en';

  @IsOptional()
  @IsBoolean()
  is_user_custom?: boolean = true;

  // Safety: require explicit confirmation to write
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}


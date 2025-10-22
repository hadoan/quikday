import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

export interface FileLoggerOptions {
  logFilePath?: string;
  levels?: LogLevel[];
  mirrorToConsole?: boolean;
}

export class FileLogger extends ConsoleLogger {
  private readonly stream;
  private readonly mirrorToConsole: boolean;

  constructor(context?: string, options: FileLoggerOptions = {}) {
    // ConsoleLogger expects a string context; provide a safe default when undefined
    super(context ?? 'FileLogger', { logLevels: options.levels });

    const targetPath = resolve(process.cwd(), options.logFilePath ?? 'logs/nest-api.log');
    const dir = dirname(targetPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.stream = createWriteStream(targetPath, { flags: 'a' });
    this.mirrorToConsole = options.mirrorToConsole !== false;
  }

  log(message: any, ...optionalParams: any[]) {
    this.write('LOG', message, optionalParams);
    if (this.mirrorToConsole) super.log(message, ...optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.write('ERROR', message, optionalParams);
    if (this.mirrorToConsole) super.error(message, ...optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.write('WARN', message, optionalParams);
    if (this.mirrorToConsole) super.warn(message, ...optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.write('DEBUG', message, optionalParams);
    if (this.mirrorToConsole) super.debug?.(message, ...optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.write('VERBOSE', message, optionalParams);
    if (this.mirrorToConsole) super.verbose?.(message, ...optionalParams);
  }

  private write(level: string, message: any, optionalParams: any[]) {
    const ts = new Date().toISOString();
    const serialized = [message, ...optionalParams]
      .map((entry) => {
        if (entry instanceof Error) return entry.stack ?? entry.message;
        if (typeof entry === 'object') {
          try {
            return JSON.stringify(entry);
          } catch (_) {
            return String(entry);
          }
        }
        return String(entry);
      })
      .join(' ');
    this.stream.write(`[${ts}] [${level}] ${serialized}\n`);
  }
}

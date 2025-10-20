/**
 * Logger utility for frontend application
 * Provides structured logging with context and log levels
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogContext {
  [key: string]: unknown;
}

class Logger {
  private context: string;
  private minLevel: LogLevel;

  constructor(context: string, minLevel: LogLevel = LogLevel.INFO) {
    this.context = context;
    this.minLevel = this.getLogLevelFromEnv() ?? minLevel;
  }

  private getLogLevelFromEnv(): LogLevel | null {
    const envLevel = import.meta.env.VITE_LOG_LEVEL;
    if (!envLevel) return null;

    switch (envLevel.toUpperCase()) {
      case 'DEBUG':
        return LogLevel.DEBUG;
      case 'INFO':
        return LogLevel.INFO;
      case 'WARN':
        return LogLevel.WARN;
      case 'ERROR':
        return LogLevel.ERROR;
      default:
        return null;
    }
  }

  private formatMessage(level: string, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.context}]`;
    
    if (context && Object.keys(context).length > 0) {
      console.log(`${prefix} ${message}`, context);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }

  private formatError(level: string, message: string, error?: Error, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level}] [${this.context}]`;
    
    const errorContext = {
      ...context,
      error: error?.message,
      stack: error?.stack,
    };

    console.error(`${prefix} ${message}`, errorContext);
  }

  debug(message: string, context?: LogContext): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      this.formatMessage('DEBUG', message, context);
    }
  }

  log(message: string, context?: LogContext): void {
    this.info(message, context);
  }

  info(message: string, context?: LogContext): void {
    if (this.minLevel <= LogLevel.INFO) {
      this.formatMessage('INFO', message, context);
    }
  }

  warn(message: string, context?: LogContext): void {
    if (this.minLevel <= LogLevel.WARN) {
      this.formatMessage('WARN', message, context);
    }
  }

  error(message: string, error?: Error | string, context?: LogContext): void {
    if (this.minLevel <= LogLevel.ERROR) {
      if (typeof error === 'string') {
        this.formatMessage('ERROR', message, { ...context, error });
      } else {
        this.formatError('ERROR', message, error, context);
      }
    }
  }
}

/**
 * Create a logger instance for a specific context
 * @param context The context/module name for the logger
 * @param minLevel Minimum log level (defaults to INFO)
 */
export function createLogger(context: string, minLevel?: LogLevel): Logger {
  return new Logger(context, minLevel);
}

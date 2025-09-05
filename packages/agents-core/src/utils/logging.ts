/**
 * Logger factory for core utilities package
 * Designed to work with Pino-style loggers and request context
 */

export interface Logger {
  debug: (obj: any, msg?: string) => void;
  info: (obj: any, msg?: string) => void;
  warn: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
}

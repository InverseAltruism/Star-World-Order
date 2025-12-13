/**
 * Structured Logging Utility
 * 
 * Provides consistent, environment-aware logging for debugging RPC failures
 * and other application events.
 * 
 * Features:
 * - Log levels: debug, info, warn, error
 * - Timestamps and context
 * - Environment-aware (verbose in dev, minimal in prod)
 * - Structured data logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

const IS_DEV = process.env.NODE_ENV === 'development';

/**
 * Format timestamp for logs
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Log a message with context
 */
function log(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = getTimestamp();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  
  // In production, only log warnings and errors
  if (!IS_DEV && (level === 'debug' || level === 'info')) {
    return;
  }
  
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  const fullMessage = `${prefix} ${message}${contextStr}`;
  
  switch (level) {
    case 'error':
      console.error(fullMessage);
      break;
    case 'warn':
      console.warn(fullMessage);
      break;
    case 'info':
      console.info(fullMessage);
      break;
    case 'debug':
      console.debug(fullMessage);
      break;
  }
}

/**
 * Logger interface
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};

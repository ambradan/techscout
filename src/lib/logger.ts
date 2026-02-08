/**
 * TechScout — Logger
 *
 * Simple structured logging utility.
 * Logs are JSON-formatted for easy parsing.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get log level from environment, default to 'info'
const currentLevel = (process.env.LOG_LEVEL ?? 'info') as LogLevel;
const currentLevelNum = LOG_LEVELS[currentLevel] ?? LOG_LEVELS.info;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevelNum;
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    // JSON format for production
    return JSON.stringify(entry);
  }

  // Human-readable format for development
  const { timestamp, level, message, context } = entry;
  const levelStr = level.toUpperCase().padEnd(5);
  const time = timestamp.split('T')[1]?.split('.')[0] ?? timestamp;

  let output = `${time} ${levelStr} ${message}`;

  if (context && Object.keys(context).length > 0) {
    output += ` ${JSON.stringify(context)}`;
  }

  return output;
}

function log(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
  };

  const formatted = formatEntry(entry);

  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    default:
      console.log(formatted);
  }
}

/**
 * Logger interface.
 */
export const logger = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),

  /**
   * Create a child logger with default context.
   */
  child: (defaultContext: LogContext) => ({
    debug: (message: string, context?: LogContext) =>
      log('debug', message, { ...defaultContext, ...context }),
    info: (message: string, context?: LogContext) =>
      log('info', message, { ...defaultContext, ...context }),
    warn: (message: string, context?: LogContext) =>
      log('warn', message, { ...defaultContext, ...context }),
    error: (message: string, context?: LogContext) =>
      log('error', message, { ...defaultContext, ...context }),
  }),
};

/**
 * Performance timing utility.
 */
export function timeOperation<T>(
  name: string,
  operation: () => T | Promise<T>
): T | Promise<T> {
  const start = performance.now();

  const logResult = (durationMs: number) => {
    logger.debug(`${name} completed`, { durationMs: Math.round(durationMs) });
  };

  try {
    const result = operation();

    if (result instanceof Promise) {
      return result
        .then((r) => {
          logResult(performance.now() - start);
          return r;
        })
        .catch((err) => {
          logResult(performance.now() - start);
          throw err;
        });
    }

    logResult(performance.now() - start);
    return result;
  } catch (err) {
    logResult(performance.now() - start);
    throw err;
  }
}

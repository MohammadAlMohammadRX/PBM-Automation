import { env } from '../constants/EnvironmentConfig';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Minimal, dependency-free logging utility.
 * Writes structured, leveled log lines to stdout/stderr. Levels below the
 * configured LOG_LEVEL are suppressed so reports stay readable.
 *
 * Usage:
 *   Logger.info('Navigating to Payer Management');
 *   Logger.error('Login failed', error);
 */
export class Logger {
  private static shouldLog(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[env.logLevel];
  }

  private static format(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  static debug(message: string, ...meta: unknown[]): void {
    if (!this.shouldLog('DEBUG')) return;
    // eslint-disable-next-line no-console
    console.debug(this.format('DEBUG', message), ...meta);
  }

  static info(message: string, ...meta: unknown[]): void {
    if (!this.shouldLog('INFO')) return;
    // eslint-disable-next-line no-console
    console.log(this.format('INFO', message), ...meta);
  }

  static warn(message: string, ...meta: unknown[]): void {
    if (!this.shouldLog('WARN')) return;
    // eslint-disable-next-line no-console
    console.warn(this.format('WARN', message), ...meta);
  }

  static error(message: string, error?: unknown): void {
    if (!this.shouldLog('ERROR')) return;
    // eslint-disable-next-line no-console
    console.error(this.format('ERROR', message), error instanceof Error ? error.stack ?? error.message : error ?? '');
  }

  static testStarted(testName: string): void {
    this.info(`▶ Test started: ${testName}`);
  }

  static testCompleted(testName: string, status: string): void {
    const icon = status === 'passed' ? '✔' : status === 'skipped' ? '⏭' : '✘';
    this.info(`${icon} Test completed: ${testName} [${status}]`);
  }

  static step(description: string): void {
    this.info(`↳ ${description}`);
  }

  static navigation(url: string): void {
    this.info(`→ Navigating to ${url}`);
  }

  static cleanup(description: string): void {
    this.info(`🧹 Cleanup: ${description}`);
  }
}

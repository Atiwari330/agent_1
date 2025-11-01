/**
 * Logger Utility
 *
 * Provides structured logging with different levels, colored output,
 * and specialized methods for agent operations.
 */

import chalk from 'chalk';
import { config } from '../config/index.js';

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Options for log messages
 */
export interface LogOptions {
  level?: LogLevel;
  prefix?: string;
  data?: any;
}

/**
 * Logger class providing structured, colored logging
 */
class Logger {
  private minLevel: LogLevel;

  constructor() {
    // Set minimum log level based on DEBUG config
    this.minLevel = config.app.debug ? LogLevel.DEBUG : LogLevel.INFO;
  }

  /**
   * Check if a message at this level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  /**
   * Format a log message with timestamp and level
   */
  private formatMessage(level: LogLevel, message: string, prefix?: string): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];
    const prefixStr = prefix ? `[${prefix}]` : '';
    return `${timestamp} ${levelStr} ${prefixStr} ${message}`;
  }

  /**
   * Log debug message (only in debug mode)
   */
  debug(message: string, options?: Omit<LogOptions, 'level'>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    const formatted = this.formatMessage(LogLevel.DEBUG, message, options?.prefix);
    console.log(chalk.gray(formatted));
    if (options?.data) {
      console.log(chalk.gray(JSON.stringify(options.data, null, 2)));
    }
  }

  /**
   * Log info message
   */
  info(message: string, options?: Omit<LogOptions, 'level'>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    const formatted = this.formatMessage(LogLevel.INFO, message, options?.prefix);
    console.log(chalk.blue(formatted));
    if (options?.data) {
      console.log(JSON.stringify(options.data, null, 2));
    }
  }

  /**
   * Log success message (info level with green color)
   */
  success(message: string, options?: Omit<LogOptions, 'level'>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.log(chalk.green(`✓ ${message}`));
    if (options?.data) {
      console.log(JSON.stringify(options.data, null, 2));
    }
  }

  /**
   * Log warning message
   */
  warn(message: string, options?: Omit<LogOptions, 'level'>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    const formatted = this.formatMessage(LogLevel.WARN, message, options?.prefix);
    console.warn(chalk.yellow(`⚠  ${formatted}`));
    if (options?.data) {
      console.warn(JSON.stringify(options.data, null, 2));
    }
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error, options?: Omit<LogOptions, 'level'>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const formatted = this.formatMessage(LogLevel.ERROR, message, options?.prefix);
    console.error(chalk.red(`✗ ${formatted}`));
    if (error) {
      console.error(chalk.red(error.stack || error.message));
    }
    if (options?.data) {
      console.error(JSON.stringify(options.data, null, 2));
    }
  }

  /**
   * Log agent thinking/reasoning step
   */
  agentThinking(message: string): void {
    console.log(chalk.magenta(`🤔 Agent: ${message}`));
  }

  /**
   * Log agent response
   */
  agentResponse(message: string): void {
    console.log(chalk.cyan(`💬 ${message}`));
  }

  /**
   * Log tool call with parameters
   */
  toolCall(toolName: string, params: any): void {
    console.log(chalk.cyan(`🔧 Calling tool: ${toolName}`));
    if (config.app.debug && params) {
      console.log(chalk.gray('   Parameters:'));
      console.log(chalk.gray('   ' + JSON.stringify(params, null, 2).replace(/\n/g, '\n   ')));
    }
  }

  /**
   * Log tool result
   */
  toolResult(toolName: string, success: boolean, executionTime?: number): void {
    const icon = success ? '✓' : '✗';
    const color = success ? chalk.green : chalk.red;
    const timeStr = executionTime ? ` (${executionTime}ms)` : '';
    console.log(color(`${icon} Tool completed: ${toolName}${timeStr}`));
  }

  /**
   * Log tool result with data (in debug mode)
   */
  toolResultData(data: any): void {
    if (config.app.debug && data) {
      console.log(chalk.gray('   Result:'));
      console.log(chalk.gray('   ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n   ')));
    }
  }

  /**
   * Log separator line
   */
  separator(): void {
    console.log(chalk.gray('─'.repeat(80)));
  }

  /**
   * Log section header
   */
  section(title: string): void {
    console.log('');
    console.log(chalk.bold.white(`▸ ${title}`));
    console.log(chalk.gray('─'.repeat(80)));
  }
}

/**
 * Global logger instance
 * Use this throughout the application
 */
export const logger = new Logger();

/**
 * Simple logging utility for production debugging
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private logs: Array<{ timestamp: string; level: string; message: string; data?: any }> = [];
  private maxLogs = 1000; // Keep last 1000 logs

  private constructor() {
    // In production, only log warnings and errors by default
    this.logLevel = import.meta.env.PROD ? LogLevel.WARN : LogLevel.DEBUG;
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.logLevel;
  }

  private addToHistory(level: string, message: string, data?: any) {
    const timestamp = new Date().toISOString();
    this.logs.push({ timestamp, level, message, data });
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  debug(message: string, data?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(`[DEBUG] ${message}`, data);
    }
    this.addToHistory('DEBUG', message, data);
  }

  info(message: string, data?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.info(`[INFO] ${message}`, data);
    }
    this.addToHistory('INFO', message, data);
  }

  warn(message: string, data?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[WARN] ${message}`, data);
    }
    this.addToHistory('WARN', message, data);
  }

  error(message: string, data?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`[ERROR] ${message}`, data);
    }
    this.addToHistory('ERROR', message, data);
  }

  // Get recent logs for debugging
  getRecentLogs(count: number = 50): Array<{ timestamp: string; level: string; message: string; data?: any }> {
    return this.logs.slice(-count);
  }

  // Export logs for debugging
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
  }

  // Set log level
  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }
}

export const logger = Logger.getInstance();

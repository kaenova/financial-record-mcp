import { config } from "../config";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

function shouldLog(level: Level): boolean {
  return LEVELS[level] >= LEVELS[config.LOG_LEVEL];
}

export const logger = {
  debug: (msg: string, ...args: unknown[]) => {
    if (shouldLog("debug")) console.debug(`[DEBUG] ${msg}`, ...args);
  },
  info: (msg: string, ...args: unknown[]) => {
    if (shouldLog("info")) console.info(`[INFO] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: unknown[]) => {
    if (shouldLog("warn")) console.warn(`[WARN] ${msg}`, ...args);
  },
  error: (msg: string, ...args: unknown[]) => {
    if (shouldLog("error")) console.error(`[ERROR] ${msg}`, ...args);
  },
};
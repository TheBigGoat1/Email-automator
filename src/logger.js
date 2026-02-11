import { appendFileSync, mkdirSync, existsSync, statSync, renameSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'logs');
const LOG_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const LOG_BACKUP_SUFFIX = '.1';

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return join(LOG_DIR, `app-${date}.log`);
}

const LEVELS = { info: 'INFO', warn: 'WARN', error: 'ERROR' };

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, event, data = {}) {
  const payload = { time: timestamp(), level: LEVELS[level] || level, event, ...data };
  return JSON.stringify(payload);
}

function writeToFile(line) {
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    const logPath = getLogPath();
    const stat = existsSync(logPath) ? statSync(logPath) : { size: 0 };
    if (stat.size >= LOG_MAX_SIZE_BYTES) {
      const backupPath = logPath + LOG_BACKUP_SUFFIX;
      if (existsSync(backupPath)) unlinkSync(backupPath);
      renameSync(logPath, backupPath);
    }
    appendFileSync(logPath, line + '\n', 'utf8');
  } catch (_) {}
}

export function log(level, event, data = {}) {
  const line = formatMessage(level, event, data);
  const consoleLine = `[${timestamp()}] [${LEVELS[level] || level}] ${event} ${Object.keys(data).length ? JSON.stringify(data) : ''}`;
  if (level === 'error') console.error(consoleLine);
  else if (level === 'warn') console.warn(consoleLine);
  else console.log(consoleLine);
  writeToFile(line);
}

export const logger = {
  info: (event, data) => log('info', event, data),
  warn: (event, data) => log('warn', event, data),
  error: (event, data) => log('error', event, data),
};

import { appendFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, '..', 'logs');
const LOG_FILE = join(LOG_DIR, 'app.log');

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
    appendFileSync(LOG_FILE, line + '\n', 'utf8');
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

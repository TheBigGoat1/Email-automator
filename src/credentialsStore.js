import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const CREDENTIALS_FILE = join(__dirname, '..', '.credentials.enc');

let inMemory = null;

function getEncryptionKey() {
  const fromEnv = process.env.ENCRYPTION_KEY;
  if (fromEnv)
    return crypto.createHash('sha256').update(fromEnv, 'utf8').digest();
  const secret = process.env.SESSION_SECRET || 'dev-secret';
  return crypto.scryptSync(secret, 'email-automator-credentials-v1', KEY_LEN);
}

function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ciphertext, iv, tag]).toString('base64');
}

function decrypt(b64) {
  const key = getEncryptionKey();
  const data = Buffer.from(b64, 'base64');
  if (data.length < IV_LEN + TAG_LEN) throw new Error('Invalid credentials blob');
  const tag = data.subarray(data.length - TAG_LEN);
  const iv = data.subarray(data.length - TAG_LEN - IV_LEN, data.length - TAG_LEN);
  const ciphertext = data.subarray(0, data.length - TAG_LEN - IV_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function loadFromFile() {
  if (inMemory) return inMemory;
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    const raw = readFileSync(CREDENTIALS_FILE, 'utf8');
    inMemory = JSON.parse(decrypt(raw));
    return inMemory;
  } catch (_) {
    return null;
  }
}

export function getCredentials() {
  const fromFile = loadFromFile();
  return fromFile;
}

export function setCredentials(credentials) {
  const payload = {
    azure: {
      clientId: credentials.azureClientId?.trim?.() || credentials.azure?.clientId,
      clientSecret: credentials.azureClientSecret?.trim?.() || credentials.azure?.clientSecret,
      tenantId: (credentials.azureTenantId?.trim?.() || credentials.azure?.tenantId || 'common'),
    },
    openaiApiKey: credentials.openaiApiKey?.trim?.() || credentials.openaiApiKey || '',
    defaultBlocks: {
      opener: credentials.opener?.trim?.() || credentials.defaultBlocks?.opener || '',
      closing: credentials.closing?.trim?.() || credentials.defaultBlocks?.closing || '',
      signature: credentials.signature?.trim?.() || credentials.defaultBlocks?.signature || '',
    },
  };
  if (!payload.azure.clientId || !payload.azure.clientSecret)
    throw new Error('Azure Client ID and Client Secret are required');
  inMemory = payload;
  const blob = encrypt(JSON.stringify(payload));
  writeFileSync(CREDENTIALS_FILE, blob, { mode: 0o600 });
  return true;
}

export function getDefaultBlocks() {
  const c = loadFromFile();
  return c?.defaultBlocks || null;
}

export function isConfigured() {
  const c = loadFromFile();
  return Boolean(c?.azure?.clientId && c?.azure?.clientSecret);
}

export function clearMsalCache() {
  // Allow auth.js to re-create MSAL with new credentials
  return null;
}

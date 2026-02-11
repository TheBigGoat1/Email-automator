import 'dotenv/config';
import { getCredentials, isConfigured } from './credentialsStore.js';

function fromEnv() {
  return {
    azure: {
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      tenantId: process.env.AZURE_TENANT_ID || 'common',
    },
    openaiApiKey: process.env.OPENAI_API_KEY || '',
  };
}

function fromStore() {
  const c = getCredentials();
  if (!c?.azure?.clientId || !c?.azure?.clientSecret) return null;
  return {
    azure: {
      clientId: c.azure.clientId,
      clientSecret: c.azure.clientSecret,
      tenantId: c.azure.tenantId || 'common',
    },
    openaiApiKey: c.openaiApiKey || '',
  };
}

/** Current Azure config: env overrides store. */
export function getAzure() {
  const env = fromEnv();
  const store = fromStore();
  return {
    clientId: env.azure.clientId || store?.azure?.clientId,
    clientSecret: env.azure.clientSecret || store?.azure?.clientSecret,
    tenantId: env.azure.tenantId || store?.azure?.tenantId || 'common',
    authority: `https://login.microsoftonline.com/${env.azure.tenantId || store?.azure?.tenantId || 'common'}`,
  };
}

/** Current OpenAI API key: env overrides store. */
export function getOpenAIKey() {
  const env = fromEnv();
  const store = fromStore();
  return env.openaiApiKey || store?.openaiApiKey || '';
}

export const config = {
  get azure() { return getAzure(); },
  get openaiApiKey() { return getOpenAIKey(); },
  port: Number(process.env.PORT) || 3000,
  sessionSecret: process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || 'change-me-in-production',
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
};

/** Whether Azure credentials are available (env or store). */
export function isAuthConfigured() {
  const env = fromEnv();
  if (env.azure.clientId && env.azure.clientSecret) return true;
  return isConfigured();
}

const graphScopes = ['Mail.Read', 'Mail.ReadWrite', 'offline_access', 'openid', 'profile'];
export const scopes = graphScopes;

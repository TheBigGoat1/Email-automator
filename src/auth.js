import { ConfidentialClientApplication } from '@azure/msal-node';
import { config, scopes, isAuthConfigured } from './config.js';

let msalClient = null;

export function clearMsalClient() {
  msalClient = null;
}

export { isAuthConfigured };

function getMsal() {
  if (!msalClient) {
    if (!config.azure.clientId || !config.azure.clientSecret)
      throw new Error('AZURE_CLIENT_ID and AZURE_CLIENT_SECRET required');
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.azure.clientId,
        clientSecret: config.azure.clientSecret,
        authority: config.azure.authority,
      },
    });
  }
  return msalClient;
}

export async function getAuthUrl(state) {
  const client = getMsal();
  return await client.getAuthCodeUrl({
    scopes,
    redirectUri: `${config.baseUrl}/auth/callback`,
    state: state || undefined,
  });
}

export async function redeemCode(code) {
  const client = getMsal();
  const result = await client.acquireTokenByCode({
    code,
    scopes,
    redirectUri: `${config.baseUrl}/auth/callback`,
  });
  return { accessToken: result.accessToken, refreshToken: result.refreshToken, account: result.account };
}

export function getTokenFromSession(session) {
  return session?.accessToken ?? null;
}

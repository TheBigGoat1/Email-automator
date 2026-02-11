import express from 'express';
import session from 'express-session';
import { config, isAuthConfigured } from './config.js';
import { getAuthUrl, redeemCode, getTokenFromSession, clearMsalClient } from './auth.js';
import { setCredentials } from './credentialsStore.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { getGraphClient, listMailFolders, getMessagesInRange } from './graph.js';
import { buildStructuredContext } from './context.js';
import { createAndSaveDraft } from './draft.js';
import { logger } from './logger.js';

const app = express();
app.use(express.json());
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

function requireAuth(req, res, next) {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: 'Configure credentials first (Settings).' });
  }
  const token = getTokenFromSession(req.session);
  if (!token) return res.status(401).json({ error: 'Not authenticated. Sign in with Microsoft.' });
  req.session.accessToken = token;
  next();
}

// ——— Config (credentials): no auth required for first-time setup ———
app.get('/api/config/status', (req, res) => {
  res.json({ configured: isAuthConfigured() });
});

app.post('/api/config', (req, res) => {
  const { azureClientId, azureClientSecret, azureTenantId, openaiApiKey } = req.body || {};
  try {
    setCredentials({
      azureClientId: azureClientId?.trim(),
      azureClientSecret: azureClientSecret?.trim(),
      azureTenantId: (azureTenantId?.trim() || 'common'),
      openaiApiKey: openaiApiKey?.trim() || '',
    });
    clearMsalClient();
    logger.info('config_saved', { hasOpenAi: Boolean(openaiApiKey?.trim()) });
    res.status(204).end();
  } catch (e) {
    logger.warn('config_save_failed', { reason: e.message });
    res.status(400).json({ error: e.message || 'Invalid credentials' });
  }
});

// ——— Auth ———
app.get('/login', async (req, res) => {
  if (!isAuthConfigured()) {
    logger.info('login_redirect_skipped', { reason: 'not_configured' });
    return res.redirect('/');
  }
  try {
    const url = await getAuthUrl();
    logger.info('login_redirect', {});
    res.redirect(url);
  } catch (e) {
    logger.error('login_redirect_failed', { reason: e.message });
    res.status(500).send(`Configuration error: ${e.message}. Check your Azure credentials in Settings.`);
  }
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    logger.warn('login_failed', { reason: error });
    return res.status(400).send(`Auth error: ${error}`);
  }
  if (!code) {
    logger.warn('login_failed', { reason: 'missing_code' });
    return res.status(400).send('Missing code');
  }
  try {
    const { accessToken, refreshToken, account } = await redeemCode(code);
    req.session.accessToken = accessToken;
    req.session.refreshToken = refreshToken;
    req.session.account = account;
    const userLog = account?.username ? { user: account.username } : {};
    logger.info('login_success', userLog);
    res.redirect('/');
  } catch (e) {
    logger.error('login_failed', { reason: e.message });
    res.status(500).send(`Sign-in failed: ${e.message}`);
  }
});

app.get('/api/me', (req, res) => {
  res.json({
    configured: isAuthConfigured(),
    authenticated: Boolean(getTokenFromSession(req.session)),
  });
});

app.get('/', (req, res) => {
  const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');
  res.type('html').send(html);
});

// ——— Mail & context (production only) ———
app.get('/api/folders', requireAuth, async (req, res) => {
  try {
    const client = getGraphClient(req.session.accessToken);
    const folders = await listMailFolders(client);
    logger.info('folders_list', { count: folders?.length ?? 0 });
    res.json({ folders });
  } catch (e) {
    logger.error('folders_list_failed', { reason: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/context', requireAuth, async (req, res) => {
  const { folderId = 'inbox', from: fromDate, to: toDate, top = 100 } = req.query;
  try {
    const client = getGraphClient(req.session.accessToken);
    const messages = await getMessagesInRange(client, folderId, fromDate, toDate, Number(top));
    const context = buildStructuredContext(messages);
    logger.info('context_fetched', { folderId, messageCount: messages?.length ?? 0 });
    res.json(context);
  } catch (e) {
    logger.error('context_fetch_failed', { reason: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/draft', requireAuth, async (req, res) => {
  const { folderId = 'inbox', from: fromDate, dateFrom, dateTo, subject, opener, closing, signature, top } = req.body;
  const to = req.body.to || req.body.recipient;
  const toDate = req.body.toDate ?? dateTo;
  if (!to) return res.status(400).json({ error: 'Body "to" (recipient email) required' });
  try {
    const client = getGraphClient(req.session.accessToken);
    const messages = await getMessagesInRange(client, folderId, fromDate ?? dateFrom, toDate, Number(top) || 100);
    const structuredContext = buildStructuredContext(messages);
    const { draft, body } = await createAndSaveDraft(client, structuredContext, { to, subject }, {
      opener, closing, signature,
    });
    logger.info('draft_created', { draftId: draft.id, to });
    res.json({ id: draft.id, subject: draft.subject, bodyPreview: body.slice(0, 200) });
  } catch (e) {
    logger.error('draft_create_failed', { reason: e.message });
    res.status(500).json({ error: e.message });
  }
});

app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, baseUrl: config.baseUrl });
});

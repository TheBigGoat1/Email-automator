import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { config, isAuthConfigured } from './config.js';
import { getAuthUrl, redeemCode, getTokenFromSession, clearMsalClient, refreshAccessToken, getValidAccessToken } from './auth.js';
import { setCredentials, getDefaultBlocks } from './credentialsStore.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateEnv } from './validateEnv.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { getGraphClient, listMailFolders, getMessagesInRange } from './graph.js';
import { buildStructuredContext } from './context.js';
import { createAndSaveDraft, generateDraftBodyOnly } from './draft.js';
import { logger } from './logger.js';

validateEnv();

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
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

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, message: { error: { code: 'RATE_LIMIT', message: 'Too many requests.' } } });
const configLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: { code: 'RATE_LIMIT', message: 'Too many config attempts.' } } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: { code: 'RATE_LIMIT', message: 'Too many auth attempts.' } } });

function apiError(res, code, message, status = 400) {
  res.status(status).json({ error: { code, message } });
}

function getCsrfToken(session) {
  if (!session.csrfToken) session.csrfToken = crypto.randomBytes(24).toString('hex');
  return session.csrfToken;
}

async function requireAuth(req, res, next) {
  if (!isAuthConfigured()) {
    return res.status(503).json({ error: { code: 'NOT_CONFIGURED', message: 'Configure credentials first (Settings).' } });
  }
  let token = getTokenFromSession(req.session);
  if (!token && req.session.refreshToken) {
    token = await refreshAccessToken(req.session);
    if (token) logger.info('token_refreshed', {});
    else logger.warn('token_refresh_failed', {});
  }
  if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in with Microsoft.' } });
  req.session.accessToken = token;
  next();
}

// ——— Health ———
app.get('/health', (req, res) => {
  res.json({ ok: true, configured: isAuthConfigured(), timestamp: new Date().toISOString() });
});

// ——— Config ———
app.get('/api/config/status', (req, res) => {
  res.json({ configured: isAuthConfigured() });
});

app.get('/api/csrf', (req, res) => {
  res.json({ csrfToken: getCsrfToken(req.session) });
});

app.post('/api/config', configLimiter, (req, res) => {
  const token = req.headers['x-csrf-token'] || req.body?.csrfToken;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: { code: 'CSRF_INVALID', message: 'Invalid or missing CSRF token.' } });
  }
  const { azureClientId, azureClientSecret, azureTenantId, openaiApiKey, opener, closing, signature } = req.body || {};
  try {
    setCredentials({
      azureClientId: azureClientId?.trim?.(),
      azureClientSecret: azureClientSecret?.trim?.(),
      azureTenantId: (azureTenantId?.trim?.() || 'common'),
      openaiApiKey: openaiApiKey?.trim?.() || '',
      opener: opener?.trim?.(), closing: closing?.trim?.(), signature: signature?.trim?.(),
    });
    clearMsalClient();
    logger.info('config_saved', { hasOpenAi: Boolean(openaiApiKey?.trim()) });
    res.status(204).end();
  } catch (e) {
    logger.warn('config_save_failed', { reason: e.message });
    res.status(400).json({ error: { code: 'CONFIG_FAILED', message: e.message || 'Invalid credentials' } });
  }
});

app.get('/api/config/default-blocks', (req, res) => {
  const blocks = getDefaultBlocks();
  res.json(blocks || { opener: '', closing: '', signature: '' });
});

// ——— Auth ———
app.get('/login', authLimiter, async (req, res) => {
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

app.get('/logout', (req, res) => {
  const hadUser = req.session?.account?.username;
  req.session.destroy((err) => {
    if (hadUser) logger.info('logout', { user: hadUser });
    res.redirect('/');
  });
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
  const authenticated = Boolean(getTokenFromSession(req.session));
  const user = req.session?.account?.username || null;
  res.json({
    configured: isAuthConfigured(),
    authenticated,
    user,
    csrfToken: getCsrfToken(req.session),
  });
});

app.get('/', (req, res) => {
  const html = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');
  res.type('html').send(html);
});

// ——— Mail & context (rate limited) ———
app.use('/api/folders', apiLimiter);
app.use('/api/context', apiLimiter);
app.use('/api/draft', apiLimiter);

app.get('/api/folders', requireAuth, async (req, res) => {
  try {
    const client = getGraphClient(req.session.accessToken);
    const folders = await listMailFolders(client);
    logger.info('folders_list', { count: folders?.length ?? 0 });
    res.json({ folders });
  } catch (e) {
    logger.error('folders_list_failed', { reason: e.message });
    res.status(500).json({ error: { code: 'FOLDERS_FAILED', message: e.message } });
  }
});

app.get('/api/context', requireAuth, async (req, res) => {
  const { folderId = 'inbox', from: fromDate, to: toDate, top = 100, skip = 0, includeBody } = req.query;
  try {
    const client = getGraphClient(req.session.accessToken);
    const messages = await getMessagesInRange(client, folderId, fromDate, toDate, Number(top), Number(skip));
    const context = buildStructuredContext(messages, { includeBody: includeBody === 'true', bodyMaxChars: 300 });
    logger.info('context_fetched', { folderId, messageCount: messages?.length ?? 0 });
    res.json(context);
  } catch (e) {
    logger.error('context_fetch_failed', { reason: e.message });
    res.status(500).json({ error: { code: 'CONTEXT_FAILED', message: e.message } });
  }
});

app.post('/api/draft/preview', requireAuth, async (req, res) => {
  const { folderId = 'inbox', dateFrom, dateTo, to: recipient, subject, opener, closing, signature, top } = req.body || {};
  const to = req.body?.to || req.body?.recipient;
  if (!to) return apiError(res, 'MISSING_TO', 'Body "to" (recipient email) required', 400);
  try {
    const client = getGraphClient(req.session.accessToken);
    const messages = await getMessagesInRange(client, folderId, dateFrom, dateTo, Number(top) || 100, 0);
    const structuredContext = buildStructuredContext(messages);
    const defaultBlocks = getDefaultBlocks();
    const options = {
      opener: opener || defaultBlocks?.opener,
      closing: closing || defaultBlocks?.closing,
      signature: signature || defaultBlocks?.signature,
    };
    const { body } = await generateDraftBodyOnly(structuredContext, Array.isArray(to) ? to[0] : to, options);
    res.json({ body, subject: subject || '(No subject)' });
  } catch (e) {
    logger.error('draft_preview_failed', { reason: e.message });
    res.status(500).json({ error: { code: 'PREVIEW_FAILED', message: e.message } });
  }
});

app.post('/api/draft', requireAuth, async (req, res) => {
  const { folderId = 'inbox', dateFrom, dateTo, subject, opener, closing, signature, top } = req.body || {};
  const to = req.body.to || req.body.recipient;
  const toDate = req.body.toDate ?? dateTo;
  if (!to) return apiError(res, 'MISSING_TO', 'Body "to" (recipient email) required', 400);
  try {
    const client = getGraphClient(req.session.accessToken);
    const messages = await getMessagesInRange(client, folderId, dateFrom, toDate, Number(top) || 100, 0);
    const structuredContext = buildStructuredContext(messages);
    const defaultBlocks = getDefaultBlocks();
    const options = {
      opener: opener || defaultBlocks?.opener,
      closing: closing || defaultBlocks?.closing,
      signature: signature || defaultBlocks?.signature,
    };
    const { draft, body } = await createAndSaveDraft(client, structuredContext, { to, subject }, options);
    logger.info('draft_created', { draftId: draft.id, to });
    res.json({ id: draft.id, subject: draft.subject, bodyPreview: body.slice(0, 200) });
  } catch (e) {
    logger.error('draft_create_failed', { reason: e.message });
    res.status(500).json({ error: { code: 'DRAFT_FAILED', message: e.message } });
  }
});

app.listen(config.port, () => {
  logger.info('server_started', { port: config.port, baseUrl: config.baseUrl });
});

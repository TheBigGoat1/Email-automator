# Email Automator

Production-ready: controlled intelligence layer on Microsoft 365 mail. Structured context → LLM draft → Outlook Drafts. Credentials are entered in the app and stored encrypted on the server.

## Quick start

1. **Clone and install**  
   `git clone <repo> && cd antyparty_frontend && npm install`

2. **Environment**  
   Copy `env.example` to `.env`. Set at least:
   - `SESSION_SECRET` — strong random string (session + fallback encryption).
   - `ENCRYPTION_KEY` — strong random string for credential encryption (recommended).
   - `BASE_URL` — e.g. `http://localhost:3000` (or your public URL for OAuth).

3. **Run**  
   `npm start` (or `npm run dev` for watch mode).

4. **Configure in the app**  
   Open the app → **Configure** tab. Enter Azure Application (client) ID and client secret. Optional: tenant ID, **OpenAI API key** (for LLM drafts). You can also set default opener, closing, and signature for drafts. Submit (CSRF token is sent automatically).

5. **Sign in and use**  
   **Sign in with Microsoft** → **Dashboard**: load folders, get context, generate draft preview, confirm & save to Drafts. **Sign out** via the header link.

## Azure app registration

- [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → New registration.
- **Redirect URI**: Web → `{BASE_URL}/auth/callback`.
- **Certificates & secrets**: create a client secret.
- **API permissions**: Delegated — `Mail.Read`, `Mail.ReadWrite`, `offline_access`, `openid`, `profile`.

## Flow

1. **Configure** — In the app, enter Azure (and optional OpenAI) credentials and optional default blocks. Stored encrypted (AES-256-GCM); never returned to the browser.
2. **Sign in** — Microsoft 365 OAuth (Mail.Read, Mail.ReadWrite).
3. **Use** — Load folders, get structured context (participants, contacts, threads, tone), generate draft preview, then save to Outlook Drafts.

## API (after sign-in)

- `GET /api/folders` — list mail folders  
- `GET /api/context?folderId=inbox&from=...&to=...&top=...&includeBody=...&bodyMaxChars=...` — structured context (optional body snippets)  
- `POST /api/draft/preview` — body: `{ to, subject?, folderId?, dateFrom?, dateTo?, top?, opener?, closing?, signature? }` — returns `{ body, subject }` without saving  
- `POST /api/draft` — same body — creates draft in Outlook Drafts  

Config (no auth): `GET /api/config/status`, `GET /api/config/default-blocks`, `GET /api/csrf`, `POST /api/config` (body: `azureClientId`, `azureClientSecret`, `azureTenantId?`, `openaiApiKey?`, `opener?`, `closing?`, `signature?`, `csrfToken`).

## Health and security

- **Health** — `GET /health` → `{ ok, configured, timestamp }`.
- **Rate limiting** — General API, config, and auth endpoints are rate-limited.
- **CSRF** — Config updates require a CSRF token (from `GET /api/me` or `GET /api/csrf`).
- **Logout** — `GET /logout` destroys the session.

## Logging

- Key events are logged to the console and to `logs/app-YYYY-MM-DD.log` (daily, size-based rotation). JSON lines; no secrets or tokens.

## Docker

- **Build and run**  
  `docker build -t email-automator .`  
  `docker run -p 3000:3000 -e SESSION_SECRET=... -e ENCRYPTION_KEY=... -e BASE_URL=http://localhost:3000 email-automator`

- **Compose**  
  Set `SESSION_SECRET` and `ENCRYPTION_KEY` in the environment, then:  
  `docker compose up -d`  
  Logs are persisted in the `app-logs` volume.

## Tests

- `npm test` — runs `node --test test/` (context, draft blocks, logger).

## Security

- **Credentials** — Encrypted at rest (AES-256-GCM). Key from `ENCRYPTION_KEY` or derived from `SESSION_SECRET`. Stored in `.credentials.enc` (add to `.gitignore`; already listed).
- **Session** — HttpOnly, SameSite cookies; `secure: true` in production.
- Run behind HTTPS in production; set `NODE_ENV=production` and strong `SESSION_SECRET` and `ENCRYPTION_KEY`.

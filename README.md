# Email Automator

Production-ready: controlled intelligence layer on Microsoft 365 mail. Structured context → LLM draft → Outlook Drafts. Credentials are entered in the app and stored encrypted on the server.

## Flow

1. **Configure** — In the app, enter Azure Application (client) ID, client secret, optional tenant ID and OpenAI API key. Stored encrypted (AES-256-GCM) on the server; never returned to the browser.
2. **Sign in** — Microsoft 365 OAuth (Mail.Read, Mail.ReadWrite).
3. **Use** — Load folders, get structured context (participants, contacts, threads), generate drafts with optional LLM, save to Outlook Drafts.

## Run (production)

1. **Server env (required for encryption and session)**  
   Create a `.env` file (see `env.example`). Set at least:
   - `SESSION_SECRET` — strong random string for session and (if no `ENCRYPTION_KEY`) credential encryption.
   - `ENCRYPTION_KEY` — (recommended) strong random string used to encrypt stored credentials. If unset, encryption uses a key derived from `SESSION_SECRET`.
   - `BASE_URL` — e.g. `https://your-domain.com` in production.

2. **Install and start**  
   `npm install` then `npm start` (or `npm run dev`).

3. **First use**  
   Open the app. You’ll see **Configure credentials**. Enter:
   - **Azure Application (client) ID** and **Client secret** (from Azure Portal → Entra ID → App registrations). Redirect URI: `{BASE_URL}/auth/callback`. Delegated permissions: Mail.Read, Mail.ReadWrite, offline_access, openid, profile.
   - Optional: **Azure Tenant ID** (default `common`), **OpenAI API key** (for LLM drafts).  
   Submit → credentials are encrypted and saved. Then **Sign in with Microsoft** and use Folders, Context, Create draft.

## Logging

- **Production logs** — Key events are logged to the console and to `logs/app.log` (created automatically): config save, login redirect, login success/failure (user identity only, no tokens), folders/context/draft API success and errors. Log lines are JSON. Never log secrets or tokens. Add `logs/` to your backup or log rotation.

## Security

- **Credentials** — Encrypted at rest with AES-256-GCM. Key from `ENCRYPTION_KEY` or derived from `SESSION_SECRET`. Stored in `.credentials.enc` (file mode 0600); add to `.gitignore` (already listed).
- **Session** — HttpOnly, SameSite cookies; use `secure: true` (HTTPS) in production.
- **Production** — Run behind HTTPS; set `NODE_ENV=production` and a strong `SESSION_SECRET` and `ENCRYPTION_KEY`.

## API (after sign-in)

- `GET /api/folders` — list mail folders  
- `GET /api/context?folderId=inbox&from=...&to=...&top=...` — structured context  
- `POST /api/draft` — body: `{ "to": "email", "subject": "...", "folderId", "dateFrom", "dateTo", "top" }` — creates draft in Outlook

Config (no auth): `GET /api/config/status` → `{ configured }`, `POST /api/config` → body `{ azureClientId, azureClientSecret, azureTenantId?, openaiApiKey? }` to set credentials.

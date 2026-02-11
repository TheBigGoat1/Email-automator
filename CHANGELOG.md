# Changelog

## [Unreleased]

### Added

- **Token refresh** — Access tokens are refreshed automatically using the session refresh token when calling protected APIs.
- **Health endpoint** — `GET /health` returns `{ ok, configured, timestamp }`.
- **Rate limiting** — General API (e.g. 120/min), config (10/15 min), auth (30/15 min).
- **Structured API errors** — All API errors return `{ error: { code, message } }`.
- **CSRF for config** — Config form requires CSRF token (`GET /api/csrf` or from `GET /api/me`); `POST /api/config` validates it.
- **Helmet** — Security headers (CSP disabled for app compatibility).
- **Log rotation** — Daily log files (`logs/app-YYYY-MM-DD.log`) and size-based rotation (e.g. 5 MB then backup).
- **Sign out** — `GET /logout` destroys the session and redirects to home.
- **Signed in as** — Dashboard header shows “Signed in as user@…” when authenticated.
- **Draft preview** — “Generate preview” calls `POST /api/draft/preview`; “Confirm & save to Drafts” calls `POST /api/draft`.
- **Default blocks** — Config can save optional opener, closing, and signature; dashboard loads them and draft form supports per-draft overrides.
- **Tone signals** — Context includes inferred tone (formal/casual/neutral) from subjects/previews; used in LLM prompt.
- **Pagination** — `getMessagesInRange` supports `skip` for paged mail.
- **Optional full body in context** — `GET /api/context?includeBody=true&bodyMaxChars=...` includes `recentBodies`.
- **Env validation** — `validateEnv()` at startup enforces `SESSION_SECRET` / `ENCRYPTION_KEY` length in production.
- **Docker** — `Dockerfile` and `docker-compose.yml` for running the app in a container.
- **Tests** — `node --test test/` for context, draft blocks, and logger.

### Changed

- Config POST body now accepts `opener`, `closing`, `signature` and optional `csrfToken`.
- Draft and draft/preview accept `opener`, `closing`, `signature`; fall back to stored default blocks.

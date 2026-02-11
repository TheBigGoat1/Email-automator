/**
 * Validate required env for production. Exit with clear message if missing.
 */
export function validateEnv() {
  const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || String(secret).length < 16) {
      console.error('Production requires SESSION_SECRET or ENCRYPTION_KEY (min 16 chars). Set in .env.');
      process.exit(1);
    }
  } else if (!secret || String(secret) === 'change-me-in-production' || String(secret) === 'dev-secret') {
    console.warn('Set SESSION_SECRET or ENCRYPTION_KEY in .env for production.');
  }
  return true;
}

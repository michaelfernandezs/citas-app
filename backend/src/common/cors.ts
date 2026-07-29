export function buildCorsOriginChecker() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === '*') return true;

  const allowedOrigins = raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);

    callback(null, isAllowed);
  };
}
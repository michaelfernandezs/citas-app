/**
 * Construye la configuración de CORS a partir de la variable de entorno
 * CORS_ORIGIN (uno o varios dominios separados por coma). Cualquier
 * subdominio *.vercel.app se permite automáticamente (útil para previews).
 * La usan tanto el servidor HTTP (main.ts) como el gateway de WebSockets.
 */
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

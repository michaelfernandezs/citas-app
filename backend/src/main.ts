import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

function buildCorsOrigin() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || raw.trim() === '*') return '*';

  // Permite pasar varios dominios separados por coma en CORS_ORIGIN
  const allowedOrigins = raw
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Peticiones sin 'origin' (ej. curl, health checks) siempre pasan
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes(origin) ||
      // Cualquier preview/deploy de Vercel del mismo proyecto (*.vercel.app)
      /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);

    callback(null, isAllowed);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: buildCorsOrigin() });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Backend corriendo en el puerto ${port}`);
}
bootstrap();
# Backend — Sistema de citas con fila virtual

NestJS + Prisma + PostgreSQL + JWT.

## Desarrollo local

1. Necesitas PostgreSQL corriendo localmente (o usa Docker: `docker run --name citas-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=citas -p 5432:5432 -d postgres`).
2. Copia `.env.example` a `.env` y ajusta `DATABASE_URL`.
3. Instala dependencias:
   ```
   npm install
   ```
   (esto ya corre `prisma generate` automáticamente por el script `postinstall`)
4. Crea las tablas:
   ```
   npx prisma migrate dev --name init
   ```
5. Crea el primer usuario admin:
   ```
   npm run prisma:seed
   ```
   Esto crea un admin con el email/password definidos en `.env` (o los valores por defecto si no los pusiste).
6. Levanta el servidor:
   ```
   npm run start:dev
   ```
   La API queda en `http://localhost:3000`.

## Endpoints principales

### Auth
- `POST /auth/register` — `{ email, password, name, phone? }` → crea un paciente
- `POST /auth/login` — `{ email, password }` → devuelve `{ accessToken, user }`

Todas las rutas de abajo requieren header `Authorization: Bearer <accessToken>`.

### Paciente
- `GET /appointments/open` — lista espacios disponibles
- `POST /appointments/:id/book` — agenda un espacio abierto
- `GET /appointments/mine` — mis citas
- `DELETE /appointments/:id` — cancela mi cita (dispara la fila virtual automáticamente)
- `POST /waitlist/join` — unirme a la fila virtual
- `DELETE /waitlist/:entryId` — salir de la fila (solo si sigo en espera)
- `GET /waitlist/me` — mi posición/estado en la fila
- `POST /waitlist/:entryId/respond` — `{ accept: true|false }` responder a una oferta

### Admin (requiere usuario con rol ADMIN)
- `POST /appointments/admin/slots` — crear un espacio suelto `{ startsAt, durationMinutes }`
- `POST /appointments/admin/slots/recurring` — crear espacios recurrentes `{ fromDate, toDate, startHour, endHour, durationMinutes, excludeWeekdays? }`
- `GET /appointments/admin/all` — ver todas las citas
- `DELETE /appointments/admin/:id` — cancelar cualquier cita (dispara la fila virtual)

## Despliegue en Railway

1. Crea un proyecto nuevo en Railway, conecta este repo (carpeta `backend`).
2. Agrega el plugin de **PostgreSQL** — Railway inyecta `DATABASE_URL` automáticamente.
3. En variables de entorno del servicio agrega: `JWT_SECRET`, `CORS_ORIGIN` (la URL de tu frontend), y opcionalmente `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
4. Railway detecta Node automáticamente y corre `npm install` (que genera el cliente de Prisma) y luego `npm run build` + `npm run start:prod` (que aplica migraciones pendientes antes de arrancar).
5. Después del primer deploy, corre el seed una sola vez desde la terminal de Railway (o localmente apuntando a la DB de producción):
   ```
   npm run prisma:seed
   ```

## Notas importantes

- **Cron de expiración**: corre dentro del mismo proceso con `@nestjs/schedule`, cada minuto revisa ofertas vencidas. Funciona bien en Railway porque el servicio es un proceso persistente (no serverless).
- **Ventana de oferta**: 3 horas, definida en `src/waitlist/waitlist.service.ts` (constante `OFFER_WINDOW_HOURS`).
- **Notificaciones**: por ahora solo se loggea cuando se ofrece un espacio (ver `TODO` en `waitlist.service.ts`). Falta conectar un proveedor de email (Resend/Nodemailer) — se puede agregar después sin tocar la lógica de negocio.
- **Si escalas a más de una instancia** del backend, el cron podría duplicarse. La lógica ya usa transacciones (`$transaction`) para evitar asignar el mismo espacio dos veces, pero si esto crece te conviene mover el cron a un servicio aparte o usar un lock distribuido.

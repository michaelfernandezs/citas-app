# Migración del backend a Supabase

Esta implementación permite ejecutar la app Angular con Supabase Auth, PostgreSQL
(RPC transaccional), Cron y una Edge Function para correos de ofertas, sin NestJS
ni Socket.IO en producción. El backend original se conserva para volver al modo anterior.

## 1. Crear el proyecto y aplicar SQL

Crear un proyecto Supabase. En **SQL Editor**, ejecutar estos archivos en orden:

1. `migrations/202610260001_citas.sql`
2. `migrations/202610260002_email_worker.sql`

Alternativa con CLI: `supabase link --project-ref TU_PROJECT_REF` y `supabase db push`.
Las migraciones se aplican una vez. No ejecutar `tests/bootstrap.sql` en Supabase:
solo emula Auth en una base local vacía para pruebas.

Las tablas están en el esquema privado `citas`, con RLS y sin permisos para los
clientes. La única API de negocio expuesta es `public.citas_api`, accesible para
usuarios autenticados. La identidad viene de `auth.uid()` y el rol del perfil
protegido; no se confía en el rol enviado desde Angular o metadata del registro.
No añadir `citas` a los esquemas expuestos de la Data API.

## 2. Configurar Auth

En **Authentication → URL Configuration**:

- Site URL: URL pública del frontend.
- Redirect URLs: añadir `https://TU-FRONTEND/login` y
  `https://TU-FRONTEND/recuperar-contrasena`.
- Para desarrollo añadir las mismas rutas con `http://localhost:4200`.

Mantener la confirmación de email activada. El registro sin sesión muestra una
indicación de confirmar el correo, y la sesión se restaura después de la confirmación.
En **Authentication → Email Templates → Reset Password**, usar este enlace:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Crear nueva contraseña</a>
```

La pantalla verifica el token con Supabase antes de cambiar la contraseña. No sirve
el enlace antiguo con el token de NestJS. El vencimiento lo controla Supabase Auth.
Configurar un proveedor SMTP propio en Auth para enviar confirmaciones y
recuperaciones a usuarios reales: el servicio de correo integrado tiene restricciones.
Se puede usar Resend como SMTP, además de su API para las ofertas.

## 3. Configurar Angular

Editar `frontend/src/environments/backend.ts`:

```ts
export const backend = {
  provider: 'supabase' as 'nest' | 'supabase',
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabasePublishableKey: 'TU_CLAVE_PUBLISHABLE_O_ANON',
};
```

La URL y la clave publishable/anon están en la configuración de conexión/API del
proyecto. Son públicas. **Nunca usar service_role o una clave secret en Angular**.
Esta configuración se comparte entre desarrollo y producción. En modo Supabase,
`environment.apiUrl` solo identifica los contratos internos interceptados; no se
hacen peticiones a Railway. Las sesiones de NestJS y Supabase se almacenan separadas.

Desde `frontend`: `npm ci`, `npm run build` y desplegar el frontend como antes.
Configurar el hosting para redirigir rutas Angular a `index.html`, incluido
`/recuperar-contrasena`. Para volver a NestJS cambiar `provider` a `nest` y recompilar.

## 4. Administrador y horarios

Registrar y confirmar primero la cuenta del administrador. Después, en SQL Editor:

```sql
update citas.profiles set role = 'ADMIN' where email = 'TU-CORREO';
```

Cerrar sesión y entrar de nuevo. Crear horarios desde la pantalla de administración.
La configuración inicial no incluye horarios ni citas de ejemplo.

La zona inicial es **UTC**, para conservar la interpretación usual del backend
Railway anterior. Antes de introducir horarios en una instalación nueva, elegir
la zona real del consultorio si los horarios deben representar hora de México:

```sql
update citas.config set timezone = 'America/Mexico_City' where id = 'singleton';
```

No cambiarla sin revisar horarios/citas si se importaron datos antiguos. Las citas
son instantes absolutos; la zona interpreta horarios recurrentes y excepciones.
Las ofertas reservan el espacio hasta ser aceptadas, rechazadas o expirar. La
reserva dura como máximo tres horas y nunca sobrepasa el inicio de la cita.

## 5. Correos de ofertas y tareas automáticas

Crear y guardar un secreto aleatorio para el worker (por ejemplo, generado con
`openssl rand -hex 32`). En los secretos de Edge Functions configurar:

- `RESEND_API_KEY`: clave del proveedor que ya usa el backend.
- `EMAIL_FROM`: remitente autorizado/verificado en Resend.
- `FRONTEND_URL`: URL pública de Angular.
- `CLINIC_TIMEZONE`: misma zona que `citas.config`.
- `OFFER_WORKER_SECRET`: el secreto aleatorio.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` están disponibles en el entorno alojado
de Edge Functions. No poner estos secretos en el frontend ni en git.

Desplegar con `supabase functions deploy send-offer-emails`. La función verifica
`x-worker-secret`; `verify_jwt=false` permite la llamada del cron con ese secreto.
Crear en **Vault** los secretos:

- `citas_project_url`: `https://TU-PROYECTO.supabase.co`.
- `citas_worker_secret`: mismo valor de `OFFER_WORKER_SECRET`.

Ejecutar `setup-cron.sql` una vez. La expiración y el envío corren cada minuto,
sin visitantes conectados. Revisar **Cron** y los logs de la Edge Function tras
la primera cancelación. Los correos se encolan dentro de la misma transacción de
la oferta. El worker reclama lotes de cinco, reintenta después de cinco minutos
(hasta diez intentos) y usa claves de idempotencia de Resend.

La interfaz consulta cambios cada 15 segundos mientras está abierta. Es una
sustitución de los avisos de Socket.IO; no requiere configurar Supabase Realtime.

## 6. Datos anteriores y validación del cambio

Estas migraciones crean un esquema nuevo; no importan ni borran datos de Railway.
Antes de cambiar producción decidir si se empieza vacío o se conserva la información.
Si se conserva, exportar la base anterior antes de perder acceso. Se necesita migrar
usuarios a Supabase Auth, mapear sus IDs y después importar citas, horarios, excepciones,
fila y ofertas. No copiar `passwordHash` al frontend ni convertirlo en contraseña.
No borrar Railway ni activar la nueva versión antes de validar la importación.

Probar con cuentas de administrador y dos pacientes: registro/confirmación, login,
recuperación de contraseña, disponibilidad, reservar/cancelar/reprogramar, hacer fila,
rechazar una oferta y aceptarla desde el siguiente paciente. Comprobar el correo y
la expiración con el navegador cerrado. Verificar que un paciente no pueda consultar
citas ajenas ni administrar horarios. Comprobar la zona horaria del consultorio.

El plan gratuito tiene cuotas y puede pausar proyectos por baja actividad; durante
una pausa tampoco ejecuta la app ni las tareas. Revisar los límites del proyecto
antes de usarlo para atención real.

## Pruebas locales

En PostgreSQL 15+ **vacío y desechable**:

```sh
psql "$LOCAL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/bootstrap.sql \
  -f supabase/migrations/202610260001_citas.sql \
  -f supabase/migrations/202610260002_email_worker.sql \
  -f supabase/tests/behavior.sql
```

`tsconfig.supabase.spec.json` aísla estas pruebas del spec inicial de Angular,
que todavía referencia un título eliminado de la aplicación.

`behavior.sql` revierte sus fixtures. Verifica permisos, validación, reserva,
reprogramación atómica, privacidad, FIFO, ofertas, expiración y cola de correos.
`python3 supabase/tests/concurrency.py` usa exclusivamente el PostgreSQL temporal
local en `/tmp`, puerto `55432`; verifica dos pacientes por un horario y dos
reservas simultáneas de un mismo paciente. No ejecutar bootstrap ni estos fixtures
en producción. `node supabase/tests/email-worker.test.mjs` valida el handler de correo con
servicios simulados (sin enviar correos). Auth real, SMTP, Cron y la Edge Function requieren prueba en el
proyecto alojado; la emulación local no los sustituye.

Para Angular:

```sh
cd frontend
npm run test:supabase
```

Referencias: [funciones y permisos](https://supabase.com/docs/guides/database/functions),
[Auth](https://supabase.com/docs/guides/auth/passwords),
[SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Cron y Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions).

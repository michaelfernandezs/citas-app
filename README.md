# Sistema de citas con fila virtual

Monorepo con dos proyectos independientes que comparten el mismo repositorio:

```
citas-app/
├── backend/    → NestJS + Prisma + PostgreSQL (API)
└── frontend/   → Angular (interfaz web)
```

Cada uno tiene su propio `package.json`, se instala y se despliega por separado — compartir repo no significa que compartan proceso ni build. Ambos tienen su propio README con el detalle completo:

- [`backend/README.md`](./backend/README.md)
- [`frontend/README.md`](./frontend/README.md)

## Por qué un solo repo

Railway, Vercel y Netlify soportan **"root directory"**: apuntas el servicio a la subcarpeta (`backend` o `frontend`) y cada uno instala/compila solo lo suyo, ignorando el resto del repo. Así puedes seguir modificando ambos proyectos y hacer `git push` una sola vez.

## Primer push a GitHub

Este proyecto ya tiene un repositorio git inicializado localmente. Para subirlo:

1. Crea un repositorio vacío en GitHub (sin README, sin .gitignore — ya los tienes aquí).
2. Conéctalo y sube el código:
   ```bash
   cd citas-app
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git branch -M main
   git push -u origin main
   ```

## Desplegar el backend (Railway)

1. En Railway, "New Project" → "Deploy from GitHub repo" → selecciona este repo.
2. En la configuración del servicio, busca **"Root Directory"** (o "Source") y ponlo en `backend`.
3. Agrega el plugin de **PostgreSQL** al proyecto — Railway inyecta `DATABASE_URL` automáticamente al servicio.
4. Agrega las variables de entorno del servicio: `JWT_SECRET`, `CORS_ORIGIN` (la URL de tu frontend cuando la tengas), `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
5. Railway detecta Node, corre `npm install` (que genera Prisma Client vía `postinstall`), luego build y `npm run start:prod` (aplica migraciones antes de arrancar).
6. Copia la URL pública que te da Railway (algo como `https://tu-backend.up.railway.app`) — la necesitas para el frontend.
7. Corre el seed una sola vez desde la terminal de Railway (pestaña del servicio):
   ```bash
   npm run prisma:seed
   ```

## Desplegar el frontend (Vercel o Netlify)

1. Antes de desplegar, edita `frontend/src/environments/environment.prod.ts` con la URL real de tu backend (paso 6 de arriba) y haz commit de ese cambio.
2. En Vercel/Netlify, "New Project" → conecta el mismo repo.
3. En **"Root Directory"** pon `frontend`.
4. Build command: `npx ng build --configuration production`
5. Output directory: `dist/frontend/browser`
6. Deploy.

## Flujo de trabajo después del primer deploy

Cada vez que hagas cambios (en backend, frontend, o ambos):

```bash
git add .
git commit -m "descripción del cambio"
git push
```

Railway y Vercel/Netlify detectan el push automáticamente y redeployan solo el servicio cuya carpeta cambió (o ambos, si tocaste los dos). No necesitas hacer nada manual además del push.

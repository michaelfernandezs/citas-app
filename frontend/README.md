# Frontend — Sistema de citas con fila virtual

Angular 18 (standalone components, signals).

## Desarrollo local

1. Instala dependencias (ya están instaladas si vienes del setup inicial):
   ```
   npm install
   ```
2. Asegúrate que `src/environments/environment.ts` apunte a tu backend local (`http://localhost:3000` por defecto).
3. Levanta el servidor de desarrollo:
   ```
   npx ng serve
   ```
   Abre `http://localhost:4200`.

## Pantallas incluidas

- `/login` — login y registro (todo registro público crea un paciente)
- `/` — dashboard del paciente: espacios abiertos, mis citas, unirse/salir de la fila, aceptar/rechazar ofertas
- `/admin` — panel del doctor/staff (requiere usuario con rol ADMIN, creado por el seed del backend): crear espacios sueltos o recurrentes, ver todas las citas, cancelar

## Antes de desplegar

Edita `src/environments/environment.prod.ts` y pon la URL real de tu backend en Railway:

```ts
export const environment = {
  production: true,
  apiUrl: 'https://tu-backend-real.up.railway.app',
};
```

## Build de producción

```
npx ng build --configuration production
```

Esto genera los archivos estáticos en `dist/frontend/browser`.

## Desplegar (opcional, junto al backend)

Para un SPA de Angular suele ser más simple usar **Vercel** o **Netlify** (gratis para proyectos pequeños, detectan Angular automáticamente):

1. Conecta el repo (carpeta `frontend`).
2. Build command: `npx ng build --configuration production`
3. Output directory: `dist/frontend/browser`

Si prefieres todo en Railway, puedes desplegarlo como un servicio Node con un servidor estático simple (ej. `serve`) apuntando a `dist/frontend/browser`.

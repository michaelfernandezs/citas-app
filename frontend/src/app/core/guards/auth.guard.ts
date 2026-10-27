import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.currentUser()) return true;
  router.navigate(['/login']);
  return false;
};

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.isAdmin()) return true;
  router.navigate(['/']);
  return false;
};

/** Si ya iniciaste sesión, no tiene sentido ver el login otra vez. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (!auth.currentUser()) return true;
  router.navigate([auth.isAdmin() ? '/admin' : '/']);
  return false;
};

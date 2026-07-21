import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/patient-dashboard/patient-dashboard.component').then((m) => m.PatientDashboardComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
  },
  { path: '**', redirectTo: '' },
];

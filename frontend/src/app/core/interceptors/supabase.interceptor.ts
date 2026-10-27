import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, map, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../services/supabase.service';

// Adapta los contratos HTTP existentes a la API transaccional de PostgreSQL.
export const supabaseInterceptor: HttpInterceptorFn = (req, next) => {
  const supabase = inject(SupabaseService);
  const prefix = `${environment.apiUrl}/`;
  if (!supabase.enabled || !req.url.startsWith(prefix)) return next(req);
  const path = req.url.slice(prefix.length);
  const route = `${req.method} ${path}`;
  const actions: Record<string, string> = {
    'GET auth/me': 'profile',
    'GET schedule/availability': 'availability',
    'GET appointments/mine': 'mine', 'GET appointments/booked': 'booked',
    'POST appointments/book': 'book', 'GET appointments/admin/all': 'admin.appointments',
    'POST waitlist/join': 'join', 'GET waitlist/me': 'waitlist',
    'GET schedule/working-hours': 'admin.hours', 'POST schedule/working-hours': 'admin.hours.create',
    'GET schedule/exceptions': 'admin.exceptions', 'POST schedule/exceptions': 'admin.exceptions.save',
    'GET schedule/config': 'admin.config', 'POST schedule/config': 'admin.config.save',
  };
  let action = actions[route];
  const payload: Record<string, unknown> = { ...(req.body as Record<string, unknown> ?? {}) };
  for (const key of req.params.keys()) payload[key] = req.params.get(key);
  const dynamic: [RegExp, string][] = [
    [/^POST appointments\/([^/]+)\/reschedule$/, 'reschedule'],
    [/^DELETE appointments\/admin\/([^/]+)$/, 'admin.cancel'],
    [/^DELETE appointments\/([^/]+)$/, 'cancel'],
    [/^DELETE waitlist\/([^/]+)$/, 'leave'],
    [/^POST waitlist\/([^/]+)\/respond$/, 'respond'],
    [/^DELETE schedule\/working-hours\/([^/]+)$/, 'admin.hours.delete'],
    [/^DELETE schedule\/exceptions\/([^/]+)$/, 'admin.exceptions.delete'],
  ];
  for (const [pattern, name] of dynamic) {
    const match = route.match(pattern);
    if (match) { action = name; payload['id'] = match[1]; break; }
  }
  if (!action) return throwError(() => new Error(`Ruta sin migrar a Supabase: ${route}`));
  return from(supabase.rpc(action, payload)).pipe(map(body => new HttpResponse({ body, status: 200, url: req.url })));
};

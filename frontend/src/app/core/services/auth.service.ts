import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, defer, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, User, UserProfile } from '../models/models';

import { backend } from '../../../environments/backend';
import { SupabaseService, backendError } from './supabase.service';

const TOKEN_KEY = 'citas_token';
const USER_KEY = backend.provider === 'supabase' ? 'citas_supabase_user' : 'citas_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private recoveryToken: string | null = null;
  readonly ready: Promise<void>;
  currentUser = signal<User | null>(this.readStoredUser());

  constructor(
    private http: HttpClient,
    private router: Router,
    private supabase: SupabaseService,
  ) {
    if (this.supabase.enabled) {
      this.supabase.client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
          localStorage.removeItem(USER_KEY);
          this.currentUser.set(null);
        }
      });
      this.ready = this.restoreSupabaseSession();
    } else { this.ready = Promise.resolve(); }
  }

  private async restoreSupabaseSession() {
    try {
      const { data, error } = await this.supabase.client.auth.getSession();
      if (error) throw error;
      if (!data.session) { localStorage.removeItem(USER_KEY); this.currentUser.set(null); return; }
      await this.supabaseProfile(data.session.access_token);
    } catch { localStorage.removeItem(USER_KEY); this.currentUser.set(null); }
  }

  private async supabaseProfile(accessToken: string): Promise<AuthResponse> {
    const profile = await this.supabase.rpc<UserProfile>('profile');
    const result = { accessToken, user: { id: profile.id, email: profile.email, role: profile.role } };
    localStorage.setItem(USER_KEY, JSON.stringify(result.user));
    this.currentUser.set(result.user);
    return result;
  }

  private supabaseRequest<T>(request: () => Promise<T>): Observable<T> {
    return defer(async () => {
      try { return await request(); } catch (error) { throw backendError(error); }
    });
  }

  register(payload: { email: string; password: string; name: string; phone?: string }): Observable<AuthResponse | null> {
    if (this.supabase.enabled) return this.supabaseRequest(async () => {
      const { data, error } = await this.supabase.client.auth.signUp({
        email: payload.email, password: payload.password,
        options: { data: { name: payload.name, phone: payload.phone }, emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      if (!data.session) return null;
      return this.supabaseProfile(data.session.access_token);
    });
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/register`, payload)
      .pipe(tap((res) => this.persistSession(res)));
  }

  login(payload: { email: string; password: string }): Observable<AuthResponse> {
    if (this.supabase.enabled) return this.supabaseRequest(async () => {
      const { data, error } = await this.supabase.client.auth.signInWithPassword(payload);
      if (error) throw error;
      return this.supabaseProfile(data.session.access_token);
    });
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, payload)
      .pipe(tap((res) => this.persistSession(res)));
  }

  forgotPassword(email: string) {
    if (this.supabase.enabled) return this.supabaseRequest(async () => {
      const { error } = await this.supabase.client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/recuperar-contrasena`,
      });
      if (error) throw error;
      return { message: 'Si existe una cuenta con ese correo, recibirás un enlace para recuperar tu contraseña.' };
    });
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string) {
    if (this.supabase.enabled) return this.supabaseRequest(async () => {
      if (this.recoveryToken !== token) {
        const { error } = await this.supabase.client.auth.verifyOtp({ token_hash: token, type: 'recovery' });
        if (error) throw error;
        this.recoveryToken = token;
      }
      const result = await this.supabase.client.auth.updateUser({ password });
      if (result.error) throw result.error;
      await this.supabase.client.auth.signOut();
      return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
    });
    return this.http.post<{ message: string }>(`${environment.apiUrl}/auth/reset-password`, { token, password });
  }

  logout() {
    this.recoveryToken = null;
    if (this.supabase.enabled) void this.supabase.client.auth.signOut();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this.supabase.enabled ? null : localStorage.getItem(TOKEN_KEY);
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'ADMIN';
  }

  getProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(`${environment.apiUrl}/auth/me`);
  }

  private persistSession(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.currentUser.set(res.user);
  }

  private readStoredUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
}

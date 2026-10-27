import { Injectable } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { backend } from '../../../environments/backend';

export function backendError(error: unknown): HttpErrorResponse {
  if (error instanceof HttpErrorResponse) return error;
  const value = error as { message?: string; status?: number; code?: string };
  return new HttpErrorResponse({
    status: value?.status ?? (value?.code?.startsWith('PT') ? Number(value.code.slice(2)) : 400),
    error: { message: value?.message ?? 'No se pudo completar la solicitud.' },
  });
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly enabled = backend.provider === 'supabase';
  private instance?: SupabaseClient;

  get client(): SupabaseClient {
    if (!this.enabled || !backend.supabaseUrl || !backend.supabasePublishableKey) {
      throw new Error('Configura la URL y la clave pública de Supabase en environments/backend.ts.');
    }
    return this.instance ??= createClient(backend.supabaseUrl, backend.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'citas_supabase_session' },
    });
  }

  async rpc<T>(action: string, payload: unknown = {}): Promise<T> {
    try {
      const { data, error } = await this.client.rpc('citas_api', { action, payload });
      if (error) throw error;
      return data as T;
    } catch (error) { throw backendError(error); }
  }
}

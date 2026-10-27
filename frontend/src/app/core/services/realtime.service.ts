import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject, Subscription, interval } from 'rxjs';
import { environment } from '../../../environments/environment';
import { backend } from '../../../environments/backend';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private polling?: Subscription;
  private socket: Socket | null = null;
  private update$ = new Subject<void>();

  constructor(private auth: AuthService) {}

  /** Abre la conexión de WebSocket usando el mismo token de la sesión. */
  connect() {
    if (backend.provider === 'supabase') {
      this.polling ??= interval(15000).subscribe(() => this.update$.next());
      return;
    }
    const token = this.auth.getToken();
    if (!token || this.socket) return;

    this.socket = io(environment.apiUrl, { auth: { token } });

    // Ambos avisos (oferta personal, o disponibilidad general) disparan lo mismo:
    // "algo cambió, vuelve a pedir tus datos".
    this.socket.on('waitlist:update', () => this.update$.next());
    this.socket.on('availability:update', () => this.update$.next());
  }

  disconnect() {
    this.polling?.unsubscribe();
    this.polling = undefined;
    this.socket?.disconnect();
    this.socket = null;
  }

  onUpdate() {
    return this.update$.asObservable();
  }
}

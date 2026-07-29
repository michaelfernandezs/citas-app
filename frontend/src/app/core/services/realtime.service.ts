import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private socket: Socket | null = null;
  private update$ = new Subject<void>();

  constructor(private auth: AuthService) {}

  connect() {
    const token = this.auth.getToken();
    if (!token || this.socket) return;

    this.socket = io(environment.apiUrl, { auth: { token } });

    this.socket.on('waitlist:update', () => this.update$.next());
    this.socket.on('availability:update', () => this.update$.next());
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  onUpdate() {
    return this.update$.asObservable();
  }
}
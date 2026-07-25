import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FreeSlot, ScheduleConfig, ScheduleException, WorkingHours } from '../models/models';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private base = `${environment.apiUrl}/schedule`;

  constructor(private http: HttpClient) {}

  // Cualquier usuario logueado
  getAvailability(from: string, to: string): Observable<FreeSlot[]> {
    return this.http.get<FreeSlot[]>(`${this.base}/availability`, { params: { from, to } });
  }

  // Admin: horario recurrente
  listWorkingHours(): Observable<WorkingHours[]> {
    return this.http.get<WorkingHours[]>(`${this.base}/working-hours`);
  }

  createWorkingHours(payload: { weekday: number; startTime: string; endTime: string }): Observable<WorkingHours> {
    return this.http.post<WorkingHours>(`${this.base}/working-hours`, payload);
  }

  deleteWorkingHours(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/working-hours/${id}`);
  }

  // Admin: excepciones
  listExceptions(): Observable<ScheduleException[]> {
    return this.http.get<ScheduleException[]>(`${this.base}/exceptions`);
  }

  upsertException(payload: {
    date: string;
    isClosed: boolean;
    startTime?: string;
    endTime?: string;
  }): Observable<ScheduleException> {
    return this.http.post<ScheduleException>(`${this.base}/exceptions`, payload);
  }

  deleteException(id: string): Observable<unknown> {
    return this.http.delete(`${this.base}/exceptions/${id}`);
  }

  // Admin: configuración
  getConfig(): Observable<ScheduleConfig> {
    return this.http.get<ScheduleConfig>(`${this.base}/config`);
  }

  updateConfig(payload: Partial<ScheduleConfig>): Observable<ScheduleConfig> {
    return this.http.post<ScheduleConfig>(`${this.base}/config`, payload);
  }
}
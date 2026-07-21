import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Appointment } from '../models/models';

@Injectable({ providedIn: 'root' })
export class AppointmentsService {
  private base = `${environment.apiUrl}/appointments`;

  constructor(private http: HttpClient) {}

  // Paciente
  listOpen(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.base}/open`);
  }

  book(id: string): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.base}/${id}/book`, {});
  }

  listMine(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.base}/mine`);
  }

  cancel(id: string): Observable<Appointment> {
    return this.http.delete<Appointment>(`${this.base}/${id}`);
  }

  // Admin
  listAllForAdmin(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.base}/admin/all`);
  }

  createSlot(payload: { startsAt: string; durationMinutes: number }): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.base}/admin/slots`, payload);
  }

  createRecurringSlots(payload: {
    fromDate: string;
    toDate: string;
    startHour: number;
    endHour: number;
    durationMinutes: number;
    excludeWeekdays?: number[];
  }): Observable<{ created: number }> {
    return this.http.post<{ created: number }>(`${this.base}/admin/slots/recurring`, payload);
  }

  cancelAsAdmin(id: string): Observable<Appointment> {
    return this.http.delete<Appointment>(`${this.base}/admin/${id}`);
  }
}

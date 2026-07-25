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
  book(startsAt: string): Observable<Appointment> {
    return this.http.post<Appointment>(`${this.base}/book`, { startsAt });
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

  cancelAsAdmin(id: string): Observable<Appointment> {
    return this.http.delete<Appointment>(`${this.base}/admin/${id}`);
  }
}
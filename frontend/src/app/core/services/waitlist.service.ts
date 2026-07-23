import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MyWaitlistStatus, WaitlistEntry } from '../models/models';

@Injectable({ providedIn: 'root' })
export class WaitlistService {
  private base = `${environment.apiUrl}/waitlist`;

  constructor(private http: HttpClient) {}

  join(preference?: {
    preferredWeekday?: number;
    preferredStartTime?: string;
    preferredEndTime?: string;
  }): Observable<WaitlistEntry> {
    return this.http.post<WaitlistEntry>(`${this.base}/join`, preference ?? {});
  }

  leave(entryId: string): Observable<WaitlistEntry> {
    return this.http.delete<WaitlistEntry>(`${this.base}/${entryId}`);
  }

  myStatus(): Observable<MyWaitlistStatus> {
    return this.http.get<MyWaitlistStatus>(`${this.base}/me`);
  }

  respond(entryId: string, accept: boolean): Observable<unknown> {
    return this.http.post(`${this.base}/${entryId}/respond`, { accept });
  }
}

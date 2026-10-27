import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../services/supabase.service';
import { supabaseInterceptor } from './supabase.interceptor';

describe('Supabase transport', () => {
  let rpc: jasmine.Spy;
  let client: HttpClient;
  let http: HttpTestingController;
  let service: { enabled: boolean; rpc: jasmine.Spy };
  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo({ id: 'result' });
    service = { enabled: true, rpc };
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([supabaseInterceptor])), provideHttpClientTesting(),
      { provide: SupabaseService, useValue: service },
    ] });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('passes date filters to the database without contacting Railway', async () => {
    const result = await firstValueFrom(client.get(`${environment.apiUrl}/schedule/availability`, { params: { from: '2026-11-01', to: '2026-11-03' } }));
    expect(result).toEqual({ id: 'result' });
    expect(rpc).toHaveBeenCalledOnceWith('availability', { from: '2026-11-01', to: '2026-11-03' });
    http.expectNone(`${environment.apiUrl}/schedule/availability`);
  });
  it('preserves the original appointment identifier when rescheduling', async () => {
    await firstValueFrom(client.post(`${environment.apiUrl}/appointments/abc/reschedule`, { startsAt: '2026-11-02T12:00:00Z' }));
    expect(rpc).toHaveBeenCalledOnceWith('reschedule', { id: 'abc', startsAt: '2026-11-02T12:00:00Z' });
  });
  it('distinguishes admin cancellation from patient cancellation', async () => {
    await firstValueFrom(client.delete(`${environment.apiUrl}/appointments/admin/abc`));
    expect(rpc).toHaveBeenCalledOnceWith('admin.cancel', { id: 'abc' });
  });
  it('preserves false when rejecting an offer', async () => {
    await firstValueFrom(client.post(`${environment.apiUrl}/waitlist/abc/respond`, { accept: false }));
    expect(rpc).toHaveBeenCalledOnceWith('respond', { id: 'abc', accept: false });
  });
  it('fails closed for an endpoint that has not been migrated', async () => {
    await expectAsync(firstValueFrom(client.get(`${environment.apiUrl}/unknown`))).toBeRejectedWithError(/Ruta sin migrar/);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('keeps the NestJS mode available', async () => {
    service.enabled = false;
    const pending = firstValueFrom(client.get(`${environment.apiUrl}/appointments/mine`));
    http.expectOne(`${environment.apiUrl}/appointments/mine`).flush([]);
    expect(await pending).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

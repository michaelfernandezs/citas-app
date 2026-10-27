import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { backend } from '../../../environments/backend';

describe('Supabase authentication', () => {
  let auth: AuthService;
  let api: Record<string, jasmine.Spy>;
  let rpc: jasmine.Spy;
  let previousProvider: typeof backend.provider;
  beforeEach(async () => {
    previousProvider = backend.provider;
    backend.provider = 'supabase';
    localStorage.removeItem('citas_supabase_user');
    api = {
      onAuthStateChange: jasmine.createSpy(),
      getSession: jasmine.createSpy().and.resolveTo({ data: { session: null }, error: null }),
      signInWithPassword: jasmine.createSpy().and.resolveTo({ data: { session: { access_token: 'jwt' } }, error: null }),
      signUp: jasmine.createSpy().and.resolveTo({ data: { session: null }, error: null }),
      verifyOtp: jasmine.createSpy().and.resolveTo({ error: null }),
      updateUser: jasmine.createSpy().and.resolveTo({ error: null }),
      signOut: jasmine.createSpy().and.resolveTo({ error: null }),
    };
    rpc = jasmine.createSpy().and.resolveTo({ id: 'patient-id', email: 'patient@example.com', role: 'PATIENT' });
    TestBed.configureTestingModule({ providers: [provideHttpClient(),
      { provide: SupabaseService, useValue: { enabled: true, client: { auth: api }, rpc } },
      { provide: Router, useValue: { navigate: jasmine.createSpy() } },
    ] });
    auth = TestBed.inject(AuthService);
    await auth.ready;
  });
  afterEach(() => { backend.provider = previousProvider; localStorage.removeItem('citas_supabase_user'); });

  it('reads the role from the protected profile after login', async () => {
    const session = await firstValueFrom(auth.login({ email: 'patient@example.com', password: 'password' }));
    expect(rpc).toHaveBeenCalledOnceWith('profile');
    expect(session.user.role).toBe('PATIENT');
    expect(auth.currentUser()?.id).toBe('patient-id');
  });
  it('does not pretend registration is authenticated when confirmation is required', async () => {
    expect(await firstValueFrom(auth.register({ email: 'patient@example.com', password: 'password', name: 'Patient' }))).toBeNull();
    expect(auth.currentUser()).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it('does not change a password if the recovery token is invalid', async () => {
    api['verifyOtp'].and.resolveTo({ error: { message: 'Invalid token' } });
    await expectAsync(firstValueFrom(auth.resetPassword('invalid', 'new-password'))).toBeRejected();
    expect(api['updateUser']).not.toHaveBeenCalled();
  });
  it('allows retrying a password update without consuming the recovery token twice', async () => {
    api['updateUser'].and.returnValues(Promise.resolve({ error: { message: 'Password too weak' } }), Promise.resolve({ error: null }));
    await expectAsync(firstValueFrom(auth.resetPassword('recovery-hash', 'weak'))).toBeRejected();
    await firstValueFrom(auth.resetPassword('recovery-hash', 'a-stronger-password'));
    expect(api['verifyOtp']).toHaveBeenCalledTimes(1);
    expect(api['signOut']).toHaveBeenCalledTimes(1);
  });
});

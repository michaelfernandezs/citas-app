import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-password-reset', standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './password-reset.component.html',
  styleUrl: '../login/login.component.css',
})
export class PasswordResetComponent {
  token: string;
  email = '';
  password = '';
  confirmation = '';
  loading = signal(false);
  message = signal('');
  error = signal('');
  done = signal(false);
  constructor(private auth: AuthService, route: ActivatedRoute) {
    this.token = route.snapshot.queryParamMap.get('token_hash') ?? route.snapshot.queryParamMap.get('token') ?? '';
  }
  submit() {
    if (this.loading() || this.done()) return;
    this.error.set('');
    if (this.token && this.password !== this.confirmation) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.loading.set(true);
    const request = this.token ? this.auth.resetPassword(this.token, this.password) : this.auth.forgotPassword(this.email);
    request.subscribe({
      next: (result) => { this.loading.set(false); this.message.set(result.message); this.done.set(true); this.password = ''; this.confirmation = ''; },
      error: (err) => { this.loading.set(false); this.error.set(err?.error?.message ?? 'No se pudo completar la solicitud. Intenta de nuevo.'); },
    });
  }
}

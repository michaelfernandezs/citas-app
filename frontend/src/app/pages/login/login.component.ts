import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  mode = signal<'login' | 'register'>('login');
  loading = signal(false);
  error = signal<string | null>(null);

  email = '';
  password = '';
  name = '';
  phone = '';

  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}

  toggleMode() {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set(null);
  }

  submit() {
    this.loading.set(true);
    this.error.set(null);

    const onSuccess = () => {
      this.loading.set(false);
      const isAdmin = this.auth.isAdmin();
      this.router.navigate([isAdmin ? '/admin' : '/']);
    };
    const onError = (err: any) => {
      this.loading.set(false);
      this.error.set(err?.error?.message ?? 'Ocurrió un error, intenta de nuevo');
    };

    if (this.mode() === 'login') {
      this.auth.login({ email: this.email, password: this.password }).subscribe({ next: onSuccess, error: onError });
    } else {
      this.auth
        .register({ email: this.email, password: this.password, name: this.name, phone: this.phone || undefined })
        .subscribe({ next: onSuccess, error: onError });
    }
  }
}

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppointmentsService } from '../../core/services/appointments.service';
import { AuthService } from '../../core/services/auth.service';
import { Appointment } from '../../core/models/models';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  appointments = signal<Appointment[]>([]);
  loading = signal(true);
  actionError = signal<string | null>(null);
  actionMessage = signal<string | null>(null);

  // form: espacio suelto
  singleDate = '';
  singleTime = '';
  singleDuration = 30;

  // form: espacios recurrentes
  fromDate = '';
  toDate = '';
  startHour = 9;
  endHour = 17;
  recurringDuration = 30;
  excludeWeekends = true;

  constructor(
    private appointmentsService: AppointmentsService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.appointmentsService.listAllForAdmin().subscribe({
      next: (list) => {
        this.appointments.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  createSingleSlot() {
    this.actionError.set(null);
    this.actionMessage.set(null);
    if (!this.singleDate || !this.singleTime) {
      this.actionError.set('Falta la fecha u hora');
      return;
    }
    const startsAt = new Date(`${this.singleDate}T${this.singleTime}`).toISOString();
    this.appointmentsService.createSlot({ startsAt, durationMinutes: this.singleDuration }).subscribe({
      next: () => {
        this.actionMessage.set('Espacio creado');
        this.refresh();
      },
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo crear el espacio'),
    });
  }

  createRecurring() {
    this.actionError.set(null);
    this.actionMessage.set(null);
    if (!this.fromDate || !this.toDate) {
      this.actionError.set('Faltan las fechas del rango');
      return;
    }
    this.appointmentsService
      .createRecurringSlots({
        fromDate: this.fromDate,
        toDate: this.toDate,
        startHour: this.startHour,
        endHour: this.endHour,
        durationMinutes: this.recurringDuration,
        excludeWeekdays: this.excludeWeekends ? [0, 6] : [],
      })
      .subscribe({
        next: (res) => {
          this.actionMessage.set(`${res.created} espacios creados`);
          this.refresh();
        },
        error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo crear el rango de espacios'),
      });
  }

  cancelAppointment(id: string) {
    this.actionError.set(null);
    this.appointmentsService.cancelAsAdmin(id).subscribe({
      next: () => this.refresh(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo cancelar'),
    });
  }

  logout() {
    this.auth.logout();
  }

  hourLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  scheduledCount(): number {
    return this.appointments().filter((a) => a.status === 'SCHEDULED').length;
  }

  openCount(): number {
    return this.appointments().filter((a) => a.status === 'OPEN').length;
  }
}

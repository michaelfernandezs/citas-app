import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppointmentsService } from '../../core/services/appointments.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { AuthService } from '../../core/services/auth.service';
import { Appointment, ScheduleConfig, ScheduleException, WorkingHours } from '../../core/models/models';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.css',
})
export class AdminDashboardComponent implements OnInit {
  appointments = signal<Appointment[]>([]);
  workingHours = signal<WorkingHours[]>([]);
  exceptions = signal<ScheduleException[]>([]);
  config = signal<ScheduleConfig | null>(null);

  loading = signal(true);
  actionError = signal<string | null>(null);
  actionMessage = signal<string | null>(null);

  readonly weekdays = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
  ];

  newWeekday = 1;
  newStartTime = '09:00';
  newEndTime = '13:00';

  exceptionDate = '';
  exceptionIsClosed = true;
  exceptionStartTime = '09:00';
  exceptionEndTime = '12:00';

  slotDurationMinutes = 30;
  bufferMinutes = 0;
  minNoticeHours = 2;
  maxAdvanceDays = 30;

  constructor(
    private appointmentsService: AppointmentsService,
    private scheduleService: ScheduleService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);

    this.appointmentsService.listAllForAdmin().subscribe((list) => this.appointments.set(list));
    this.scheduleService.listWorkingHours().subscribe((list) => this.workingHours.set(list));
    this.scheduleService.listExceptions().subscribe((list) => this.exceptions.set(list));
    this.scheduleService.getConfig().subscribe((cfg) => {
      this.config.set(cfg);
      this.slotDurationMinutes = cfg.slotDurationMinutes;
      this.bufferMinutes = cfg.bufferMinutes;
      this.minNoticeHours = cfg.minNoticeHours;
      this.maxAdvanceDays = cfg.maxAdvanceDays;
      this.loading.set(false);
    });
  }

  weekdayLabel(value: number): string {
    return this.weekdays.find((w) => w.value === value)?.label ?? '';
  }

  minutesToLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  addWorkingHours() {
    this.actionError.set(null);
    this.actionMessage.set(null);
    this.scheduleService
      .createWorkingHours({ weekday: this.newWeekday, startTime: this.newStartTime, endTime: this.newEndTime })
      .subscribe({
        next: () => {
          this.actionMessage.set('Horario agregado');
          this.refresh();
        },
        error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo agregar el horario'),
      });
  }

  deleteWorkingHours(id: string) {
    this.actionError.set(null);
    this.scheduleService.deleteWorkingHours(id).subscribe({
      next: () => this.refresh(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo eliminar'),
    });
  }

  addException() {
    this.actionError.set(null);
    this.actionMessage.set(null);
    if (!this.exceptionDate) {
      this.actionError.set('Falta la fecha de la excepción');
      return;
    }
    this.scheduleService
      .upsertException({
        date: this.exceptionDate,
        isClosed: this.exceptionIsClosed,
        startTime: this.exceptionIsClosed ? undefined : this.exceptionStartTime,
        endTime: this.exceptionIsClosed ? undefined : this.exceptionEndTime,
      })
      .subscribe({
        next: () => {
          this.actionMessage.set('Excepción guardada');
          this.refresh();
        },
        error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo guardar la excepción'),
      });
  }

  deleteException(id: string) {
    this.actionError.set(null);
    this.scheduleService.deleteException(id).subscribe({
      next: () => this.refresh(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo eliminar'),
    });
  }

  saveConfig() {
    this.actionError.set(null);
    this.actionMessage.set(null);
    this.scheduleService
      .updateConfig({
        slotDurationMinutes: this.slotDurationMinutes,
        bufferMinutes: this.bufferMinutes,
        minNoticeHours: this.minNoticeHours,
        maxAdvanceDays: this.maxAdvanceDays,
      })
      .subscribe({
        next: () => {
          this.actionMessage.set('Configuración guardada');
          this.refresh();
        },
        error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo guardar la configuración'),
      });
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
}

import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppointmentsService } from '../../core/services/appointments.service';
import { WaitlistService } from '../../core/services/waitlist.service';
import { AuthService } from '../../core/services/auth.service';
import { Appointment, MyWaitlistStatus } from '../../core/models/models';
import { TicketComponent } from '../../shared/ticket/ticket.component';
import { WeekCalendarComponent } from '../../shared/week-calendar/week-calendar.component';

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, TicketComponent, WeekCalendarComponent],
  templateUrl: './patient-dashboard.component.html',
  styleUrl: './patient-dashboard.component.css',
})
export class PatientDashboardComponent implements OnInit {
  openSlots = signal<Appointment[]>([]);
  myAppointments = signal<Appointment[]>([]);
  waitlistStatus = signal<MyWaitlistStatus>({ inQueue: false });
  loading = signal(true);
  actionError = signal<string | null>(null);

  constructor(
    private appointmentsService: AppointmentsService,
    private waitlistService: WaitlistService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.refreshAll();
  }

  refreshAll() {
    this.loading.set(true);
    this.appointmentsService.listOpen().subscribe((slots) => this.openSlots.set(slots));
    this.appointmentsService.listMine().subscribe((mine) => this.myAppointments.set(mine));
    this.waitlistService.myStatus().subscribe({
      next: (status) => {
        this.waitlistStatus.set(status);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  book(id: string) {
    this.actionError.set(null);
    this.appointmentsService.book(id).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo agendar'),
    });
  }

  cancel(id: string) {
    this.actionError.set(null);
    this.appointmentsService.cancel(id).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo cancelar'),
    });
  }

  joinWaitlist() {
    this.actionError.set(null);
    this.waitlistService.join().subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo unir a la fila'),
    });
  }

  leaveWaitlist(entryId: string) {
    this.actionError.set(null);
    this.waitlistService.leave(entryId).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo salir de la fila'),
    });
  }

  respondOffer(entryId: string, accept: boolean) {
    this.actionError.set(null);
    this.waitlistService.respond(entryId, accept).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo responder a la oferta'),
    });
  }

  logout() {
    this.auth.logout();
  }

  hasScheduled(): boolean {
    return this.myAppointments().some((a) => a.status === 'SCHEDULED');
  }

  hourLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  }
}

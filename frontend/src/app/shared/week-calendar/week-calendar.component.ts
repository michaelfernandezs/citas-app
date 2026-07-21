import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Appointment } from '../../core/models/models';

interface DayGroup {
  dateLabel: string;
  dayNumber: string;
  isToday: boolean;
  slots: Appointment[];
}

@Component({
  selector: 'app-week-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './week-calendar.component.html',
  styleUrl: './week-calendar.component.css',
})
export class WeekCalendarComponent {
  @Output() book = new EventEmitter<string>();

  private _slots: Appointment[] = [];
  groups: DayGroup[] = [];

  @Input() set slots(value: Appointment[]) {
    this._slots = value ?? [];
    this.groups = this.groupByDay(this._slots);
  }

  get slots(): Appointment[] {
    return this._slots;
  }

  formatHour(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  private groupByDay(slots: Appointment[]): DayGroup[] {
    const map = new Map<string, Appointment[]>();
    for (const slot of slots) {
      const d = new Date(slot.startsAt);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(slot);
    }

    const today = new Date().toDateString();

    return Array.from(map.entries())
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([key, daySlots]) => {
        const d = new Date(daySlots[0].startsAt);
        return {
          dateLabel: d.toLocaleDateString('es-MX', { weekday: 'short', month: 'short' }),
          dayNumber: d.getDate().toString(),
          isToday: key === today,
          slots: daySlots.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
        };
      });
  }
}

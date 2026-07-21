import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-ticket',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ticket.component.html',
  styleUrl: './ticket.component.css',
})
export class TicketComponent {
  @Input() eyebrow = '';
  @Input() value = '';
  @Input() unit = '';
  @Input() meta = '';
  @Input() variant: 'default' | 'pine' | 'rust' = 'default';
}

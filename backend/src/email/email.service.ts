import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY no configurada: los emails solo se van a mostrar en la consola, no se van a enviar de verdad.',
      );
    }
  }

  /** Avisa por correo que se liberó la cita que el paciente estaba esperando. */
  async sendOfferEmail(to: string, startsAt: Date, expiresAt: Date) {
    const dateLabel = startsAt.toLocaleString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    });
    const expiresLabel = expiresAt.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

    const subject = 'Se liberó la cita que esperabas';
    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #17203a;">
        <h2>¡Buenas noticias!</h2>
        <p>Se liberó el espacio que estabas esperando:</p>
        <p style="font-size: 18px; font-weight: bold;">${dateLabel}</p>
        <p>Tienes hasta las <strong>${expiresLabel}</strong> para aceptarla desde la app, antes de que pase al siguiente en la fila.</p>
      </div>
    `;

    if (!this.resend) {
      this.logger.log(`[EMAIL SIMULADO] Para: ${to} | Asunto: "${subject}"`);
      return;
    }

    try {
      const result = await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to,
        subject,
        html,
      });

      if (result.error) {
        this.logger.error(`Resend rechazó el email a ${to}: ${JSON.stringify(result.error)}`);
      } else {
        this.logger.log(`Email enviado a ${to} (id: ${result.data?.id})`);
      }
    } catch (err) {
      this.logger.error(`Error enviando email a ${to}`, err as Error);
    }
  }
}
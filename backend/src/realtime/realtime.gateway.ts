import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { buildCorsOriginChecker } from '../common/cors';

@WebSocketGateway({
  cors: { origin: buildCorsOriginChecker(), credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private jwtService: JwtService) {}

  /**
   * Se ejecuta cada vez que un navegador abre la conexión de WebSocket.
   * Verificamos su token (el mismo JWT que usa para las peticiones normales)
   * y lo metemos a una "sala" (room) identificada por su patientId, para
   * poder avisarle solo a él más adelante.
   */
  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.['token'] as string | undefined;
      if (!token) throw new Error('sin token');

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'dev-secret-change-me',
      });

      client.join(`patient:${payload.sub}`);
      if (payload.role === 'ADMIN') client.join('admins');

      this.logger.log(`Cliente conectado por WebSocket: usuario ${payload.sub}`);
    } catch {
      this.logger.warn('Conexión de WebSocket rechazada: token inválido o ausente');
      client.disconnect();
    }
  }

  /** Le avisa a un paciente específico que algo relevante cambió (debe refrescar). */
  notifyPatient(patientId: string) {
    this.server.to(`patient:${patientId}`).emit('waitlist:update');
  }

  /** Avisa a TODOS los conectados que la disponibilidad cambió (se agendó o liberó algo). */
  broadcastAvailabilityUpdate() {
    this.server.emit('availability:update');
  }
}

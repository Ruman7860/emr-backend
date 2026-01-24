// src/queue/queue.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { OnModuleInit } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();

@WebSocketGateway({
  cors: {
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE"],
  },
})
export class QueueGateway
  implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) { }

  onModuleInit() {
    this.server.on('connection', (socket) => {
      console.log('Raw connection event:', socket.id);
    });
  }

  private getTenantRoom(tenantId: string) {
    return `tenant:${tenantId}`;
  }

  private getDoctorsRoom(tenantId: string) {
    return `tenant:${tenantId}:doctors`;
  }

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token;
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);

      /**
       * Expected payload:
       * {
       *   sub: userId,
       *   role: 'DOCTOR' | 'STAFF',
       *   tenantId: string
       * }
       */

      client.data.user = {
        userId: payload.id,
        role: payload.role,
        tenantId: payload.tenantId,
      };

      const room = this.getTenantRoom(payload.tenantId);
      console.log('joining room', room);
      client.join(room);

      if (payload.role === 'DOCTOR') {
        const doctorRoom = this.getDoctorsRoom(payload.tenantId);
        console.log('joining doctor room', doctorRoom);
        client.join(doctorRoom);
      }
    } catch (err) {
      console.log('Error:', err);
      client.disconnect();
    }
  }

  emitQueueAdd(payload: {
    tenantId: string;
    doctorId: string;
    visitId: string;
    patientName: string;
    visitDate: Date;
    room?: string;
  }) {
    const room = this.getDoctorsRoom(payload.tenantId);
    payload.room = room
    console.log("emitting queue add", room, payload)

    this.server.to(room).emit('QUEUE_ADD', payload);
  }

  emitQueueRemove(payload: {
    tenantId: string;
    doctorId: string;
    visitId: string;
  }) {
    const room = this.getDoctorsRoom(payload.tenantId);
    console.log("emitting queue remove", room)

    this.server.to(room).emit('QUEUE_REMOVE', payload);
  }

  emitConsultationStart(payload: {
    tenantId: string;
    patientId: string;
    visitId: string;
    doctorId: string;
    status: string;
  }) {
    // 1. Notify doctors (so they know it's taken)
    const doctorRoom = this.getDoctorsRoom(payload.tenantId);
    this.server.to(doctorRoom).emit('CONSULTATION_START', payload);

    // 2. Notify queue view (so it disappears from "Waiting")
    // If the queue view listens to QUEUE_UPDATE or similar, send it there.
    // Assuming the main tenant room is used for general queue updates:
    const tenantRoom = this.getTenantRoom(payload.tenantId);
    this.server.to(tenantRoom).emit('QUEUE_UPDATE', payload);
  }

  emitConsultationEnd(payload: {
    tenantId: string;
    patientId: string;
    visitId: string;
    doctorId: string;
    status: string;
    consultationTime: number;
  }) {
    // 1. Notify doctors (so they can see completed status)
    const doctorRoom = this.getDoctorsRoom(payload.tenantId);
    this.server.to(doctorRoom).emit('CONSULTATION_END', payload);

    // 2. Notify queue view for general updates
    const tenantRoom = this.getTenantRoom(payload.tenantId);
    this.server.to(tenantRoom).emit('QUEUE_UPDATE', payload);
  }

  handleDisconnect(client: Socket) {
    console.log('Client disconnected:', client.id);
  }
}

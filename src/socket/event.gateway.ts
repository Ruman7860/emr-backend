import { OnEvent } from "@nestjs/event-emitter";
import { JwtService } from "@nestjs/jwt";
import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "http";
import { Socket } from "socket.io";
import * as dotenv from 'dotenv';

dotenv.config();

@WebSocketGateway({
  cors: {
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
  }
})
export class EventGateway {
  @WebSocketServer()
  server: Server

  constructor(private readonly jwtService: JwtService) { }

  handleConnection(client: Socket) {
    const token = client.handshake.auth.token;
    console.log('Client connected event gateway:', client.id, token);

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
    } catch (err) {
      console.log('Error verifying token in EventGateway:', err.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log('client disconnected')
  }

  @OnEvent('queue.add')
  handleQueueAdd(payload: any) {
    console.log("Emitting queue.add event", payload)
    this.server.emit('queue.add', payload)
  }

  @OnEvent('queue.remove')
  handleQueueRemove(payload: any) {
    this.server.emit('queue.remove', payload)
  }
  @OnEvent('message')
  handleMessage(message: string) {
    this.server.emit('message', message)
  }

}
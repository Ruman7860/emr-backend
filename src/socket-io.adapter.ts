import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext } from '@nestjs/common';
import * as dotenv from 'dotenv';

dotenv.config();


export class SocketIoAdapter extends IoAdapter {
  private readonly allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';

  constructor(app: INestApplicationContext) {
    super(app);
  }

  public createIOServer(port: number, options?: any): any {
    const cors = {
      origin: this.allowedOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    };

    const optionsWithCORS = {
      ...options,
      cors: cors,
    };

    return super.createIOServer(port, optionsWithCORS);
  }
}
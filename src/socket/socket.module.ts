import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventGateway } from './event.gateway';


@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '24h' },
    }),
  ],
  providers: [EventGateway],
})
export class SocketModule { }
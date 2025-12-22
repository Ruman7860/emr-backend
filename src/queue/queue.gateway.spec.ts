import { Test, TestingModule } from '@nestjs/testing';
import { QueueGateway } from './queue.gateway';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

describe('QueueGateway', () => {
    let gateway: QueueGateway;
    let jwtService: JwtService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                QueueGateway,
                {
                    provide: JwtService,
                    useValue: {
                        verify: jest.fn(),
                    },
                },
            ],
        }).compile();

        gateway = module.get<QueueGateway>(QueueGateway);
        jwtService = module.get<JwtService>(JwtService);
    });

    it('should allow STAFF to connect and join tenant room BUT NOT doctor room', async () => {
        const mockSocket = {
            handshake: {
                auth: {
                    token: 'valid-token',
                },
                headers: {},
            },
            id: 'socket-1',
            data: {},
            join: jest.fn(),
            disconnect: jest.fn(),
        } as unknown as Socket;

        const payload = {
            id: 'user-1',
            role: 'STAFF',
            tenantId: 'tenant-123',
        };

        jest.spyOn(jwtService, 'verify').mockReturnValue(payload);

        await gateway.handleConnection(mockSocket);

        expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
        // Should join valid tenant room
        expect(mockSocket.join).toHaveBeenCalledWith('tenant:tenant-123');
        // Should NOT join doctor room
        expect(mockSocket.join).not.toHaveBeenCalledWith('tenant:tenant-123:doctors');
    });

    it('should allow DOCTOR to connect and join BOTH tenant room and doctor room', async () => {
        const mockSocket = {
            handshake: {
                auth: {
                    token: 'valid-token-doc',
                },
                headers: {},
            },
            id: 'socket-2',
            data: {},
            join: jest.fn(),
            disconnect: jest.fn(),
        } as unknown as Socket;

        const payload = {
            id: 'user-doc',
            role: 'DOCTOR',
            tenantId: 'tenant-123',
        };

        jest.spyOn(jwtService, 'verify').mockReturnValue(payload);

        await gateway.handleConnection(mockSocket);

        expect(mockSocket.join).toHaveBeenCalledWith('tenant:tenant-123');
        expect(mockSocket.join).toHaveBeenCalledWith('tenant:tenant-123:doctors');
    });
});

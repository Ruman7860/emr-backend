import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";


export enum Role {
    ADMIN = 'ADMIN',
    DOCTOR = 'DOCTOR',
    STAFF = 'STAFF',
}

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column({ type: "enum", enum: Role, default: Role.STAFF })
    role: Role;

    @Column({ nullable: true })
    name: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;
}
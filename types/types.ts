// types/types.ts
import { Role } from '@prisma/client';

export type UserType = {
  id: string;
  email: string;
  password: string;
  role: Role;
  name: string | null; // <- match Prisma User type exactly
  createdAt: Date;
};

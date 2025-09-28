import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seed() {
  const password = await bcrypt.hash('password123', 10);
  await prisma.user.createMany({
    data: [
      { email: 'admin@clinic.com', password, role: 'ADMIN', name: 'Dr. Admin' },
      { email: 'doctor@clinic.com', password, role: 'DOCTOR', name: 'Dr. Smith' },
      { email: 'staff@clinic.com', password, role: 'STAFF', name: 'Nurse Jane' },
    ],
  });
  await prisma.patient.createMany({
    data: [
      { name: 'John Doe', medicalHistory: 'Hypertension, Diabetes' },
      { name: 'Jane Roe', medicalHistory: 'Asthma' },
    ],
  });
  await prisma.inventory.createMany({
    data: [
      { itemName: 'Paracetamol', quantity: 100 },
      { itemName: 'Insulin', quantity: 50 },
    ],
  });
  console.log('Database seeded');
}

seed().then(() => prisma.$disconnect());
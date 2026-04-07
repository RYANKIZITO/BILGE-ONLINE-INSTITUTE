import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      // Your database URL here
      url: process.env.DATABASE_URL
    }
  }
});

export { prisma };

import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Handle BigInt serialization in JSON.stringify / Express res.json
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

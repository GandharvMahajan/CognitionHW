import { type Prisma, prisma } from '@fintech/db';

/** Anything accepting a Prisma client or an interactive transaction client. */
export type Db = Prisma.TransactionClient | typeof prisma;

export { prisma };

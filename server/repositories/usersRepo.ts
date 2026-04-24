/**
 * server/repositories/usersRepo.ts
 * CRUD for the users table.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { users, type NewUser, type User } from '../../src/db/schema.js';

export async function createUser(data: NewUser): Promise<User> {
  const [user] = await db.insert(users).values(data).returning();
  return user;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, email) });
}

export async function findUserById(id: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function updateUser(id: string, data: Partial<Pick<User, 'name' | 'subscriptionTier' | 'updatedAt'>>): Promise<User | undefined> {
  const [updated] = await db
    .update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return updated;
}

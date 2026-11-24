import type { InsertUser, User } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { getMongoDatabase } from "./mongo";

/** Compatibility helpers for the optional Manus OAuth route. */
export async function getDb() {
  return getMongoDatabase();
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getMongoDatabase();
  const existing = await db.collection("users").findOne({ openId: user.openId });
  const timestamp = new Date();
  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : existing?.role ?? "user");
  await db.collection("users").updateOne(
    { openId: user.openId },
    {
      $set: {
        ...(user.name !== undefined ? { name: user.name } : {}),
        ...(user.email !== undefined ? { email: user.email } : {}),
        ...(user.loginMethod !== undefined ? { loginMethod: user.loginMethod } : {}),
        ...(user.lastSignedIn !== undefined ? { lastSignedIn: user.lastSignedIn } : { lastSignedIn: timestamp }),
        role,
        updatedAt: timestamp,
      },
      $setOnInsert: { id: user.openId, openId: user.openId, createdAt: timestamp },
    },
    { upsert: true },
  );
}

export async function getUserByOpenId(openId: string): Promise<User | undefined> {
  const db = await getMongoDatabase();
  const user = await db.collection("users").findOne({ openId });
  if (!user) return undefined;
  return {
    id: typeof user.id === "number" ? user.id : 0,
    openId: user.openId,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? null,
    role: user.role === "admin" ? "admin" : "user",
    createdAt: user.createdAt instanceof Date ? user.createdAt : new Date(user.createdAt),
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt : new Date(user.updatedAt),
    lastSignedIn: user.lastSignedIn instanceof Date ? user.lastSignedIn : new Date(user.lastSignedIn),
  };
}

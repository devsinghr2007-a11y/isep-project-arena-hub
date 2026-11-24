import { MongoClient, type Db } from "mongodb";

let client: MongoClient | undefined;
let database: Db | undefined;
let indexesReady = false;

export async function getMongoDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MongoDB is not configured. Set MONGODB_URI in .env before starting ArenaHub.");
  }

  if (!database) {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    database = client.db(process.env.MONGODB_DB || "arenaHub");
  }

  if (!indexesReady) {
    await Promise.all([
      database.collection("users").createIndex({ email: 1 }, { unique: true }),
      database.collection("arenas").createIndex({ ownerId: 1, updatedAt: -1 }),
      database.collection("arenas").createIndex({ verificationStatus: 1, updatedAt: -1 }),
      database.collection("shopkeeperAssignments").createIndex({ ownerId: 1, arenaId: 1, shopkeeperId: 1 }, { unique: true }),
      database.collection("shopkeeperAssignments").createIndex({ shopkeeperId: 1, status: 1 }),
      database.collection("payoutProfiles").createIndex({ userId: 1 }, { unique: true }),
      database.collection("payments").createIndex({ purchaserId: 1, createdAt: -1 }),
      database.collection("payments").createIndex({ razorpayOrderId: 1 }, { unique: true, sparse: true }),
      database.collection("payments").createIndex({ status: 1, expiresAt: 1 }),
    ]);
    indexesReady = true;
  }

  return database;
}

export async function closeMongoDatabase() {
  await client?.close();
  client = undefined;
  database = undefined;
  indexesReady = false;
}

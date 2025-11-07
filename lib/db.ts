import { MongoClient } from "mongodb";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Please configure it in .env.local");
  }
  return uri;
}

export async function getDb() {
  if (!clientPromise) {
    client = new MongoClient(getMongoUri());
    clientPromise = client.connect();
  }
  const conn = await clientPromise!;
  return conn.db();
}

export async function getCollection(name: string) {
  const db = await getDb();
  return db.collection(name);
}
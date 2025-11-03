import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://root:aj0zyCCsIRa7oz8Ppgab87Uh@fitz-roy.liara.cloud:32802/my-app?authSource=admin";

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export async function getDb() {
  if (!clientPromise) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  const conn = await clientPromise;
  return conn.db();
}

export async function getCollection(name: string) {
  const db = await getDb();
  return db.collection(name);
}
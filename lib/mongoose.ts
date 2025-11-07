import mongoose from "mongoose";

let isConnected = false;

function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Please configure it in .env.local");
  }
  return uri;
}

export async function connectMongo() {
  if (isConnected) return;
  console.time("[Mongo] connect");
  await mongoose.connect(getMongoUri(), {
    // modern connection defaults are fine
  });
  console.timeEnd("[Mongo] connect");
  console.log("[Mongo] connected");
  isConnected = true;
}
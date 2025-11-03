import mongoose from "mongoose";

const uri = process.env.MONGODB_URI || "mongodb://root:aj0zyCCsIRa7oz8Ppgab87Uh@fitz-roy.liara.cloud:32802/my-app?authSource=admin";

let isConnected = false;

export async function connectMongo() {
  if (isConnected) return;
  console.time("[Mongo] connect");
  await mongoose.connect(uri, {
    // modern connection defaults are fine
  });
  console.timeEnd("[Mongo] connect");
  console.log("[Mongo] connected");
  isConnected = true;
}
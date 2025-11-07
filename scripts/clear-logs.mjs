import mongoose from "mongoose";

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("MONGODB_URI is not set. Please configure it in .env.local");
}

async function main() {
  try {
    console.time("[Mongo] connect");
    await mongoose.connect(uri);
    console.timeEnd("[Mongo] connect");

    const exists = await mongoose.connection.db
      .listCollections({ name: "logs" })
      .toArray();

    if (exists.length > 0) {
      await mongoose.connection.db.dropCollection("logs");
      console.log("[Mongo] dropped collection: logs");
    } else {
      console.log("[Mongo] collection 'logs' not found; nothing to drop");
    }

    await mongoose.disconnect();
    console.log("[Mongo] disconnected");
  } catch (e) {
    console.error("[Mongo] clear logs error", e);
    try { await mongoose.disconnect(); } catch {}
    process.exitCode = 1;
  }
}

main();
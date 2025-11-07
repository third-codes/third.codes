import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const check = (searchParams.get("check") || "").split(",").map((s) => s.trim()).filter(Boolean);

  const result: Record<string, any> = {
    status: "ok",
    timestamp: Date.now(),
  };

  if (check.includes("db")) {
    try {
      console.time("[Health] connectMongo");
      await connectMongo();
      console.timeEnd("[Health] connectMongo");
      result.db = { connected: true };
    } catch (e: any) {
      result.db = { connected: false, error: e?.message || String(e) };
    }
  }

  if (check.includes("ai")) {
    const base = process.env.LIARA_BASE_URL;
    const key = process.env.LIARA_API_KEY;
    const model = process.env.LIARA_MODEL_ID || "anthropic/claude-sonnet-4";
    result.ai = {
      hasBaseUrl: Boolean(base),
      hasApiKey: Boolean(key),
      model,
    };
  }

  return NextResponse.json(result);
}
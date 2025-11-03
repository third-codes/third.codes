import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { User } from "@/models/User";

function isAddress(addr: unknown) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const address = body?.address as string | undefined;
    const provider = body?.provider as string | undefined;
    const profile = body?.profile;

    if (!isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }

    await connectMongo();

    await User.findOneAndUpdate(
      { address },
      { $set: { address, provider, profile } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ status: "ok" });
  } catch (e) {
    console.error("/api/user/upsert error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
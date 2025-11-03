import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { Chat } from "@/models/Chat";

function isAddress(addr: unknown) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const address = (searchParams.get("address") || "").toLowerCase();
    if (!isAddress(address)) {
      return NextResponse.json({ error: "Invalid address" }, { status: 400 });
    }
    const hdr = req.headers.get("x-wallet-address");
    if (!isAddress(hdr) || String(hdr).toLowerCase() !== address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectMongo();
    const chats = await Chat.find({ address: new RegExp(`^${address}$`, 'i') })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return NextResponse.json({ chats });
  } catch (e) {
    console.error("/api/ai/history error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
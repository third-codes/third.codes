import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { Contract } from "@/models/Contract";

function isAddress(addr: unknown) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function POST(req: Request) {
  try {
    const { address: rawAddress, question, model } = await req.json();
    const address = typeof rawAddress === "string" ? rawAddress.toLowerCase() : rawAddress;
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    if (!isAddress(address)) {
      return NextResponse.json({ error: "Wallet not connected" }, { status: 401 });
    }
    const hdr = req.headers.get("x-wallet-address");
    if (!isAddress(hdr) || String(hdr).toLowerCase() !== String(address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectMongo();

    const created = await Contract.create({
      address,
      question,
      answer: "Pending...",
      code: "",
      model: model,
    });

    return NextResponse.json({ contractId: created._id.toString() });
  } catch (e) {
    console.error("/api/contract/init error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
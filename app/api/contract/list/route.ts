import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { Contract } from "@/models/Contract";

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
    const docs = await Contract.find({ address: new RegExp(`^${address}$`, 'i') })
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const contracts = docs.map((d: any) => ({
      _id: d._id.toString(),
      question: d.question,
      code: d.code || "",
      files: d.files,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      deployedAddress: d.deployedAddress,
    }));

    return NextResponse.json({ contracts });
  } catch (e) {
    console.error("/api/contract/list error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
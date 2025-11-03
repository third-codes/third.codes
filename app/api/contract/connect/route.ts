import { NextResponse } from "next/server";

function isAddress(addr: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const address = body?.address as string | undefined;

  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const hdr = request.headers.get("x-wallet-address");
  if (!hdr || String(hdr).toLowerCase() !== String(address).toLowerCase()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Placeholder for actual smart contract connect logic
  return NextResponse.json({ status: "ok", address });
}
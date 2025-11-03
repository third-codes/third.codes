import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { Contract } from "@/models/Contract";
import { isValidObjectId } from "mongoose";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await connectMongo();
    const doc = await Contract.findById(id).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const hdr = req.headers.get("x-wallet-address");
    if (!hdr || typeof hdr !== "string" || hdr.toLowerCase() !== String(doc.address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ contract: doc });
  } catch (e) {
    console.error("/api/contract/[id] error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await connectMongo();
    const doc = await Contract.findById(id).lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const hdr = req.headers.get("x-wallet-address");
    if (!hdr || typeof hdr !== "string" || hdr.toLowerCase() !== String(doc.address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await Contract.findByIdAndDelete(id);
    return NextResponse.json({ status: "ok", deletedId: id });
  } catch (e) {
    console.error("/api/contract/[id] DELETE error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    if (!isValidObjectId(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await connectMongo();
    const existing = await Contract.findById(id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const hdr = req.headers.get("x-wallet-address");
    if (!hdr || typeof hdr !== "string" || hdr.toLowerCase() !== String(existing.address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const next: any = {};
    if (typeof body?.code === "string") {
      next.code = body.code;
      // If saving single-file code, clear files to avoid confusion
      next.files = undefined;
    }
    if (Array.isArray(body?.files)) {
      // Validate files structure
      const files = body.files
        .filter((f: any) => f && typeof f.name === "string" && typeof f.content === "string")
        .map((f: any) => ({ name: String(f.name), content: String(f.content) }));
      next.files = files;
      // If saving multi-file, clear single-file code if provided empty
      if (typeof body?.code === "string" && body.code.length === 0) {
        next.code = undefined;
      }
    }

    // Allow saving deployed info independently
    if (typeof body?.deployedAddress === "string") {
      next.deployedAddress = String(body.deployedAddress).toLowerCase();
    }
    if (typeof body?.deployedNetwork === "string") {
      next.deployedNetwork = String(body.deployedNetwork);
    }
    if (typeof body?.deployedOwner === "string") {
      next.deployedOwner = String(body.deployedOwner).toLowerCase();
    }
    // Allow saving exact ABI array
    if (Array.isArray(body?.abi)) {
      next.abi = body.abi;
    }

    if (!("code" in next) && !("files" in next) && !("deployedAddress" in next) && !("deployedNetwork" in next) && !("deployedOwner" in next) && !("abi" in next)) {
      return NextResponse.json({ error: "No content to update" }, { status: 400 });
    }

    await Contract.findByIdAndUpdate(id, next, { new: false });
    const updated = await Contract.findById(id).lean();
    return NextResponse.json({ contract: updated });
  } catch (e) {
    console.error("/api/contract/[id] PATCH error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
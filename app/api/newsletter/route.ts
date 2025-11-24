import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { Newsletter } from "@/models/Newsletter";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    let sub: string | undefined = undefined;
    try {
      const { getSession } = await import("@auth0/nextjs-auth0");
      const session = await getSession();
      sub = session?.user?.sub;
    } catch {}
    await connectMongo();
    const existing = await Newsletter.findOne({ email }).lean();
    if (!existing) {
      await Newsletter.create({ email, userSub: sub });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Newsletter subscribe error", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    await connectMongo();
    const count = await Newsletter.countDocuments({});
    return NextResponse.json({ ok: true, count });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
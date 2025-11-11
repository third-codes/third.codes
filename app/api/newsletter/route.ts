import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json({ ok: false, error: "Invalid email" }, { status: 400 });
    }

    const dir = path.join(process.cwd(), "workspace");
    const file = path.join(dir, "newsletter.json");

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    let list: Array<{ email: string; ts: number }> = [];
    try {
      const raw = await fs.readFile(file, "utf8");
      list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }

    // Avoid duplicates
    const exists = list.some((x) => x.email === email);
    if (!exists) {
      list.push({ email, ts: Date.now() });
      await fs.writeFile(file, JSON.stringify(list, null, 2), "utf8");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Newsletter subscribe error", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function GET() {
  // Optional: expose count for debugging
  try {
    const file = path.join(process.cwd(), "workspace", "newsletter.json");
    const raw = await fs.readFile(file, "utf8");
    const list = JSON.parse(raw);
    return NextResponse.json({ ok: true, count: Array.isArray(list) ? list.length : 0 });
  } catch {
    return NextResponse.json({ ok: true, count: 0 });
  }
}
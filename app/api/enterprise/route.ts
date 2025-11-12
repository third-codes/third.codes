import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const data = await req.json();
    const { name, company, description, kind } = data || {};
    if (!name || !company || !description || !kind) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    const entry = {
      name,
      company,
      description,
      kind,
      ts: new Date().toISOString(),
    };
    const filePath = path.join(process.cwd(), "workspace", "enterprise-inquiries.json");
    try {
      await fs.access(filePath);
    } catch {
      await fs.writeFile(filePath, "[]", "utf-8");
    }
    const content = await fs.readFile(filePath, "utf-8");
    const arr = JSON.parse(content || "[]");
    arr.push(entry);
    await fs.writeFile(filePath, JSON.stringify(arr, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[enterprise] submit error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
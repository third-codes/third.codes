import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { User } from "@/models/User";
import { Chat } from "@/models/Chat";
import { Contract } from "@/models/Contract";

const BASE_URL =
  process.env.LIARA_BASE_URL ||
  "https://ai.liara.ir/api/68474f97761c7d3b5f4bbad3/v1";
const API_KEY =
  process.env.LIARA_API_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiI2OTAwZWVjYjhmMGEyYjVmMzEyMDVhNmIiLCJ0eXBlIjoiYWlfa2V5IiwiaWF0IjoxNzYxNjY4ODExfQ.ikVoaQAP-uGbOh6dP4RtEkXko6-WxInEcJ5ItEOjmSY";
const MODEL_ID = process.env.LIARA_MODEL_ID || "anthropic/claude-sonnet-4";

function isAddress(addr: unknown) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function POST(req: Request) {
  try {
    const { address, contractId, question, model } = await req.json();
    const hdr = req.headers.get("x-wallet-address");
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    if (!isAddress(address)) {
      return NextResponse.json({ error: "Wallet not connected" }, { status: 401 });
    }
    if (!isAddress(hdr) || String(hdr).toLowerCase() !== String(address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (typeof contractId !== "string") {
      return NextResponse.json({ error: "Missing contractId" }, { status: 400 });
    }

    await connectMongo();
    await User.findOneAndUpdate(
      { address },
      { $set: { address } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const doc = await Contract.findById(contractId).lean();
    if (!doc) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }
    if (String(doc.address).toLowerCase() !== String(address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const history = await Chat.find({ address: new RegExp(`^${address}$`, 'i'), contractId })
      .sort({ createdAt: 1 })
      .limit(10)
      .lean();

    const parts: string[] = [];
    if (Array.isArray(doc.files) && doc.files.length > 0) {
      for (const f of doc.files) {
        parts.push(`// file: ${f.name}\n${f.content}`);
      }
    } else if (typeof doc.code === "string" && doc.code.length > 0) {
      parts.push(doc.code);
    }
    const source = parts.join("\n\n");

    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: [
          "You are a Solidity-only smart contract engineer.",
          "Answer questions strictly about the provided contract source.",
          "If asked anything unrelated, respond EXACTLY: 'Refusal: Solidity-only agent'.",
        ].join("\n"),
      },
      { role: "user", content: `CONTRACT SOURCE:\n\n${source}` },
    ];

    for (const h of history) {
      messages.push({ role: "user", content: h.question });
      messages.push({ role: "assistant", content: h.answer });
    }
    messages.push({ role: "user", content: question });

    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ model: model || MODEL_ID, stream: false, messages }),
    });

    let data: any = null;
    let answer: string = "";
    if (!resp.ok) {
      const text = await resp.text();
      answer = text || "";
    } else {
      try {
        data = await resp.json();
      } catch {
        const txt = await resp.text();
        answer = txt || "";
      }
      if (!answer) {
        const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
        const content = choice?.message?.content ?? choice?.message ?? data?.output ?? "";
        answer = typeof content === "string" ? content : JSON.stringify(content ?? "");
      }
    }

    try {
      await Chat.create({ address, contractId, question, answer, model: model || MODEL_ID });
    } catch {}

    return NextResponse.json({ answer });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
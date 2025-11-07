import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { User } from "@/models/User";
import { Contract } from "@/models/Contract";

const BASE_URL = process.env.LIARA_BASE_URL;
const API_KEY = process.env.LIARA_API_KEY;
const MODEL_ID = process.env.LIARA_MODEL_ID || "anthropic/claude-sonnet-4";

function isAddress(addr: unknown) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const {
      address: rawAddress,
      contractId: incomingContractId,
      version,
      fileName,
      source,
      files,
      error,
      errors,
      model,
      traceId,
    } = body || {};

    const address = typeof rawAddress === "string" ? rawAddress.toLowerCase() : rawAddress;
    const tid = typeof traceId === "string" ? traceId : `fix-${Date.now()}`;
    console.log(`[FIX][${tid}] start`, {
      address,
      version,
      fileName,
      srcLen: typeof source === "string" ? source.length : 0,
      filesCount: Array.isArray(files) ? files.length : 0,
      errLen: typeof error === "string" ? error.length : 0,
    });

    // Auth: must have wallet address header matching payload address
    if (!isAddress(address)) {
      return NextResponse.json({ error: "Wallet not connected" }, { status: 401 });
    }
    const hdr = req.headers.get("x-wallet-address");
    if (!isAddress(hdr) || String(hdr).toLowerCase() !== String(address).toLowerCase()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Basic validation
    if (!version || (!fileName && !Array.isArray(files)) || (!source && !Array.isArray(files))) {
      return NextResponse.json(
        { error: "Missing version and source inputs" },
        { status: 400 }
      );
    }

    // Ensure DB connection and user record
    console.time(`[FIX][${tid}] connectMongo`);
    await connectMongo();
    console.timeEnd(`[FIX][${tid}] connectMongo`);
    await User.findOneAndUpdate(
      { address },
      { $set: { address } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Build fixer prompt: include compiler version, error(s), and current files
    const serializeFiles = (): string => {
      try {
        const arr: { name: string; content: string }[] = Array.isArray(files)
          ? files
              .filter((f: any) => f && typeof f.name === "string" && typeof f.content === "string")
              .map((f: any) => ({ name: String(f.name), content: String(f.content) }))
          : [{ name: String(fileName || "[Contract].sol"), content: String(source || "") }];
        return arr
          .map((f) => `// filename: ${f.name}\n${f.content}`)
          .join("\n\n\n");
      } catch {
        return String(source || "");
      }
    };

    const errorsText = (() => {
      try {
        if (Array.isArray(errors) && errors.length > 0) {
          return errors
            .map((e: any) => {
              const line = e?.line ?? e?.loc?.line ?? e?.loc?.start?.line;
              const column = e?.column ?? e?.loc?.column ?? e?.loc?.start?.column;
              const msg = e?.message ?? e?.formattedMessage ?? String(e);
              return `line ${line ?? "?"}, column ${column ?? "?"}: ${msg}`;
            })
            .join("\n");
        }
        return String(error || "Compilation failed");
      } catch {
        return String(error || "Compilation failed");
      }
    })();

    // Ensure AI configuration is set
    if (!BASE_URL || !API_KEY) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    console.time(`[FIX][${tid}] llm_fetch`);
    const resp = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: model || MODEL_ID,
        stream: false,
        messages: [
          {
            role: "system",
            content: [
              "You are a Solidity compiler-fixer agent.",
              "Your job: diagnose the provided compile error(s) with the given compiler version and the current source files, then RETURN ONLY the corrected Solidity files.",
              "Response rules:",
              "- Output MUST be one or more fenced code blocks labelled 'solidity'.",
              "- Each block's FIRST line MUST be a filename comment with full path: // filename: contracts/<Name>.sol (or other provided relative path)",
              "- Preserve original file names when possible; add or split files if needed.",
              "- Do NOT include any prose outside code fences.",
              "- The result MUST be self-contained and compilable locally (no external imports).",
              "- If you use OpenZeppelin v5.x, include the exact source inline under 'contracts/@openzeppelin/contracts/...'.",
              "- Keep SPDX and pragma declarations correct per file; avoid duplicates and invalid ranges.",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              `Compiler version: ${String(version)}`,
              "Compile errors:",
              errorsText,
              "\nCurrent sources:",
              serializeFiles(),
              "\nPlease fix the code so it compiles successfully and return ONLY the corrected Solidity files.",
            ].join("\n\n"),
          },
        ],
      }),
    });
    console.timeEnd(`[FIX][${tid}] llm_fetch`);

    let data: any = null;
    let answer: string = "";
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error(`[FIX][${tid}] llm_resp_not_ok`, { status: resp.status, textLen: text.length });
      answer = text || "";
    } else {
      try {
        data = await resp.json();
      } catch (e) {
        const txt = await resp.text().catch(() => "");
        answer = txt || "";
      }
      if (!answer) {
        const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
        const content = choice?.message?.content ?? choice?.message ?? data?.output ?? "";
        answer = typeof content === "string" ? content : JSON.stringify(content ?? "");
      }
    }
    console.log(`[FIX][${tid}] llm_answer_len`, answer.length);

    // Extract Solidity files from answer
    let contractId: string | undefined =
      typeof incomingContractId === "string" ? incomingContractId : undefined;
    const outFiles: { name: string; content: string }[] = [];

    const fenceSolidity = /```\s*solidity[^\n]*\n([\s\S]*?)```/g;
    const fenceAny = /```\s*\n([\s\S]*?)```/g;

    const collectFrom = (re: RegExp) => {
      const seen: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(answer)) !== null) {
        const raw = (m[1] || "").trim();
        if (!raw) continue;
        const looksSolidity =
          /pragma\s+solidity/i.test(raw) ||
          /\b(contract|library|interface)\s+[A-Za-z0-9_]+/i.test(raw);
        if (!looksSolidity) continue;
        const firstLine = raw.split(/\r?\n/)[0];
        let fname = (() => {
          const cm =
            firstLine.match(/\/\/[\s]*filename:\s*([^\s]+)/i) ||
            firstLine.match(/\/\*[^*]*filename:\s*([^*\s]+)[\s\S]*?\*\//i);
          const candidate = cm?.[1];
          if (candidate)
            return candidate.startsWith("contracts/") ? candidate : `contracts/${candidate}`;
          const cMatch = raw.match(/\bcontract\s+([A-Za-z0-9_]+)/);
          const base = cMatch?.[1] ? `${cMatch[1]}.sol` : "[Contract].sol";
          return `contracts/${base}`;
        })();
        if (seen.includes(fname)) {
          let i = 2;
          const base = fname.replace(/\.sol$/i, "");
          while (seen.includes(`${base}.${i}.sol`)) i++;
          fname = `${base}.${i}.sol`;
        }
        seen.push(fname);
        outFiles.push({ name: fname, content: raw });
      }
    };

    collectFrom(fenceSolidity);
    if (outFiles.length === 0) collectFrom(fenceAny);
    console.log(`[FIX][${tid}] extracted_files_count`, outFiles.length);

    // Persist updated contract code
    if (outFiles.length > 0) {
      if (contractId) {
        await Contract.findByIdAndUpdate(contractId, {
          address,
          question: `Fix compile error (version ${version})`,
          answer,
          files: outFiles,
          code: "",
          model: model || MODEL_ID,
        });
        console.log(`[FIX][${tid}] contract_updated_files`, contractId);
      } else {
        const created = await Contract.create({
          address,
          question: `Fix compile error (version ${version})`,
          answer,
          files: outFiles,
          code: "",
          model: model || MODEL_ID,
        });
        contractId = created._id.toString();
        console.log(`[FIX][${tid}] contract_created_files`, contractId);
      }
    } else {
      // single-block fallback: store raw code if detected
      const codeMatch = /```(?:solidity)?\s*([\s\S]*?)```/m.exec(answer);
      const codeCandidate = codeMatch?.[1]?.trim();
      if (
        codeCandidate &&
        (/pragma\s+solidity/i.test(codeCandidate) ||
          /\b(contract|library|interface)\s+[A-Za-z0-9_]+/i.test(codeCandidate))
      ) {
        if (contractId) {
          await Contract.findByIdAndUpdate(contractId, {
            address,
            question: `Fix compile error (version ${version})`,
            answer,
            code: codeCandidate,
            model: model || MODEL_ID,
          });
          console.log(`[FIX][${tid}] contract_updated_single`, contractId);
        } else {
          const created = await Contract.create({
            address,
            question: `Fix compile error (version ${version})`,
            answer,
            code: codeCandidate,
            model: model || MODEL_ID,
          });
          contractId = created._id.toString();
          console.log(`[FIX][${tid}] contract_created_single`, contractId);
        }
      }
    }

    return NextResponse.json({ contractId, files: outFiles });
  } catch (e) {
    console.error("/api/fix error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
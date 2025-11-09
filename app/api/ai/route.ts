import { NextResponse } from "next/server";
import { connectMongo } from "@/lib/mongoose";
import { User } from "@/models/User";
import { Chat } from "@/models/Chat";
import { Contract } from "@/models/Contract";

const BASE_URL = process.env.LIARA_BASE_URL;
const API_KEY = process.env.LIARA_API_KEY;
const MODEL_ID = process.env.LIARA_MODEL_ID || "anthropic/claude-sonnet-4";

function isAddress(addr: unknown) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

export async function POST(req: Request) {
  try {
    const {
      question,
      address,
      model,
      traceId,
      contractId: incomingContractId,
    } = await req.json();
    const tid = typeof traceId === "string" ? traceId : `ai-${Date.now()}`;
    console.log(`[AI][${tid}] start`, {
      address,
      qLen: typeof question === "string" ? question.length : 0,
    });
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "Missing question" }, { status: 400 });
    }
    if (!isAddress(address)) {
      return NextResponse.json(
        { error: "Wallet not connected" },
        { status: 401 }
      );
    }
    const hdr = req.headers.get("x-wallet-address");
    if (
      !isAddress(hdr) ||
      String(hdr).toLowerCase() !== String(address).toLowerCase()
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure DB is connected and user exists
    console.time(`[AI][${tid}] connectMongo`);
    await connectMongo();
    console.timeEnd(`[AI][${tid}] connectMongo`);
    await User.findOneAndUpdate(
      { address },
      { $set: { address } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // No memory/history: keep messages minimal to reduce cost

    if (!BASE_URL || !API_KEY) {
      console.error("[AI] Missing LIARA_BASE_URL or LIARA_API_KEY env variables");
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    console.time(`[AI][${tid}] llm_fetch`);
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
              "You are a Solidity-only smart contract engineer.",
              "If asked to do anything not strictly about Solidity smart contracts, respond EXACTLY with: 'Refusal: Solidity-only agent'.",
              "When generating contracts, you MAY split the solution into multiple .sol files if appropriate (heavy contracts, libraries, interfaces). For any OpenZeppelin dependency, its file MUST be placed under 'contracts/@openzeppelin/contracts/...'.",
              "Output ONLY Solidity source files. For EACH file, use its own fenced code block marked with 'solidity'.",
              "The FIRST line of each code block MUST include the filename as a comment in the 'contracts/' folder, e.g.: // filename: contracts/MyToken.sol",
              "Do not include any explanation outside code fences. Always include SPDX and pragma in relevant files.",
              "Never use external imports from npm, GitHub, or URLs. Avoid lines like: import '@openzeppelin/...'; or import 'https://...';",
              "When you need OpenZeppelin or library code, include the exact source inline as separate .sol files (no external imports). The result MUST be fully self-contained and compilable without fetching external dependencies.",
              "All OpenZeppelin dependencies MUST be placed under the local path structure: contracts/@openzeppelin/contracts/... and referenced internally from there (no remote paths).",
              "Prefer official OpenZeppelin v5.x APIs and patterns (AccessControl, Ownable, Initializable for upgradeables). If a dependency is required (e.g., OwnableUpgradeable), include its full source as another file, and reference it via Solidity identifiers (no import lines).",
              "Keep SPDX and pragma declarations only once per file; when inlining multiple sources, ensure each file has its own SPDX/pragma and no duplicate import statements.",
              "All included OpenZeppelin/library sources MUST be emitted as part of the output files so the backend can store them in the contract record.",
            ].join("\n"),
          },
          { role: "user", content: question },
        ],
      }),
    });
    console.timeEnd(`[AI][${tid}] llm_fetch`);

    // Handle non-OK gracefully: try to read any text and continue
    let data: any = null;
    let answer: string = "";
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[AI][${tid}] llm_resp_not_ok`, {
        status: resp.status,
        textLen: text.length,
      });
      answer = text || "";
    } else {
      // Be resilient to non-JSON responses
      try {
        data = await resp.json();
      } catch (e) {
        const txt = await resp.text();
        answer = txt || "";
      }
      if (!answer) {
        const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
        const content =
          choice?.message?.content ?? choice?.message ?? data?.output ?? "";
        answer =
          typeof content === "string" ? content : JSON.stringify(content ?? "");
      }
    }
    console.log(`[AI][${tid}] llm_answer_len`, answer.length);
    const isRefusal = /^Refusal:\s*Solidity-only agent\s*$/i.test(
      answer.trim()
    );

    // Persist chat history for the connected wallet
    try {
      await Chat.create({
        address,
        question,
        answer,
        model: model || MODEL_ID,
        contractId:
          typeof incomingContractId === "string" ? incomingContractId : undefined,
      });
      console.log(`[AI][${tid}] chat_saved`);
    } catch (e) {
      console.warn(`[AI][${tid}] chat_save_error`, e);
    }

    // Skip chat saving to reduce DB writes and cost

    // Extract ALL Solidity code blocks and store as multi-file contracts when present
    let contractId: string | undefined =
      typeof incomingContractId === "string" ? incomingContractId : undefined;
    const files: { name: string; content: string }[] = [];
    // Track whether we have updated/created the contract with any content
    let contentPersisted = false;

    // Prefer fenced blocks labelled 'solidity'
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
        // detect filename from first line comment
        const firstLine = raw.split(/\r?\n/)[0];
        let fname = (() => {
          const cm =
            firstLine.match(/\/\/[\s]*filename:\s*([^\s]+)/i) ||
            firstLine.match(/\/\*[\s]*filename:\s*([^*\s]+)[\s\S]*?\*\//i);
          const candidate = cm?.[1];
          if (candidate)
            return candidate.startsWith("contracts/")
              ? candidate
              : `contracts/${candidate}`;
          const cMatch = raw.match(/\bcontract\s+([A-Za-z0-9_]+)/);
          const base = cMatch?.[1] ? `${cMatch[1]}.sol` : "[Contract].sol";
          return `contracts/${base}`;
        })();
        if (seen.includes(fname)) {
          // avoid duplicate filenames; append numeric suffix
          let i = 2;
          const base = fname.replace(/\.sol$/i, "");
          while (seen.includes(`${base}.${i}.sol`)) i++;
          fname = `${base}.${i}.sol`;
        }
        seen.push(fname);
        files.push({ name: fname, content: raw });
      }
    };

    collectFrom(fenceSolidity);
    if (files.length === 0) collectFrom(fenceAny);
    console.log(`[AI][${tid}] extracted_files_count`, files.length);
    if (files.length > 0) {
      console.log(
        `[AI][${tid}] file_names`,
        files.map((f) => f.name)
      );
    }

    if (files.length > 0) {
      if (contractId) {
        await Contract.findByIdAndUpdate(contractId, {
          address,
          question,
          answer,
          files,
          code: "", // satisfy any legacy required validator
          model: model || MODEL_ID,
        });
        console.log(`[AI][${tid}] contract_updated_files`, contractId);
        contentPersisted = true;
      } else {
        const created = await Contract.create({
          address,
          question,
          answer,
          files,
          code: "", // satisfy any legacy required validator
          model: model || MODEL_ID,
        });
        contractId = created._id.toString();
        console.log(`[AI][${tid}] contract_created_files`, contractId);
        contentPersisted = true;
      }
    } else if (isRefusal) {
      // Non-contract prompt: create error.sol with a clear comment in the editor
      const errorFiles = [
        {
          name: "error.sol",
          content: [
            "// This AI agent is dedicated to Solidity smart contract creation",
            "// and deployment on EVM networks. Please provide a prompt",
            "// strictly related to smart contracts (Solidity code, libraries,",
            "// interfaces, testing, or deployment). Non-contract requests",
            "// are not supported.",
          ].join("\n"),
        },
      ];
      if (contractId) {
        await Contract.findByIdAndUpdate(contractId, {
          address,
          question,
          answer,
          files: errorFiles,
          code: "",
          model: model || MODEL_ID,
        });
        console.log(`[AI][${tid}] contract_updated_error_file`, contractId);
        contentPersisted = true;
      } else {
        const created = await Contract.create({
          address,
          question,
          answer,
          files: errorFiles,
          code: "",
          model: model || MODEL_ID,
        });
        contractId = created._id.toString();
        console.log(`[AI][${tid}] contract_created_error_file`, contractId);
        contentPersisted = true;
      }
    } else {
      // single-block fallback
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
            question,
            answer,
            code: codeCandidate,
            model: model || MODEL_ID,
          });
          console.log(`[AI][${tid}] contract_updated_single`, contractId);
          contentPersisted = true;
        } else {
          const created = await Contract.create({
            address,
            question,
            answer,
            code: codeCandidate,
            model: model || MODEL_ID,
          });
          contractId = created._id.toString();
          console.log(`[AI][${tid}] contract_created_single`, contractId);
          contentPersisted = true;
        }
      }
      // no-fence fallback: attempt to extract Solidity from raw answer
      if (!contractId) {
        const looksSolidityWhole =
          /pragma\s+solidity/i.test(answer) ||
          /\b(contract|library|interface)\s+[A-Za-z0-9_]+/i.test(answer);
        if (looksSolidityWhole) {
          let raw = answer.trim();
          const startMatch = raw.match(
            /pragma\s+solidity[^\n]*|\b(contract|library|interface)\s+[A-Za-z0-9_]+/i
          );
          if (startMatch) {
            const startIdx = raw.indexOf(startMatch[0]);
            raw = raw.slice(startIdx);
          }
          const endIdx = raw.lastIndexOf("}");
          if (endIdx !== -1) raw = raw.slice(0, endIdx + 1);
          if (incomingContractId) {
            await Contract.findByIdAndUpdate(incomingContractId, {
              address,
              question,
              answer,
              code: raw,
              model: model || MODEL_ID,
            });
            contractId = incomingContractId;
            console.log(`[AI][${tid}] contract_updated_nofence`, contractId);
            contentPersisted = true;
          } else {
            const created = await Contract.create({
              address,
              question,
              answer,
              code: raw,
              model: model || MODEL_ID,
            });
            contractId = created._id.toString();
            console.log(`[AI][${tid}] contract_created_nofence`, contractId);
            contentPersisted = true;
          }
        }
      }
      // final stub fallback: ensure a contract record exists for navigation
      if (!contractId) {
        const stubFiles = [
          {
            name: "error.sol",
            content: [
              "// This AI agent is dedicated to Solidity smart contract creation",
              "// and deployment on EVM networks. Please provide a prompt",
              "// strictly related to smart contracts (Solidity code, libraries,",
              "// interfaces, testing, or deployment). Non-contract requests",
              "// are not supported.",
            ].join("\n"),
          },
        ];
        if (incomingContractId) {
          await Contract.findByIdAndUpdate(incomingContractId, {
            address,
            question,
            answer,
            files: stubFiles,
            code: "",
            model: model || MODEL_ID,
          });
          contractId = incomingContractId;
          console.log(
            `[AI][${tid}] contract_updated_stub_error_file`,
            contractId
          );
          contentPersisted = true;
        } else {
          const created = await Contract.create({
            address,
            question,
            answer,
            files: stubFiles,
            code: "",
            model: model || MODEL_ID,
          });
          contractId = created._id.toString();
          console.log(
            `[AI][${tid}] contract_created_stub_error_file`,
            contractId
          );
          contentPersisted = true;
        }
      }
    }

    // Ensure we always persist some content for the active contract id
    // This covers the case where an incoming contractId is provided but
    // the AI output did not include any recognizable Solidity code or refusal.
    if (!contentPersisted && incomingContractId) {
      const stubFiles = [
        {
          name: "error.sol",
          content: [
            "// No Solidity files were detected in the AI response.",
            "// Please ask for a Solidity smart contract. Use fenced",
            "// blocks marked with 'solidity' and include a filename comment:",
            "//   // filename: contracts/MyContract.sol",
          ].join("\n"),
        },
      ];
      await Contract.findByIdAndUpdate(incomingContractId, {
        address,
        question,
        answer,
        files: stubFiles,
        code: "",
        model: model || MODEL_ID,
      });
      contractId = incomingContractId;
      contentPersisted = true;
      console.log(`[AI][${tid}] contract_updated_stub_fallback`, contractId);
    }

    console.log(`[AI][${tid}] done`, { contractId });
    return NextResponse.json({ answer, contractId, traceId: tid });
  } catch (e) {
    console.error("/api/ai error", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

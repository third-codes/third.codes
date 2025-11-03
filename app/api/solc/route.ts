import type { NextRequest } from "next/server";
import { createRequire } from "module";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const require = createRequire(import.meta.url);
const solidityParser = require("@solidity-parser/parser");
const semver = require("semver");

function toTypeString(typeNode: any): string {
  if (!typeNode) return "";
  switch (typeNode.type) {
    case "ElementaryTypeName":
      return String(typeNode.name);
    case "ArrayTypeName":
      return `${toTypeString(typeNode.baseTypeName)}[]`;
    case "UserDefinedTypeName":
      return String(typeNode.namePath || typeNode.name || "UserType");
    case "Mapping":
      return `mapping(${toTypeString(typeNode.keyType)}=>${toTypeString(typeNode.valueType)})`;
    case "FunctionTypeName":
      return "function";
    default:
      return String(typeNode.type || "unknown");
  }
}

function normalizeVersion(input: string): string {
  // Handles values like:
  // - "latest local version"
  // - "soljson-v0.8.30+commit.73712a01.js"
  // - "0.8.31-pre.1+commit.b59566f6"
  // - "0.8.30+commit.73712a01"
  const soljsonMatch = input.match(/soljson-(v[\d.]+(?:-pre\.\d+)?\+commit\.[0-9a-f]+)\.js/i);
  if (soljsonMatch) return soljsonMatch[1];

  // "latest local version" – use a sensible default if no specific version is provided
  if (/^latest local version$/i.test(input)) {
    return "v0.8.30+commit.73712a01";
  }

  // Raw version string without the leading v
  if (/^[\dv.]+(?:-pre\.\d+)?\+commit\.[0-9a-f]+$/i.test(input)) {
    return `v${input.replace(/^v/i, "")}`;
  }

  // Already normalized
  if (/^v[\d.]+(?:-pre\.\d+)?\+commit\.[0-9a-f]+$/i.test(input)) {
    return input;
  }

  // Fallback to a known stable
  return "v0.8.30+commit.73712a01";
}

function withTimeout<T>(p: Promise<T>, ms: number, errMsg = "Operation timed out") {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(errMsg)), ms);
    p
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { version, fileName, source, files } = body || {};
    if (!version || !fileName || !source) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing version, fileName or source" }),
        { status: 400 }
      );
    }

    // Fast path: syntax check and AST extraction (no actual compilation)
    // 1) Parse syntax strictly
    try {
      solidityParser.parse(String(source), { tolerant: false });
    } catch (err: any) {
      const loc = (err && (err.loc || err.location)) || null;
      const line = Number(loc?.line ?? loc?.start?.line ?? 0);
      const column = Number(loc?.column ?? loc?.start?.column ?? 0);
      const errors = [
        {
          message: String(err?.message || "Parser error"),
          line,
          column,
        },
      ];
      return new Response(
        JSON.stringify({ success: false, error: err?.message || "Parser error", errors }),
        { status: 200 }
      );
    }

    // 2) Build tolerant AST for metadata extraction
    let ast: any = null;
    try {
      ast = solidityParser.parse(String(source), { tolerant: true });
    } catch {}

    // 3) Extract constructor parameter types from AST (including legacy syntax)
    let ctorParams: Array<{ type: string; name?: string }> = [];
    try {
      const children: any[] = Array.isArray(ast?.children) ? ast.children : [];
      const contracts = children.filter((c: any) => c?.type === "ContractDefinition");
      // Prefer contract whose name matches file name
      const baseName = String(fileName || "").replace(/^.*\//, "").replace(/\.sol$/i, "");
      const preferred = contracts.find((c: any) => String(c?.name || "") === baseName);
      const ordered = preferred ? [preferred, ...contracts.filter((c: any) => c !== preferred)] : contracts;
      for (const c of ordered) {
        const subNodes: any[] = Array.isArray(c?.subNodes) ? c.subNodes : [];
        const fns = subNodes.filter((sn: any) => sn?.type === "FunctionDefinition");
        let ctor = fns.find((fn: any) => fn?.kind === "constructor" || fn?.isConstructor);
        // Legacy pre-0.4.x style: function named same as contract
        if (!ctor) {
          const legacyCtor = fns.find((fn: any) => String(fn?.name || "") === String(c?.name || ""));
          if (legacyCtor) ctor = legacyCtor;
        }
        if (ctor && ctor.parameters && Array.isArray(ctor.parameters.parameters)) {
          ctorParams = ctor.parameters.parameters.map((p: any) => ({
            type: toTypeString(p?.typeName),
            name: p?.name || undefined,
          }));
          break;
        }
      }
    } catch {}

    // Fallback: regex scan in source if AST didn't yield constructor params
    try {
      if (!ctorParams || ctorParams.length === 0) {
        const src = String(source);
        // Match modern constructor syntax
        const m = src.match(/constructor\s*\(([^)]*)\)/i);
        // Legacy: function ContractName(...)
        const baseName = String(fileName || "").replace(/^.*\//, "").replace(/\.sol$/i, "");
        const legacy = src.match(new RegExp(`function\\s+${baseName}\\s*\\(([^)]*)\\)`, "i"));
        const group = m?.[1] || legacy?.[1] || "";
        const list = group.split(",").map((s) => s.trim()).filter(Boolean);
        const parsed = list.map((param) => {
          // mapping(...) name?
          const mapMatch = param.match(/^(mapping\s*\([^)]*\))\s*([A-Za-z_][A-Za-z0-9_]*)?$/i);
          if (mapMatch) {
            const type = mapMatch[1] || "mapping";
            const name = mapMatch[2] || undefined;
            return { type, name };
          }
          const tokens = param.split(/\s+/).filter(Boolean);
          // remove location specifiers
          const filtered = tokens.filter((t) => !/^(memory|calldata|storage)$/i.test(t));
          if (filtered.length >= 2) {
            const name = filtered[filtered.length - 1];
            const typeParts = filtered.slice(0, filtered.length - 1);
            let type = typeParts.join(" ");
            // array suffix
            if (/\[\s*\]/.test(param) && !/\[\s*\]/.test(type)) type = `${type}[]`;
            return { type, name };
          } else {
            let type = filtered[0] || "";
            if (/\[\s*\]/.test(param) && !/\[\s*\]/.test(type)) type = `${type}[]`;
            return { type };
          }
        });
        if (parsed.length > 0) {
          ctorParams = parsed;
        }
      }
    } catch {}

    // 4) Check pragma compatibility against selected version (quick, deterministic)
    let pragmaRange: string | null = null;
    try {
      const children: any[] = Array.isArray(ast?.children) ? ast.children : [];
      for (const node of children) {
        if (node?.type === "PragmaDirective" && node?.name === "solidity") {
          pragmaRange = String(node?.value || "").replace(/\s+/g, " ").trim();
          break;
        }
      }
    } catch {}

    // Extract base x.y.z from version string like 0.8.28+commit....
    const base = String(version).match(/(\d+)\.(\d+)\.(\d+)/)?.[0] || "0.8.30";
    if (pragmaRange) {
      const ok = semver.satisfies(base, pragmaRange, { includePrerelease: true });
      if (!ok) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Selected version (${version}) is incompatible with pragma (${pragmaRange})`,
            ctorParams,
          }),
          { status: 200 }
        );
      }
    }

    // If syntax is valid and pragma is compatible → try to compile to produce ABI/bytecode
    try {
      const solc = require("solc");
      const normalized = normalizeVersion(String(version));
      const solcInstance: any = await withTimeout(
        new Promise((resolve, reject) => {
          try {
            solc.loadRemoteVersion(normalized, (err: any, snapshot: any) => {
              if (err) return reject(err);
              resolve(snapshot);
            });
          } catch (e) {
            reject(e);
          }
        }),
        10000,
        "Compiler load timed out"
      ).catch(async () => {
        // Fallback to local solc if remote fails
        return solc;
      });

      // Build sources map from provided files or fallback to single file
      const srcMap: Record<string, { content: string }> = {};
      if (Array.isArray(files) && files.length > 0) {
        for (const f of files) {
          const n = String(f?.name || "");
          const c = String(f?.content || "");
          if (!n || !c) continue;
          srcMap[n] = { content: c };
        }
      }
      if (!srcMap[fileName]) {
        srcMap[fileName] = { content: String(source) };
      }

      const input = {
        language: "Solidity",
        sources: srcMap,
        settings: {
          outputSelection: {
            "*": {
              "*": ["abi", "evm.bytecode", "metadata"],
            },
          },
        },
      };

      const raw = solcInstance.compile(JSON.stringify(input));
      const output = JSON.parse(raw);

      const allErrors: any[] = Array.isArray(output?.errors) ? output.errors : [];
      const warnings = allErrors.filter((e) => String(e?.severity || "").toLowerCase() === "warning");
      const critical = allErrors.filter((e) => String(e?.severity || "").toLowerCase() === "error");

      if (critical.length > 0) {
        const errs = critical.map((e) => {
          const loc = e?.sourceLocation || e?.formattedMessage || null;
          const file = String(e?.sourceLocation?.file || e?.file || fileName || "");
          const line = Number(e?.sourceLocation?.start?.line || e?.line || 0);
          const column = Number(e?.sourceLocation?.start?.column || e?.column || 0);
          return {
            message: String(e?.formattedMessage || e?.message || "Compilation error"),
            file,
            line,
            column,
          };
        });
        return new Response(
          JSON.stringify({ success: false, errors: errs, warnings, ctorParams }),
          { status: 200 }
        );
      }

      // Choose contract to deploy: prefer one matching base file name
      const contracts = output?.contracts || {};
      const baseName = String(fileName || "").replace(/^.*\//, "").replace(/\.sol$/i, "");
      let chosenFile = fileName;
      let chosenContract: string | null = null;
      if (contracts && typeof contracts === "object") {
        // First, check selected file
        const candidatesInFile = contracts[fileName] || {};
        if (candidatesInFile && typeof candidatesInFile === "object") {
          if (baseName && candidatesInFile[baseName]) {
            chosenContract = baseName;
            chosenFile = fileName;
          } else {
            const names = Object.keys(candidatesInFile);
            if (names.length > 0) {
              chosenContract = names[0];
              chosenFile = fileName;
            }
          }
        }
        // If still not chosen, find first across any file
        if (!chosenContract) {
          for (const f of Object.keys(contracts)) {
            const names = Object.keys(contracts[f] || {});
            if (names.length > 0) {
              chosenContract = names.find((n) => n === baseName) || names[0];
              chosenFile = f;
              break;
            }
          }
        }
      }

      if (!chosenContract || !chosenFile) {
        return new Response(
          JSON.stringify({ success: false, error: "No compiled contracts found", warnings, ctorParams }),
          { status: 200 }
        );
      }

      const artifact = contracts[chosenFile]?.[chosenContract];
      const abi = artifact?.abi || [];
      const bytecode = artifact?.evm?.bytecode?.object || "";

      return new Response(
        JSON.stringify({
          success: true,
          warnings,
          ctorParams,
          artifact: {
            abi,
            bytecode,
            contractName: chosenContract,
            file: chosenFile,
          },
        }),
        { status: 200 }
      );
    } catch (err: any) {
      // If compilation step fails unexpectedly, still return syntax success with no artifact
      return new Response(
        JSON.stringify({ success: true, ctorParams, warnings: [], note: "Compilation step skipped: " + String(err?.message || err) }),
        { status: 200 }
      );
    }
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: e?.message || String(e) }),
      { status: 500 }
    );
  }
}
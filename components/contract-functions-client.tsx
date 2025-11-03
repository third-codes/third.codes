"use client";
import React from "react";
import NextDynamic from "next/dynamic";

const Editor = NextDynamic(() => import("@monaco-editor/react"), { ssr: false });

type SolFile = { name: string; content: string };
type ContractDoc = {
  _id: string;
  address: string;
  question: string;
  code?: string;
  files?: SolFile[];
  deployedAddress?: string;
  deployedNetwork?: string;
  deployedOwner?: string;
  abi?: any[];
};

export default function ContractFunctionsClient({ id }: { id: string }) {
  const [doc, setDoc] = React.useState<ContractDoc | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const wallet = typeof window !== "undefined" ? localStorage.getItem("walletAddress") || "" : "";
        const resp = await fetch(`/api/contract/${id}`, {
          headers: { "x-wallet-address": wallet },
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error || "Failed to load contract");
        const c = data?.contract || {};
        if (!cancelled) {
          setDoc({
            _id: (c?._id as any)?.toString?.() ?? `${c?._id || id}`,
            address: c?.address || "",
            question: c?.question || "",
            code: c?.code,
            files: Array.isArray(c?.files) ? c.files : undefined,
            deployedAddress: c?.deployedAddress,
            deployedNetwork: c?.deployedNetwork,
            deployedOwner: c?.deployedOwner,
            abi: Array.isArray(c?.abi) ? c.abi : [],
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(typeof e?.message === "string" ? e.message : `${e}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const initialCode = React.useMemo(() => {
    const d = doc;
    if (!d) return "";
    if (d.code && d.code.length > 0) return d.code;
    if (Array.isArray(d.files) && d.files.length > 0) return d.files[0]?.content || "";
    return "";
  }, [doc]);

  const initialFileName = React.useMemo(() => {
    const d = doc;
    if (!d) return "[Contract].sol";
    if (Array.isArray(d.files) && d.files.length > 0) return d.files[0]?.name || "[Contract].sol";
    return "[Contract].sol";
  }, [doc]);

  const [resultMap, setResultMap] = React.useState<Record<string, any>>({});
  const [openMap, setOpenMap] = React.useState<Record<string, boolean>>({});
  const [inputMap, setInputMap] = React.useState<Record<string, Record<string, string>>>({});
  const [valueMap, setValueMap] = React.useState<Record<string, string>>({});

  const abiItems = Array.isArray(doc?.abi) ? doc!.abi!.filter((x: any) => x && x.type === "function") : [];
  const readFns = abiItems.filter((x: any) => x.stateMutability === "view" || x.stateMutability === "pure");
  const writeFns = abiItems.filter((x: any) => x.stateMutability === "nonpayable" || x.stateMutability === "payable");

  const toggleOpen = (name: string) => {
    setOpenMap((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const setParam = (fn: any, idx: number, val: string) => {
    const key = `${fn.name || "fn"}-${idx}`;
    setInputMap((prev) => {
      const existing = prev[fn.name] || {};
      return { ...prev, [fn.name]: { ...existing, [key]: val } };
    });
  };

  async function callRead(fn: any) {
    try {
      const provider = (window as any).ethereum
        ? new (await import("ethers")).ethers.BrowserProvider((window as any).ethereum)
        : null;
      if (!provider) throw new Error("Wallet not connected");
      const { ethers } = await import("ethers");
      const contract = new ethers.Contract(doc!.deployedAddress!, doc!.abi!, await provider);
      const args = (fn?.inputs || []).map((inp: any, idx: number) => {
        const v = inputMap[fn.name]?.[`${fn.name}-${idx}`] ?? "";
        if (Array.isArray(inp?.components) || /\[\]$/.test(inp?.type || "")) {
          try {
            return JSON.parse(v || "null");
          } catch {
            return v;
          }
        }
        if ((inp?.type || "").startsWith("uint") || (inp?.type || "").startsWith("int")) {
          return v ? v : "0";
        }
        if ((inp?.type || "") === "bool") {
          return /^true$/i.test(v);
        }
        return v;
      });
      const out = await (contract as any)[fn.name](...args);
      const normalized = normalizeOutput(out);
      setResultMap((prev) => ({ ...prev, [fn.name]: { ok: true, data: normalized } }));
    } catch (e: any) {
      const errMsg = typeof e?.message === "string" ? e.message : `${e}`;
      setResultMap((prev) => ({ ...prev, [fn.name]: { ok: false, error: errMsg } }));
    }
  }

  async function callWrite(fn: any) {
    try {
      const provider = (window as any).ethereum
        ? new (await import("ethers")).ethers.BrowserProvider((window as any).ethereum)
        : null;
      if (!provider) throw new Error("Wallet not connected");
      const signer = await provider.getSigner();
      const { ethers } = await import("ethers");
      const contract = new ethers.Contract(doc!.deployedAddress!, doc!.abi!, signer);
      const args = (fn?.inputs || []).map((inp: any, idx: number) => {
        const v = inputMap[fn.name]?.[`${fn.name}-${idx}`] ?? "";
        if (Array.isArray(inp?.components) || /\[\]$/.test(inp?.type || "")) {
          try {
            return JSON.parse(v || "null");
          } catch {
            return v;
          }
        }
        if ((inp?.type || "").startsWith("uint") || (inp?.type || "").startsWith("int")) {
          return v ? v : "0";
        }
        if ((inp?.type || "") === "bool") {
          return /^true$/i.test(v);
        }
        return v;
      });
      const overrides: any = {};
      if (fn.stateMutability === "payable") {
        const ethVal = valueMap[fn.name];
        if (ethVal && ethVal.trim().length > 0) {
          overrides.value = (await import("ethers")).ethers.parseEther(ethVal);
        }
      }
      const tx = await (contract as any)[fn.name](...args, overrides);
      const receipt = await tx.wait();
      setResultMap((prev) => ({ ...prev, [fn.name]: { ok: true, txHash: tx.hash, receipt } }));
    } catch (e: any) {
      const errMsg = typeof e?.message === "string" ? e.message : `${e}`;
      setResultMap((prev) => ({ ...prev, [fn.name]: { ok: false, error: errMsg } }));
    }
  }

  if (loading) {
    return (
      <div className="h-svh pt-5">
        <div className="mx-auto max-w-4xl p-4 font-mono text-xs text-foreground/60">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-svh pt-5">
        <div className="mx-auto max-w-4xl p-4">
          <div className="font-mono text-sm text-red-300">Error</div>
          <div className="font-mono text-xs text-foreground/70 mt-2">{error}</div>
          <div className="font-mono text-xs text-foreground/60 mt-3">
            Ensure your wallet is connected and localStorage contains <code>walletAddress</code>.
          </div>
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="h-svh pt-5">
        <div className="mx-auto max-w-4xl p-4">
          <div className="flex items-center justify-between">
            <div className="font-mono text-xs text-foreground/70">id</div>
            <div className="font-mono text-xs text-foreground/60">{id}</div>
          </div>
          <div className="mt-3 rounded-md border border-foreground/20 p-4">
            <div className="font-mono text-sm text-foreground/80">Contract not found</div>
            <div className="font-mono text-xs text-foreground/60 mt-2">
              Use the editor to create and deploy a contract, then use the Functions button from the deployed panel.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 h-[calc(100svh-90px)]">
      <div className="border-r border-foreground/10 overflow-y-auto p-3">
        <div className="font-mono text-xs text-foreground/60 mb-2">Contract</div>
        <div className="text-white flex items-center gap-2 my-1 w-max border border-foreground/20 pl-2 bg-black rounded-md p-1">
          <img src="/metamask-icon.webp" className="w-[14px] h-[14px]" />
          {doc.deployedAddress || "Not deployed"}
        </div>
        <div className="font-mono text-xs text-foreground/60 mt-3">Network</div>
        <div className="text-white flex items-center gap-2 my-1 w-max border border-foreground/20 pl-2 bg-black rounded-md p-1">
          {doc.deployedNetwork || "Unknown"}
        </div>

        <div className="mt-4">
          <div className="font-mono text-xs text-emerald-400">READ</div>
          <div className="mt-2 space-y-2">
            {readFns.length === 0 && (
              <div className="text-foreground/60 font-mono text-xs">No read functions</div>
            )}
            {readFns.map((fn: any, i: number) => (
              <div key={`read-${i}`} className="rounded-md border border-emerald-400/30">
                <button
                  className="w-full text-left px-3 py-2 bg-emerald-400/10 hover:bg-emerald-400/15 font-mono text-xs text-emerald-300"
                  onClick={() => toggleOpen(fn.name)}
                >
                  {fn.name} · {fn.stateMutability}
                </button>
                {openMap[fn.name] && (
                  <div className="p-3 space-y-2">
                    {(fn.inputs || []).map((inp: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <label className="w-[200px] text-foreground/60">
                          {inp.name || `param_${idx}`} · {inp.type}
                        </label>
                        {Array.isArray(inp?.components) || /\[\]$/.test(inp?.type || "") ? (
                          <textarea
                            className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                            placeholder="JSON"
                            rows={2}
                            value={inputMap[fn.name]?.[`${fn.name}-${idx}`] || ""}
                            onChange={(e) => setParam(fn, idx, e.target.value)}
                          />
                        ) : (
                          <input
                            className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                            placeholder={inp.type}
                            value={inputMap[fn.name]?.[`${fn.name}-${idx}`] || ""}
                            onChange={(e) => setParam(fn, idx, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                    <div className="flex justify-end">
                      <button
                        className="px-3 py-[6px] rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-xs"
                        onClick={() => callRead(fn)}
                        disabled={!doc.deployedAddress}
                        title={!doc.deployedAddress ? "Deploy the contract to enable reads" : "Execute"}
                      >
                        Execute
                      </button>
                    </div>
                    {resultMap[fn.name] && (
                      <div className="mt-2 bg-[#111] border border-foreground/15 rounded-md p-2 font-mono text-xs text-foreground/80 whitespace-pre-wrap">
                        {resultMap[fn.name].ok
                          ? JSON.stringify(resultMap[fn.name].data, null, 2)
                          : `Error: ${resultMap[fn.name].error}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="font-mono text-xs text-yellow-300">WRITE</div>
          <div className="mt-2 space-y-2">
            {writeFns.length === 0 && (
              <div className="text-foreground/60 font-mono text-xs">No write functions</div>
            )}
            {writeFns.map((fn: any, i: number) => (
              <div key={`write-${i}`} className="rounded-md border border-yellow-300/30">
                <button
                  className="w-full text-left px-3 py-2 bg-yellow-300/10 hover:bg-yellow-300/15 font-mono text-xs text-yellow-200"
                  onClick={() => toggleOpen(fn.name)}
                >
                  {fn.name} · {fn.stateMutability}
                </button>
                {openMap[fn.name] && (
                  <div className="p-3 space-y-2">
                    {(fn.inputs || []).map((inp: any, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <label className="w-[200px] text-foreground/60">
                          {inp.name || `param_${idx}`} · {inp.type}
                        </label>
                        {Array.isArray(inp?.components) || /\[\]$/.test(inp?.type || "") ? (
                          <textarea
                            className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                            placeholder="JSON"
                            rows={2}
                            value={inputMap[fn.name]?.[`${fn.name}-${idx}`] || ""}
                            onChange={(e) => setParam(fn, idx, e.target.value)}
                          />
                        ) : (
                          <input
                            className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                            placeholder={inp.type}
                            value={inputMap[fn.name]?.[`${fn.name}-${idx}`] || ""}
                            onChange={(e) => setParam(fn, idx, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                    {fn.stateMutability === "payable" && (
                      <div className="flex items-center gap-2">
                        <label className="w-[200px] text-foreground/60">value · ETH</label>
                        <input
                          className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                          placeholder="0.0"
                          value={valueMap[fn.name] || ""}
                          onChange={(e) => setValueMap((prev) => ({ ...prev, [fn.name]: e.target.value }))}
                        />
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button
                        className="px-3 py-[6px] rounded-md bg-yellow-300 hover:bg-yellow-400 text-black font-mono text-xs"
                        onClick={() => callWrite(fn)}
                        disabled={!doc.deployedAddress}
                        title={!doc.deployedAddress ? "Deploy the contract to enable transactions" : "Send Transaction"}
                      >
                        Send Transaction
                      </button>
                    </div>
                    {resultMap[fn.name] && (
                      <div className="mt-2 bg-[#111] border border-foreground/15 rounded-md p-2 font-mono text-xs text-foreground/80 whitespace-pre-wrap">
                        {resultMap[fn.name].ok
                          ? JSON.stringify({ txHash: resultMap[fn.name].txHash, receipt: summarizeReceipt(resultMap[fn.name].receipt) }, null, 2)
                          : `Error: ${resultMap[fn.name].error}`}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/10">
          <div className="font-mono text-xs text-foreground/60">Solidity</div>
          <div className="font-mono text-xs text-foreground/60">{initialFileName}</div>
        </div>
        <div style={{ height: "calc(100% - 34px)" }}>
          <Editor
            height="100%"
            defaultLanguage="solidity"
            defaultValue={initialCode || ""}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 12 }}
          />
        </div>
      </div>
    </div>
  );
}

function normalizeOutput(out: any): any {
  try {
    if (out == null) return out;
    if (typeof out === "bigint") return out.toString();
    if (Array.isArray(out)) return out.map(normalizeOutput);
    if (typeof out === "object") {
      const o: any = {};
      for (const k of Object.keys(out)) {
        const v = (out as any)[k];
        o[k] = normalizeOutput(v);
      }
      return o;
    }
    return out;
  } catch {
    return out;
  }
}

function summarizeReceipt(r: any): any {
  if (!r) return r;
  const keys = [
    "contractAddress",
    "cumulativeGasUsed",
    "gasUsed",
    "status",
    "transactionHash",
    "type",
  ];
  const out: any = {};
  for (const k of keys) {
    out[k] = r[k];
  }
  return out;
}
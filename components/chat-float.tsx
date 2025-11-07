"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Bot, ArrowRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQuery } from "@tanstack/react-query";

type ChatItem = {
  _id: string;
  address: string;
  contractId?: string;
  question: string;
  answer: string;
  createdAt?: string;
  files?: { name: string; content: string }[];
};

export default function ChatFloat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");

  const contractId = useMemo(() => {
    const p = pathname || "";
    const m = p.match(/^\/sol\/([a-fA-F0-9]{24})/);
    return m?.[1] || null;
  }, [pathname]);

  const walletAddress = useMemo(() => {
    try {
      const a = localStorage.getItem("walletAddress") || "";
      return a || null;
    } catch {
      return null;
    }
  }, []);

  const { data: historyExpanded, isLoading: historyIsLoading } = useQuery<ChatItem[] | undefined>({
    queryKey: ["chat-history", walletAddress?.toLowerCase(), contractId],
    enabled: !!walletAddress && !!contractId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    queryFn: async () => {
      const r = await fetch(`/api/chat/history?address=${walletAddress}&contractId=${contractId}`, {
        method: "GET",
        headers: { "x-wallet-address": walletAddress! },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const list = Array.isArray(data?.chats) ? data.chats : [];
      const expanded: ChatItem[] = list.flatMap((c: any) => [
        {
          _id: `${c._id}-q`,
          address: c.address,
          contractId: c.contractId,
          question: c.question,
          answer: "",
          createdAt: c.createdAt,
        },
        {
          _id: `${c._id}-a`,
          address: c.address,
          contractId: c.contractId,
          question: c.question,
          answer: c.answer,
          createdAt: c.createdAt,
        },
      ]);
      return expanded;
    },
  });

  // Initialize items from cached history once per contract
  useEffect(() => {
    if (historyExpanded && historyExpanded.length > 0 && items.length === 0) {
      setItems(historyExpanded);
    }
  }, [historyExpanded]);

  const send = async () => {
    if (!walletAddress) {
      toast.error("Wallet not connected", { description: "Connect your wallet to chat." });
      return;
    }
    if (!contractId) {
      toast.error("No contract context", { description: "Open a contract (/sol/:id) to chat." });
      return;
    }
    const q = input.trim();
    if (!q) return;
    setLoading(true);
    try {
      const lc = q.toLowerCase();
      const isChange = /\b(fix|change|update|modify|refactor|add feature|implement|bug)\b/.test(lc) || /فیکس|تغییر|عوض|اضافه|ویژگی|فیچر|رفع باگ|بهبود|بهینه/.test(q);
      // Always show the user's message
      setItems((prev) => [
        ...prev,
        { _id: `${Date.now()}-q`, address: walletAddress, contractId, question: q, answer: "" },
      ]);
      if (isChange) {
        // Tell the user we are preparing a diff and not dumping code in chat
        const statusMsg = "Preparing changes and opening the Diff in the editor…";
        setItems((prev) => [
          ...prev,
          { _id: `${Date.now()}-a`, address: walletAddress!, contractId, question: q, answer: statusMsg },
        ]);
        // Trigger AI to produce updated files for this contract
        const ai = await fetch(`/api/ai`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
          },
          body: JSON.stringify({ question: q, address: walletAddress, contractId }),
        });
        if (!ai.ok) throw new Error(await ai.text());
        const aiData = await ai.json();
        const cid = aiData?.contractId || contractId;
        // Fetch persisted files and post an event for the viewer to open diff
        const docRes = await fetch(`/api/contract/${cid}`, {
          method: "GET",
          headers: { "x-wallet-address": walletAddress },
        });
        if (!docRes.ok) throw new Error(await docRes.text());
        const doc = await docRes.json();
        const files = Array.isArray(doc?.contract?.files) ? doc.contract.files : [];
        if (files.length > 0) {
          // Push an actionable message with buttons to open diff or apply
          setItems((prev) => [
            ...prev,
            {
              _id: `${Date.now()}-a`,
              address: walletAddress!,
              contractId: cid,
              question: q,
              answer: "Change proposal is ready. You can open the Diff or apply directly.",
              files,
            },
          ]);
          window.postMessage({ type: "contract-patch-ready", contractId: cid, files }, "*");
          toast.success("Diff opened; please review and confirm changes.");
        } else {
          toast.error("AI response did not include changed files.");
        }
        setInput("");
      } else {
        // Normal chat flow
        const r = await fetch(`/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddress,
          },
          body: JSON.stringify({ address: walletAddress, contractId, question: q }),
        });
        if (!r.ok) throw new Error(await r.text());
        const data = await r.json();
        const ans = String(data?.answer || "");
        setItems((prev) => [
          ...prev,
          { _id: `${Date.now()}-a`, address: walletAddress, contractId, question: q, answer: ans },
        ]);
        // If AI returned code fences, auto-open diff in editor
        const codeBlocks: string[] = [];
        try {
          const re = /```[a-zA-Z0-9_-]*\n([\s\S]*?)```/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(ans)) !== null) {
            if (m[1]) codeBlocks.push(m[1]);
          }
        } catch {}
        if (codeBlocks.length > 0) {
          // Fetch current contract files to pick a target .sol file
          const docRes = await fetch(`/api/contract/${contractId}`, {
            method: "GET",
            headers: { "x-wallet-address": walletAddress },
          });
          if (docRes.ok) {
            const doc = await docRes.json();
            const current = Array.isArray(doc?.contract?.files) ? doc.contract.files : [];
            const solFiles = current.filter((f: any) => String(f?.name || "").endsWith(".sol"));
            const targetName = solFiles.length > 0 ? solFiles[0].name : (current[0]?.name || "ProposedChange.sol");
            const proposed = [{ name: targetName, content: codeBlocks.join("\n\n") }];
            setItems((prev) => [
              ...prev,
              {
                _id: `${Date.now()}-a`,
                address: walletAddress!,
                contractId,
                question: q,
                answer: "Code detected; Diff editor opened.",
                files: proposed,
              },
            ]);
            window.postMessage({ type: "contract-patch-ready", contractId, files: proposed }, "*");
            toast.success("Code opened in Diff");
          }
        }
        setInput("");
      }
    } catch (e: any) {
      toast.error("Chat error", { description: e?.message || String(e) });
    } finally {
      setLoading(false);
    }
  };

  const openDiff = (files: { name: string; content: string }[]) => {
    if (!contractId) return;
    window.postMessage({ type: "contract-patch-ready", contractId, files }, "*");
    toast.success("Diff opened");
  };

  const applyNow = async (files: { name: string; content: string }[]) => {
    try {
      if (!walletAddress || !contractId) throw new Error("Context missing");
      // Load current files and merge with proposed
      const docRes = await fetch(`/api/contract/${contractId}`, {
        method: "GET",
        headers: { "x-wallet-address": walletAddress },
      });
      if (!docRes.ok) throw new Error(await docRes.text());
      const doc = await docRes.json();
      const current = Array.isArray(doc?.contract?.files) ? doc.contract.files : [];
      const map = new Map<string, { name: string; content: string }>(
        current.map((f: any) => [f.name, { name: f.name, content: f.content }])
      );
      for (const pf of files) map.set(pf.name, { name: pf.name, content: pf.content });
      const merged = Array.from(map.values());
      const r = await fetch(`/api/contract/${contractId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddress,
        },
        body: JSON.stringify({ files: merged, code: "" }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success("Changes saved and applied in editor");
      window.postMessage({ type: "contract-files-updated", contractId, files: merged }, "*");
    } catch (e: any) {
      toast.error("Save error", { description: e?.message || String(e) });
    }
  };

  // Only render chat on /sol/:id pages
  if (!contractId) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open AI chat"
          className="fixed bottom-4 right-4 z-40 h-10 w-10 rounded-full bg-black text-white hover:bg-black/80 shadow-lg border border-white/10 flex items-center justify-center"
        >
          <Bot size={18} />
        </button>
      )}
      {open && (
        <div className="fixed bottom-4 right-4 z-40 w-[340px] h-[500px] max-h-[500px] rounded-lg border border-foreground/20 bg-black/80 backdrop-blur flex flex-col">
          <div className="px-3 py-2 border-b border-foreground/10 flex items-center justify-between">
            <div className="font-mono text-xs text-emerald-400">Contract Chat</div>
            <div className="flex items-center gap-2">
              <div className="font-mono text-[10px] text-foreground/60">{contractId || "No contract"}</div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="text-foreground/70 hover:text-foreground text-sm w-6 h-6 flex items-center justify-center rounded hover:bg-white/10"
              >
                ✕
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {historyIsLoading && items.length === 0 ? (
              <div className="font-mono text-xs text-foreground/60">Loading…</div>
            ) : items.length === 0 ? (
              <div className="font-mono text-xs text-foreground/60">No messages</div>
            ) : (
              items.map((it, i) => (
                <div
                  key={`${it._id}-${i}`}
                  className={
                    it.answer
                      ? "bg-[#fff1] p-2 rounded-md"
                      : "bg-[#fff2] p-2 rounded-md"
                  }
                >
                  {it.answer ? (
                    <div className="font-mono text-xs text-white">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => (
                            <p className="mb-2 whitespace-pre-wrap">{children}</p>
                          ),
                          code(props) {
                            const { inline, className, children } = props as any;
                            const lang = /language-(\w+)/.exec(className || "");
                            if (inline) {
                              return (
                                <code className="px-1 py-[2px] rounded bg-black/40 border border-foreground/10">
                                  {children}
                                </code>
                              );
                            }
                            return (
                              <pre className="overflow-auto max-h-[200px] mb-3 boder-none p-2 rounded-md bg-[#111] text-gray">
                                <code className={lang ? `language-${lang[1]}` : undefined}>{children}</code>
                              </pre>
                            );
                          },
                          ul: ({ children }) => (
                            <ul className="list-disc pl-4 mb-2">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="list-decimal pl-4 mb-2">{children}</ol>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-foreground/20 pl-3 my-2 text-foreground/80">
                              {children}
                            </blockquote>
                          ),
                        }}
                      >
                        {it.answer}
                      </ReactMarkdown>
                      {Array.isArray(it.files) && it.files.length > 0 && (
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="px-3 py-[6px] rounded-md bg-yellow-300 hover:bg-yellow-400 text-black font-mono text-[11px]"
                            onClick={() => openDiff(it.files!)}
                          >
                            Open Diff
                          </button>
                          <button
                            className="px-3 py-[6px] rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-[11px]"
                            onClick={() => applyNow(it.files!)}
                          >
                            Apply & Save
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="font-mono text-xs text-foreground/80 whitespace-pre-wrap">
                      you: {it.question}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="pt-2 pb-1 px-2">
            <div className="relative">
              <textarea
                className="w-full outline-none bg-[#ffffff05] border border-foreground/20 rounded-md p-3 pr-10 pb-10 font-mono text-xs text-white resize-none h-24"
                placeholder={contractId ? "You are chatting with Buildr now" : "Open a contract to chat"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!contractId || loading}
              />
              <button
                onClick={send}
                disabled={!contractId || loading}
                aria-label="Send"
                className="absolute bottom-2 right-2 h-8 w-8 text-white/80 hover:text-white flex items-center justify-center"
              >
                {loading ? "…" : <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
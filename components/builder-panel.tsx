"use client";

import { useEffect, useMemo, useState } from "react";

type PlannedItem = { name: string };

export default function BuilderPanel({
  question,
  address,
  contractId,
}: {
  question: string;
  address?: string | null;
  contractId: string;
}) {
  const plannedFiles = useMemo(() => {
    return [{ name: "contracts/[Building...].sol" }];
  }, [question]);

  const [status, setStatus] = useState<string>("Building...");

  // Kick off AI build in the background (best-effort)
  useEffect(() => {
    const addr = address;
    if (!addr) return;
    const traceId = `plan-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    try {
      fetch("/api/ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": addr,
        },
        body: JSON.stringify({ question, address: addr, traceId, contractId }),
      })
        .then(() => setStatus("Building files..."))
        .catch(() => setStatus("Build start failed."));
    } catch {
      setStatus("Build start failed.");
    }
  }, [question, address, contractId]);

  return (
    <div className="m-6 mt-8 p-4 border border-foreground/20 rounded-xl bg-[#121212]">
      <div className="font-mono text-sm text-emerald-400/90">{status}</div>
      <div className="mt-4">
        <div className="font-mono text-xs text-foreground/60 mb-2">
          Files being built
        </div>
        <ul className="space-y-1">
          {plannedFiles.map((f, i) => (
            <li key={i} className="font-mono text-xs text-foreground/80">
              {f.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

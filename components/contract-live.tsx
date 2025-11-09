"use client";

import { useEffect, useState } from "react";
import BuilderPanel from "./builder-panel";
import SolidityViewer from "./solidity-viewer";

type SolFile = { name: string; content: string };
type ContractDoc = {
  _id: string;
  address: string;
  question: string;
  answer: string;
  code?: string;
  files?: SolFile[];
  deployedAddress?: string;
  deployedNetwork?: string;
  deployedOwner?: string;
};

export default function ContractLive({ initial }: { initial: ContractDoc }) {
  const [doc, setDoc] = useState<ContractDoc>(initial);

  useEffect(() => {
    // Poll every 3s until code/files appear, then stop
    let stopped = false;
    const hasBuilt = () => (doc?.files && doc.files.length > 0) || !!doc?.code;
    if (hasBuilt()) return;
    const interval = setInterval(async () => {
      if (stopped) return;
      try {
        const addr =
          (typeof window !== "undefined"
            ? localStorage.getItem("walletAddress")
            : null) || "";
        // Always provide a header: fall back to the initial contract owner address
        const ownerAddr = addr && addr.length > 0 ? addr : initial.address;
        const res = await fetch(`/api/contract/${initial._id}`, {
          headers: { "x-wallet-address": ownerAddr },
        });
        if (!res.ok) return;
        const data = await res.json();
        const next = data?.contract as ContractDoc;
        if (!next) return;
        setDoc(next);
        const built = (next?.files && next.files.length > 0) || !!next?.code;
        if (built) {
          clearInterval(interval);
          stopped = true;
        }
      } catch {}
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [initial._id]);

  const showBuilder = !(doc?.files && doc.files.length > 0) && !doc?.code;
  return (
    <div className="h-svh pt-5">
      {/* {!showBuilder && (
        <BuilderPanel question={doc.question} address={doc.address} contractId={doc._id} />
      )} */}
      <SolidityViewer
        code={doc.code || ""}
        files={doc.files}
        height="calc(100svh - 90px)"
        loading={showBuilder}
        skeletonLines={35}
        prompt={doc.question}
        deployedAddress={doc.deployedAddress}
        deployedNetwork={doc.deployedNetwork}
        deployedOwner={doc.deployedOwner}
      />
    </div>
  );
}
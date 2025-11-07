"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import styles from "./solidity-viewer.module.css";

type SolFile = { name: string; content: string };

const DiffEditor = dynamic(() => import("@monaco-editor/react").then(m => m.DiffEditor), { ssr: false });

export default function DiffBox({
  open,
  currentFiles,
  proposedFiles,
  onApply,
  onClose,
}: {
  open: boolean;
  currentFiles: SolFile[];
  proposedFiles: SolFile[];
  onApply: (files: SolFile[]) => void;
  onClose: () => void;
}) {
  const [activeName, setActiveName] = useState<string>("");

  const fileNames = useMemo(() => {
    const names = new Set<string>();
    (currentFiles || []).forEach((f) => names.add(f.name));
    (proposedFiles || []).forEach((f) => names.add(f.name));
    return Array.from(names);
  }, [currentFiles, proposedFiles]);

  useEffect(() => {
    if (!open) return;
    if (!activeName && fileNames.length > 0) setActiveName(fileNames[0]);
  }, [open, fileNames, activeName]);

  // Keyboard: Esc to close, Ctrl/Cmd+Enter to apply
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        onApply(proposedFiles);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onApply, onClose, proposedFiles]);

  // Lock body scroll while overlay is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const original = (currentFiles || []).find((f) => f.name === activeName)?.content || "";
  const modified = (proposedFiles || []).find((f) => f.name === activeName)?.content || "";

  if (!open) return null;

  return (
    <div
      className={`${styles.overlay} fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex`}
      onClick={onClose}
    > 
      <div
        className={`m-auto rounded-lg w-[72vw] max-w-[1000px] h-[70vh] border border-foreground/20 bg-[#0b0b0b] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-foreground/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <select
              className="bg-black border border-foreground/20 rounded-md px-2 py-1 font-mono text-[11px] text-white"
              value={activeName}
              onChange={(e) => setActiveName(e.target.value)}
            >
              {fileNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              className="px-3 py-[6px] rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-[11px]"
              onClick={() => onApply(proposedFiles)}
            >
              Apply All
            </button>
            <button
              className="px-3 py-[6px] rounded-md bg-foreground/20 hover:bg-foreground/30 text-white font-mono text-[11px]"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0" onWheel={(e) => e.stopPropagation()}>
          <DiffEditor
            original={original}
            modified={modified}
            language="solidity"
            theme="solidity-dark"
            height="62vh"
            options={{
              readOnly: true,
              renderSideBySide: false,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
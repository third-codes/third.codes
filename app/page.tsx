"use client";

import { Hero } from "@/components/hero";
import { Leva } from "leva";
import Marquee from "react-fast-marquee";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { GoSync, GoChevronDown, GoCopy, GoFileCode, GoCommandPalette } from "react-icons/go";

export default function Home() {
  const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
  const router = useRouter();
  const [selectedSolVersion, setSelectedSolVersion] = useState("0.8.20");
  const [solidityVersions, setSolidityVersions] = useState<string[]>([]);

  // Load full Solidity versions from server, fall back to current selection
  useEffect(() => {
    let cancelled = false;
    const loadVersions = async () => {
      try {
        const r = await fetch("/api/solc/versions", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        const arr: string[] = Array.isArray(d?.versions) ? d.versions : [];
        if (!arr.length) return;
        if (cancelled) return;
        setSolidityVersions(arr);
        setSelectedSolVersion((prev) => (arr.includes(prev) ? prev : arr[0]));
      } catch {}
    };
    loadVersions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoToSol = () => {
    const addr =
      typeof window !== "undefined"
        ? (localStorage.getItem("walletAddress") || "")
        : "";
    if (!addr) {
      toast.error("Please connect MetaMask first");
      return;
    }
    router.push("/sol");
  };
  return (
    <>
      <Hero />
      <Leva hidden />
      <div>
        <div className="mt-8 max-w-[1100px] mx-auto mb-16">
          <h4 className="text-center text-lg font-mono text-foreground/40 mb-8">
            <span className="">Trusted</span> by the best teams
          </h4>
          <Marquee
            speed={35}
            pauseOnHover
            gradient
            gradientColor="#000000"
            gradientWidth={80}
          >
            {[
              { src: "/trust/forgeifylogo.png", alt: "Forgeify" },
              { src: "/trust/piranest-logo.png", alt: "Piranest" },
              { src: "/trust/negative5logo.png", alt: "Negative5" },
              { src: "/trust/image 95.png", alt: "Image 95" },
              { src: "/trust/image 97.png", alt: "Image 97" },
              { src: "/trust/Group 427319678 1.png", alt: "Group" },
            ].map((item) => (
              <div key={item.src} className="mx-7 flex items-center">
                <img
                  src={item.src}
                  alt={item.alt}
                  className="h-7 w-auto opacity-50 hover:opacity-100 transition-opacity"
                />
              </div>
            ))}
          </Marquee>
        </div>
        <div className="mt-8 max-w-[1100px] mx-auto mb-16 border border-[#fff2] min-h-[900px]">
      
          <div className="border-b border-[#fff2]">
            <div className="flex justify-between">
              <div className="flex">
                <button
                  onClick={handleGoToSol}
                  className="bg-emerald-400 flex items-center justify-center hover:bg-emerald-500 text-black px-3 py-[6px] font-mono text-xs"
                  title={"Save & Compile (UI only)"}
                >
                  <GoSync className="inline-block w-[14px] h-[14px] mr-2" />
                  Save & Compile
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      className="bg-emerald-500 outline-none h-[30px] flex items-center justify-center hover:bg-emerald-500 text-black px-2 py-[6px] font-mono text-xs"
                    >
                      <GoChevronDown className="inline-block w-[14px] h-[14px]" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className="z-50 min-w=[240px] max-h-[300px] overflow-auto bg-[#111] border border-foreground/10 rounded-md p-1 shadow-xl"
                    >
                      {solidityVersions.map((v) => (
                        <DropdownMenu.Item
                          key={v}
                          className="px-3 py-1 rounded text-foreground/80 hover:bg-foreground/15 font-mono text-xs cursor-pointer focus:outline-none"
                          onSelect={() => setSelectedSolVersion(v)}
                        >
                          {v}
                        </DropdownMenu.Item>
                      ))}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
                <span className="font-mono text-[11px] px-2 py-[6px] text-foreground/70">
                  {selectedSolVersion}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText("Copied!")}
                  className="flex items-center border-r border-foreground/10 justify-center hover:text-white cursor-pointer text-foreground/80 px-3 py-[6px] font-mono text-xs"
                >
                  <GoCopy className="inline-block w-[14px] h-[14px] mr-2" />
                  Copy
                </button>
                <button
                  onClick={() => {}}
                  className="flex items-center justify-center hover:text-white cursor-pointer text-foreground/80 pr-2 pl-1 py-[6px] font-mono text-xs"
                >
                  <GoFileCode className="inline-block w-[14px] h-[14px] mr-2" />
                  Download
                </button>
                <button
                  onClick={handleGoToSol}
                  className="bg-white flex items-center justify-center hover:bg-[#fff9] cursor-pointer text-black px-3 py-[6px] font-mono text-xs"
                >
                  <GoCommandPalette className="inline-block w-[14px] h-[14px] mr-2" />
                  Deploy
                </button>
              </div>
            </div>
          </div>
          <div className="bg-[#111] h-[350px]">
            <MonacoEditor
              height="350px"
              defaultLanguage="solidity"
              theme="vs-dark"
              options={{
                readOnly: true,
                contextmenu: false,
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                scrollbar: { alwaysConsumeMouseWheel: false },
              }}
              defaultValue={"// ThirdCodes — browser-based Solidity with AI.\n// Write, compile, deploy on your preferred network.\n// Connect MetaMask, pick version, and ship.\npragma solidity ^0.8.20;\n\ncontract ThirdCodes {\n    // Simple example; extend with your logic.\n    string public greeting = \"Hello, ThirdCodes!\";\n\n    // TODO: add functions, events, modifiers.\n    // Example getter:\n    function greet() external view returns (string memory) {\n        return greeting;\n    }\n\n    // Change greeting in future versions.\n    // function setGreeting(string calldata m) external { greeting = m; }\n}\n"}
            />
          </div>
        </div>
      </div>
    </>
  );
}

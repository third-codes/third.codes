"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  GoSync,
  GoChevronDown,
  GoCopy,
  GoFileCode,
  GoCommandPalette,
} from "react-icons/go";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function FAQPage() {
  const router = useRouter();
  const solidityVersions = ["0.8.24", "0.8.23", "0.8.22", "0.8.21", "0.8.20"];
  const [selectedSolVersion, setSelectedSolVersion] = useState<string>(
    solidityVersions[0]
  );
  const handleGoToSol = () => {
    try {
      router.push("/sol");
    } catch {}
  };
  const handleCopy = () => {
    try {
      navigator.clipboard.writeText(faqCode);
    } catch {}
  };
  const handleDownload = () => {
    try {
      const blob = new Blob([faqCode], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "FAQ.sol";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  };
  const faqCode = `// FAQ — Answers to 15 common questions about Third Codes
// Format: Solidity contract; Q&A are inside comments for easy reading.
// Each question and answer is marked with //.

pragma solidity ^0.8.20;

contract FAQ {
    // Q1: What is Third Codes?
    // A: A platform to generate, compile, and deploy smart contracts with AI.

    // Q2: Do I need MetaMask?
    // A: Yes. You need MetaMask or a compatible wallet to deploy and manage.

    // Q3: How do I deploy a contract?
    // A: Generate code, pick a network, configure parameters, then click Deploy.

    // Q4: Can I change networks?
    // A: Yes. We support EVM networks like Ethereum, Polygon, Optimism, and more.

    // Q5: Where do I choose the Solidity version?
    // A: Use the Solc versions menu to select the right compiler version.

    // Q6: Is the generated code compatible with OpenZeppelin?
    // A: Yes. Many templates follow OpenZeppelin standards and patterns.

    // Q7: Can I edit my code?
    // A: Yes. The editor runs in-browser so you can change any part.

    // Q8: Can I adjust gas and value?
    // A: Yes. Before deploying, you can set Gas and Value parameters.

    // Q9: Are my contract histories saved?
    // A: Yes. Contracts associated with your wallet appear in History.

    // Q10: Can I use multiple Solidity files?
    // A: Yes. Projects can include multiple files and be saved together.

    // Q11: Do I get help with compile errors?
    // A: Yes. The Fix tool analyzes errors and suggests corrected code.

    // Q12: Can I test ABI and contract functions?
    // A: Yes. After deploy or loading an ABI, Read/Write functions are available.

    // Q13: Are you in beta?
    // A: Yes. We just launched and are in beta.

    // Q14: Is my data secure?
    // A: We follow best security practices and secure connections for API/DB.

    // Q15: How do I get started?
    // A: From Home, pick a template or write a prompt and begin.
}
`;

  return (
    <div className="max-w-[1150px] mx-auto px-4 mt-10 mb-16">
      <h1 className="text-white font-mono mt-[200px] text-center text-4xl">
        Frequently Asked Questions
      </h1>
      <p className="text-foreground/60 font-mono text-center text-sm mt-2">
        Short, practical answers about building and deploying smart contracts
        with Third Codes.
      </p>
      <div className="mt-16 border border-[#fff2] bg-[#111] rounded-md overflow-hidden">
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
                  <button className="bg-emerald-500 outline-none h-[30px] flex items-center justify-center hover:bg-emerald-500 text-black px-2 py-[6px] font-mono text-xs">
                    <GoChevronDown className="inline-block w-[14px] h-[14px]" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="z-50 min-w-[240px] max-h-[300px] overflow-auto bg-[#111] border border-foreground/10 rounded-md p-1 shadow-xl"
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
                onClick={handleCopy}
                className="flex items-center border-r border-foreground/10 justify-center hover:text-white cursor-pointer text-foreground/80 px-3 py-[6px] font-mono text-xs"
              >
                <GoCopy className="inline-block w-[14px] h-[14px] mr-2" />
                Copy
              </button>
              <button
                onClick={handleDownload}
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
        <Editor
          height="800px"
          theme="faq-dark"
          defaultValue={faqCode}
          language="solidity"
          beforeMount={(monaco) => {
            // ثبت زبان در صورت نیاز
            try {
              // @ts-ignore
              if (
                !monaco.languages
                  .getLanguages()
                  .some((l: any) => l.id === "solidity")
              ) {
                monaco.languages.register({ id: "solidity" });
              }
              // تعریف قوانین برجسته‌سازی نحو برای Solidity
              monaco.languages.setMonarchTokensProvider("solidity", {
                defaultToken: "",
                tokenPostfix: ".sol",
                keywords: [
                  "pragma",
                  "import",
                  "contract",
                  "library",
                  "interface",
                  "struct",
                  "enum",
                  "function",
                  "event",
                  "modifier",
                  "mapping",
                  "returns",
                  "public",
                  "external",
                  "internal",
                  "private",
                  "view",
                  "pure",
                  "payable",
                  "memory",
                  "storage",
                  "calldata",
                  "if",
                  "else",
                  "for",
                  "while",
                  "try",
                  "catch",
                  "revert",
                  "emit",
                  "using",
                  "as",
                  "is",
                  "new",
                  "return",
                  "assembly",
                  "constructor",
                  "abstract",
                  "virtual",
                  "override",
                  "constant",
                ],
                typeKeywords: [
                  "address",
                  "bool",
                  "string",
                  "bytes",
                  "uint",
                  "int",
                ],
                operators: [
                  "=",
                  ">",
                  "<",
                  "!",
                  "~",
                  "?",
                  ":",
                  "==",
                  "!=",
                  ">=",
                  "<=",
                  "+",
                  "-",
                  "*",
                  "/",
                  "%",
                  "++",
                  "--",
                  "&&",
                  "||",
                ],
                symbols: /[=><!~?:&|+\-*\/\^%]+/,
                tokenizer: {
                  root: [
                    [/\/\/.*$/, "comment"],
                    [/\/\*/, "comment", "@comment"],
                    [
                      /[a-zA-Z_$][\w$]*/,
                      {
                        cases: {
                          "@typeKeywords": "type",
                          "@keywords": "keyword",
                          "@default": "identifier",
                        },
                      },
                    ],
                    [/[{}()\[\]]/, "@brackets"],
                    [
                      /(@symbols)/,
                      {
                        cases: {
                          "@operators": "operator",
                          "@default": "delimiter",
                        },
                      },
                    ],
                    [/0[xX][0-9a-fA-F]+/, "number.hex"],
                    [/\d+/, "number"],
                    [/"([^"\\]|\\.)*"/, "string"],
                    [/\'([^'\\]|\\.)*\'/, "string"],
                    { include: "@whitespace" },
                  ],
                  comment: [
                    [/[^\/*]+/, "comment"],
                    [/\*\//, "comment", "@pop"],
                    [/[/\*]/, "comment"],
                  ],
                  whitespace: [[/[ \t\r\n]+/, "white"]],
                },
              });
              monaco.languages.setLanguageConfiguration("solidity", {
                comments: { lineComment: "//", blockComment: ["/*", "*/"] },
                brackets: [
                  ["{", "}"],
                  ["[", "]"],
                  ["(", ")"],
                ],
                autoClosingPairs: [
                  { open: "{", close: "}" },
                  { open: "[", close: "]" },
                  { open: "(", close: ")" },
                  { open: '"', close: '"' },
                  { open: "'", close: "'" },
                ],
              });
            } catch (_) {}

            // تعریف تم سفارشی با پس‌زمینه مشکی
            monaco.editor.defineTheme("faq-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "comment", foreground: "6A9955" },
                { token: "keyword", foreground: "C586C0" },
                { token: "type", foreground: "4EC9B0" },
                { token: "string", foreground: "CE9178" },
                { token: "number", foreground: "B5CEA8" },
              ],
              colors: {
                "editor.background": "#111111",
                "editorLineNumber.foreground": "#5A5A5A",
                "editorCursor.foreground": "#FFFFFF",
                "editorIndentGuide.background": "#222222",
                "scrollbarSlider.background": "#33333388",
                "scrollbarSlider.hoverBackground": "#404040AA",
                "scrollbarSlider.activeBackground": "#4D4D4DAA",
              },
            });
          }}
          onMount={(editor) => {
            // وقتی اسکرول ادیتور به ابتدا/انتها رسید، اسکرول صفحه ادامه یابد
            const node = editor.getDomNode();
            if (!node) return;
            const wheelHandler = (ev: WheelEvent) => {
              const deltaY = ev.deltaY;
              const top = editor.getScrollTop();
              const height = editor.getLayoutInfo().height;
              const max = editor.getScrollHeight() - height;
              const atTop = top <= 0;
              const atBottom = top >= max - 1;
              if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
                ev.preventDefault();
                window.scrollBy({ top: deltaY, behavior: "auto" });
              }
            };
            node.addEventListener("wheel", wheelHandler, { passive: false });
          }}
          options={{
            readOnly: true,
            contextmenu: false,
            fontSize: 12,
            minimap: { enabled: false },
            wordWrap: "on",
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            automaticLayout: true,
            padding: { top: 8 },
            scrollbar: { alwaysConsumeMouseWheel: false },
          }}
        />
      </div>
      <h3 className="text-center text-4xl font-mono mt-22"> Ready to start?</h3>
      <p className="mt-3 text-center mb-5 font-mono text-foreground/60">
        We’ll generate an empty smart contract structure for you, ready to build{" "}
        <br /> and launch with AI instantly.
      </p>
      <button className="bg-white font-mono mb-16 hover:opacity-80 cursor-pointer py-2 mx-auto mt-5 block px-8 text-black rounded-full text-sm">
        Build Now!
      </button>
    </div>
  );
}

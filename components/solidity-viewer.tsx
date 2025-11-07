"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";
import styles from "./solidity-viewer.module.css";
import { GoFileCode } from "react-icons/go";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import Tree from "rc-tree";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  GoTrash,
  GoCommandPalette,
  GoChevronDown,
  GoSync,
  GoShieldCheck,
  GoShare,
  GoCopy,
  GoArrowRight,
} from "react-icons/go";
import { HiOutlineFolderPlus, HiOutlinePencil } from "react-icons/hi2";
import { toast } from "sonner";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });
const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false }
);

type SolFile = { name: string; content: string };

type ContractDoc = {
  _id: string;
  address?: string;
  question: string;
  code?: string;
  files?: SolFile[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
  deployedAddress?: string;
  deployedNetwork?: string;
  deployedOwner?: string;
  abi?: any[];
};

// Global message types for cross-component actions
type PatchEvent = {
  type: "contract-patch-ready" | "contract-files-updated";
  contractId: string;
  files: SolFile[];
};

// Helper to truncate long strings with a middle ellipsis, e.g. 0x1234...abcd
function ellipsizeMiddle(str?: string, start = 6, end = 4) {
  const s = String(str || "");
  if (s.length <= start + end + 3) return s;
  return `${s.slice(0, start)}...${s.slice(-end)}`;
}

const SOLIDITY_VERSIONS: string[] = [
  "0.8.30+commit.73712a01",
  "0.8.29+commit.ab55807c",
  "0.8.28+commit.7893614a",
  "0.8.27+commit.40a35a09",
  "0.8.26+commit.8a97fa7a",
  "0.8.25+commit.b61c2a91",
  "0.8.24+commit.e11b9ed9",
  "0.8.23+commit.f704f362",
  "0.8.22+commit.4fc1097e",
  "0.8.21+commit.d9974bed",
  "0.8.20+commit.a1b79de6",
  "0.8.19+commit.7dd6d404",
  "0.8.18+commit.87f61d96",
  "0.8.17+commit.8df45f5f",
  "0.8.16+commit.07a7930e",
  "0.8.15+commit.e14f2714",
  "0.8.14+commit.80d49f37",
  "0.8.13+commit.abaa5c0e",
  "0.8.12+commit.f00d7308",
  "0.8.11+commit.d7f03943",
  "0.8.10+commit.fc410830",
  "0.8.9+commit.e5eed63a",
  "0.8.8+commit.dddeac2f",
  "0.8.7+commit.e28d00a7",
  "0.8.6+commit.11564f7e",
  "0.8.5+commit.a4f2e591",
  "0.8.4+commit.c7e474f2",
  "0.8.3+commit.8d00100c",
  "0.8.2+commit.661d1103",
  "0.8.1+commit.df193b15",
  "0.8.0+commit.c7dfd78e",
  "0.7.6+commit.7338295f",
  "0.7.5+commit.eb77ed08",
  "0.7.4+commit.3f05b770",
  "0.7.3+commit.9bfce1f6",
  "0.7.2+commit.51b20bc0",
  "0.7.1+commit.f4a555be",
  "0.7.0+commit.9e61f92b",
  "0.6.12+commit.27d51765",
  "0.6.11+commit.5ef660b1",
  "0.6.10+commit.00c0fcaf",
  "0.6.9+commit.3e3065ac",
  "0.6.8+commit.0bbfe453",
  "0.6.7+commit.b8d736ae",
  "0.6.6+commit.6c089d02",
  "0.6.5+commit.f956cc89",
  "0.6.4+commit.1dca32f3",
  "0.6.3+commit.8dda9521",
  "0.6.2+commit.bacdbe57",
  "0.6.1+commit.e6f7d5a4",
  "0.6.0+commit.26b70077",
  "0.5.17+commit.d19bba13",
  "0.5.16+commit.9c3226ce",
  "0.5.15+commit.6a57276f",
  "0.5.14+commit.01f1aaa4",
  "0.5.13+commit.5b0b510c",
  "0.5.12+commit.7709ece9",
  "0.5.11+commit.22be8592",
  "0.5.11+commit.c082d0b4",
];

export default function SolidityViewer({
  code,
  height,
  files,
  loading,
  skeletonLines = 14,
  prompt,
  deployedAddress,
  deployedNetwork,
  deployedOwner,
  showHistory = true,
}: {
  code: string;
  height?: string;
  files?: SolFile[];
  loading?: boolean;
  skeletonLines?: number;
  prompt?: string;
  deployedAddress?: string;
  deployedNetwork?: string;
  deployedOwner?: string;
  showHistory?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  // Diff overlay states
  const [diffOpen, setDiffOpen] = useState<boolean>(false);
  const [proposedFiles, setProposedFiles] = useState<SolFile[]>([]);
  const { data: history = [], isLoading: historyLoading } = useQuery<
    ContractDoc[]
  >({
    queryKey: ["contract-list", walletAddr || ""],
    enabled: !!walletAddr,
    queryFn: async () => {
      if (!walletAddr) return [];
      const r = await fetch(`/api/contract/list?address=${walletAddr}`, {
        headers: { "x-wallet-address": walletAddr },
      });
      if (!r.ok) return [];
      const d = await r.json();
      const items: ContractDoc[] = Array.isArray(d?.contracts)
        ? d.contracts
        : [];
      return items;
    },
    staleTime: 2 * 60 * 1000,
  });
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null
  );
  // Listen for patch events from chat to open diff overlay
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const msg = e?.data as PatchEvent | undefined;
      if (!msg || typeof msg.type !== "string") return;
      const m = (pathname || "").match(/^\/sol\/([a-fA-F0-9]{24})/);
      const currentId = m?.[1] || selectedContractId || "";
      if (!currentId || msg.contractId !== currentId) return;
      const files = Array.isArray(msg.files) ? msg.files : [];
      if (files.length === 0) return;
      if (msg.type === "contract-patch-ready") {
        setProposedFiles(files);
        setDiffOpen(true);
      } else if (msg.type === "contract-files-updated") {
        setOverrideDoc((prev) => ({
          _id: prev?._id || currentId,
          question: prev?.question || prompt || "",
          code: undefined,
          files,
          deployedAddress: prev?.deployedAddress,
          deployedNetwork: prev?.deployedNetwork,
          deployedOwner: prev?.deployedOwner,
          abi: prev?.abi,
        }));
        setDiffOpen(false);
        toast.success("Files updated");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pathname, selectedContractId]);
  // Show empty-state when nothing is selected
  const noSelection = !loading && !selectedContractId;
  const [overrideDoc, setOverrideDoc] = useState<ContractDoc | null>(null);
  const [selectedSolVersion, setSelectedSolVersion] = useState<string>(
    SOLIDITY_VERSIONS[0]
  );
  const [solidityVersions, setSolidityVersions] =
    useState<string[]>(SOLIDITY_VERSIONS);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileStatus, setCompileStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [compileMessage, setCompileMessage] = useState<string | null>(null);
  const [compileErrors, setCompileErrors] = useState<any[]>([]);
  const [isFixing, setIsFixing] = useState<boolean>(false);
  const [compiledAbi, setCompiledAbi] = useState<any[] | null>(null);
  const [compiledBytecode, setCompiledBytecode] = useState<string | null>(null);
  const [compiledContractName, setCompiledContractName] = useState<
    string | null
  >(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [deployOpen, setDeployOpen] = useState(false);
  const [functionsOpen, setFunctionsOpen] = useState(false);
  const [deployAccount, setDeployAccount] = useState<string>("");
  // Typing preview state for the small SOL editor skeleton
  const [typingText, setTypingText] = useState<string>("");
  const typingRef = useRef<number | null>(null);
  // User-provided DEX sample for typing preview
  const fullExample = `// SPDX-License-Identifier: MIT\npragma solidity ^0.8.17;\n\ninterface IERC20 {\n    function transfer(address to, uint256 value) external returns (bool);\n    function transferFrom(address from, address to, uint256 value) external returns (bool);\n    function balanceOf(address owner) external view returns (uint256);\n}\n\ncontract ThirdCodesDEX {\n    IERC20 public token0;\n    IERC20 public token1;\n    uint256 public reserve0;\n    uint256 public reserve1;\n    uint256 public totalLP;\n    mapping(address => uint256) public lpBalance;\n\n    uint256 private constant FEE_NUM = 997;\n    uint256 private constant FEE_DEN = 1000;\n    bool private locked;\n\n    modifier lock() {\n        require(!locked, \"LOCKED\");\n        locked = true;\n        _;\n        locked = false;\n    }\n\n    constructor(address _token0, address _token1) {\n        require(_token0 != _token1, \"same tokens\");\n        token0 = IERC20(_token0);\n        token1 = IERC20(_token1);\n    }\n\n    function addLiquidity(uint256 amt0, uint256 amt1) external lock returns (uint256 lp) {\n        require(amt0 > 0 && amt1 > 0, \"zero amount\");\n        token0.transferFrom(msg.sender, address(this), amt0);\n        token1.transferFrom(msg.sender, address(this), amt1);\n\n        if (totalLP == 0) {\n            lp = _sqrt(amt0 * amt1);\n        } else {\n            lp = _min((amt0 * totalLP) / reserve0, (amt1 * totalLP) / reserve1);\n        }\n        require(lp > 0, \"lp=0\");\n\n        lpBalance[msg.sender] += lp;\n        totalLP += lp;\n        _updateReserves();\n    }\n\n    function removeLiquidity(uint256 lp) external lock returns (uint256 amt0, uint256 amt1) {\n        require(lpBalance[msg.sender] >= lp, \"not enough LP\");\n        amt0 = (lp * reserve0) / totalLP;\n        amt1 = (lp * reserve1) / totalLP;\n\n        lpBalance[msg.sender] -= lp;\n        totalLP -= lp;\n        token0.transfer(msg.sender, amt0);\n        token1.transfer(msg.sender, amt1);\n        _updateReserves();\n    }\n\n    function swap(uint256 amountIn, address tokenIn, address to) external lock returns (uint256 amountOut) {\n        require(amountIn > 0, \"zero input\");\n        bool is0in = tokenIn == address(token0);\n        require(is0in || tokenIn == address(token1), \"invalid token\");\n\n        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);\n        uint256 amountInWithFee = (amountIn * FEE_NUM) / FEE_DEN;\n\n        (uint256 r0, uint256 r1) = (reserve0, reserve1);\n        if (is0in) {\n            amountOut = (amountInWithFee * r1) / (r0 + amountInWithFee);\n            token1.transfer(to, amountOut);\n        } else {\n            amountOut = (amountInWithFee * r0) / (r1 + amountInWithFee);\n            token0.transfer(to, amountOut);\n        }\n        _updateReserves();\n    }\n\n    function _updateReserves() internal {\n        reserve0 = token0.balanceOf(address(this));\n        reserve1 = token1.balanceOf(address(this));\n    }\n\n    function _sqrt(uint256 y) private pure returns (uint256 z) {\n        if (y > 3) {\n            z = y;\n            uint256 x = y / 2 + 1;\n            while (x < z) {\n                z = x;\n                x = (y / x + x) / 2;\n            }\n        } else if (y != 0) {\n            z = 1;\n        }\n    }\n\n    function _min(uint256 a, uint256 b) private pure returns (uint256) {\n        return a < b ? a : b;\n    }\n}\n// LODING...\n`;
  // Start typing effect while loading (show preview code immediately)
  useEffect(() => {
    if (!loading) {
      setTypingText("");
      if (typingRef.current) {
        window.clearInterval(typingRef.current);
        typingRef.current = null;
      }
      return;
    }
    let i = 0;
    if (typingRef.current) {
      window.clearInterval(typingRef.current);
    }
    // Seed first character so code appears instantly
    setTypingText(fullExample.slice(0, 1));
    typingRef.current = window.setInterval(() => {
      i += 1;
      setTypingText(fullExample.slice(0, i));
      if (i >= fullExample.length) {
        if (typingRef.current) {
          window.clearInterval(typingRef.current);
          typingRef.current = null;
        }
      }
    }, 25);
    return () => {
      if (typingRef.current) {
        window.clearInterval(typingRef.current);
        typingRef.current = null;
      }
    };
  }, [loading]);
  // Auto-scroll the 400px Monaco editor to the latest line when typingText grows
  useEffect(() => {
    try {
      const editor: any = editorRef?.current;
      const model = editor?.getModel?.();
      if (!editor || !model) return;
      const lastLine = model.getLineCount();
      editor.revealLine(lastLine);
    } catch {}
  }, [typingText]);

  // Register language and theme for Solidity highlighting in Monaco
  const handleEditorWillMount = useCallback((monaco: any) => {
    try {
      monaco.languages.register({ id: "sol" });
      monaco.languages.setMonarchTokensProvider("sol", {
        defaultToken: "invalid",
        tokenPostfix: ".sol",
        keywords: [
          "pragma",
          "solidity",
          "contract",
          "library",
          "interface",
          "import",
          "using",
          "for",
          "struct",
          "enum",
          "event",
          "modifier",
          "function",
          "returns",
          "return",
          "abstract",
          "override",
          "virtual",
          "constructor",
          "receive",
          "fallback",
          "error",
          "public",
          "private",
          "internal",
          "external",
          "view",
          "pure",
          "payable",
          "calldata",
          "memory",
          "storage",
        ],
        typeKeywords: [
          "address",
          "bool",
          "string",
          "bytes",
          "bytes1",
          "bytes32",
          "uint",
          "uint8",
          "uint16",
          "uint32",
          "uint64",
          "uint128",
          "uint256",
          "int",
          "int256",
        ],
        operators: [
          "=",
          "+",
          "-",
          "*",
          "/",
          "%",
          "==",
          "!=",
          "<",
          "<=",
          ">",
          ">=",
          "&&",
          "||",
          "!",
          "&",
          "|",
          "^",
          "~",
          "<<",
          ">>",
          "+=",
          "-=",
          "*=",
          "/=",
          "%=",
          "++",
          "--",
        ],
        symbols: /[=><!~?:&|+\-*\/\^%]+/,
        escapes: /\\(?:[abfnrtv\\\"\'0-9xuv])/,
        tokenizer: {
          root: [
            [/\/\/.*$/, "comment"],
            [/\/\*.*?\*\//, "comment"],
            [/\bpragma\b/, "keyword"],
            [
              /[a-zA-Z_$][\w$]*/,
              {
                cases: {
                  "@keywords": "keyword",
                  "@typeKeywords": "type",
                  "@default": "identifier",
                },
              },
            ],
            { include: "@whitespace" },
            [/[{}\[\]()]/, "delimiter"],
            [
              /(@symbols)/,
              {
                cases: {
                  "@operators": "operator",
                  "@default": "delimiter",
                },
              },
            ],
            [/\d+(_\d+)*/, "number"],
            [/0x[0-9a-fA-F]+/, "number"],
            [/\"([^\\\"]|\\.)*\"/, "string"],
            [/\'([^\\\']|\\.)*\'/, "string"],
          ],
          whitespace: [[/[ \t\r\n]+/, "white"]],
        },
      });

      monaco.editor.defineTheme("sol-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "comment", foreground: "75715E" },
          { token: "keyword", foreground: "FFC700" },
          { token: "type", foreground: "66D9EF" },
          { token: "string", foreground: "A6E22E" },
          { token: "number", foreground: "AE81FF" },
          { token: "operator", foreground: "F8F8F2" },
          { token: "identifier", foreground: "F8F8F2" },
        ],
        colors: {
          "editor.background": "#0f0f0f",
        },
      });
    } catch {}
  }, []);
  const [customGas, setCustomGas] = useState<boolean>(false);
  const [gasLimit, setGasLimit] = useState<string>("");
  const [value, setValue] = useState<string>("0");
  const [valueUnit, setValueUnit] = useState<"wei" | "gwei" | "ether">("wei");
  const [constructorParams, setConstructorParams] = useState<
    Array<{ type: string; name?: string; value: string }>
  >([]);
  const [isDeploying, setIsDeploying] = useState<boolean>(false);

  // Save controls (autosave removed)
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Monaco editor refs for inline error markers
  const monacoRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  // Functions runner state
  const [fnFilter, setFnFilter] = useState<string>("");
  const [fnOpenMap, setFnOpenMap] = useState<Record<string, boolean>>({});
  const [fnInputMap, setFnInputMap] = useState<
    Record<string, Record<string, string>>
  >({});
  const [fnValueMap, setFnValueMap] = useState<Record<string, string>>({});
  const [fnResultMap, setFnResultMap] = useState<Record<string, any>>({});

  const toggleFnOpen = useCallback((name: string) => {
    setFnOpenMap((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const setFnParam = useCallback((fn: any, idx: number, val: string) => {
    const key = `${fn?.name || "fn"}-${idx}`;
    setFnInputMap((prev) => {
      const existing = prev[fn.name] || {};
      return { ...prev, [fn.name]: { ...existing, [key]: val } };
    });
  }, []);

  const normalizeOutput = useCallback((out: any): any => {
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
  }, []);

  const summarizeReceipt = useCallback((r: any): any => {
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
    for (const k of keys) out[k] = r[k];
    return out;
  }, []);

  const callFnRead = useCallback(
    async (fn: any) => {
      try {
        if (!overrideDoc?.deployedAddress) throw new Error("Not deployed");
        const ethereum =
          typeof window !== "undefined" ? (window as any).ethereum : null;
        const provider = ethereum
          ? new (await import("ethers")).ethers.BrowserProvider(ethereum)
          : null;
        if (!provider) throw new Error("Wallet not connected");
        const { ethers } = await import("ethers");
        const abiArr = Array.isArray(overrideDoc?.abi)
          ? overrideDoc!.abi!
          : Array.isArray(compiledAbi)
          ? compiledAbi!
          : [];
        const contract = new ethers.Contract(
          overrideDoc!.deployedAddress!,
          abiArr,
          await provider
        );
        const args = (fn?.inputs || []).map((inp: any, idx: number) => {
          const v = fnInputMap[fn.name]?.[`${fn.name}-${idx}`] ?? "";
          if (Array.isArray(inp?.components) || /\[\]$/.test(inp?.type || "")) {
            try {
              return JSON.parse(v || "null");
            } catch {
              return v;
            }
          }
          if (
            (inp?.type || "").startsWith("uint") ||
            (inp?.type || "").startsWith("int")
          )
            return v ? v : "0";
          if ((inp?.type || "") === "bool") return /^true$/i.test(v);
          return v;
        });
        const out = await (contract as any)[fn.name](...args);
        const normalized = normalizeOutput(out);
        setFnResultMap((prev) => ({
          ...prev,
          [fn.name]: { ok: true, data: normalized },
        }));
      } catch (e: any) {
        const errMsg = typeof e?.message === "string" ? e.message : `${e}`;
        setFnResultMap((prev) => ({
          ...prev,
          [fn.name]: { ok: false, error: errMsg },
        }));
      }
    },
    [
      compiledAbi,
      fnInputMap,
      normalizeOutput,
      overrideDoc?.abi,
      overrideDoc?.deployedAddress,
    ]
  );

  const callFnWrite = useCallback(
    async (fn: any) => {
      try {
        if (!overrideDoc?.deployedAddress) throw new Error("Not deployed");
        const ethereum =
          typeof window !== "undefined" ? (window as any).ethereum : null;
        const provider = ethereum
          ? new (await import("ethers")).ethers.BrowserProvider(ethereum)
          : null;
        if (!provider) throw new Error("Wallet not connected");
        const signer = await provider.getSigner();
        const { ethers } = await import("ethers");
        const abiArr = Array.isArray(overrideDoc?.abi)
          ? overrideDoc!.abi!
          : Array.isArray(compiledAbi)
          ? compiledAbi!
          : [];
        const contract = new ethers.Contract(
          overrideDoc!.deployedAddress!,
          abiArr,
          signer
        );
        const args = (fn?.inputs || []).map((inp: any, idx: number) => {
          const v = fnInputMap[fn.name]?.[`${fn.name}-${idx}`] ?? "";
          if (Array.isArray(inp?.components) || /\[\]$/.test(inp?.type || "")) {
            try {
              return JSON.parse(v || "null");
            } catch {
              return v;
            }
          }
          if (
            (inp?.type || "").startsWith("uint") ||
            (inp?.type || "").startsWith("int")
          )
            return v ? v : "0";
          if ((inp?.type || "") === "bool") return /^true$/i.test(v);
          return v;
        });
        const overrides: any = {};
        if (fn.stateMutability === "payable") {
          const ethVal = fnValueMap[fn.name];
          if (ethVal && ethVal.trim().length > 0)
            overrides.value = (await import("ethers")).ethers.parseEther(
              ethVal
            );
        }
        const tx = await (contract as any)[fn.name](...args, overrides);
        const receipt = await tx.wait();
        setFnResultMap((prev) => ({
          ...prev,
          [fn.name]: { ok: true, txHash: tx.hash, receipt },
        }));
      } catch (e: any) {
        const errMsg = typeof e?.message === "string" ? e.message : `${e}`;
        setFnResultMap((prev) => ({
          ...prev,
          [fn.name]: { ok: false, error: errMsg },
        }));
      }
    },
    [
      compiledAbi,
      fnInputMap,
      fnValueMap,
      overrideDoc?.abi,
      overrideDoc?.deployedAddress,
    ]
  );

  const applyMarkers = useCallback((errors: Array<any>) => {
    try {
      const monaco = monacoRef.current;
      const model = modelRef.current;
      if (!monaco || !model) return;
      const markers = (errors || []).map((err) => {
        const loc = err?.loc || err?.location || null;
        const startLine = Number(
          err?.line ?? loc?.line ?? loc?.start?.line ?? 1
        );
        const startColumn = Number(
          err?.column ?? loc?.column ?? loc?.start?.column ?? 1
        );
        const endLine = Number(err?.endLine ?? loc?.end?.line ?? startLine);
        const endColumn = Number(
          err?.endColumn ?? loc?.end?.column ?? startColumn + 1
        );
        return {
          severity: (monaco as any).MarkerSeverity.Error,
          message: String(err?.message || "Error"),
          startLineNumber: startLine,
          startColumn,
          endLineNumber: endLine,
          endColumn,
        };
      });
      (monaco as any).editor.setModelMarkers(model, "solidity", markers);
    } catch {}
  }, []);

  const clearMarkers = useCallback(() => {
    try {
      const monaco = monacoRef.current;
      const model = modelRef.current;
      if (monaco && model) {
        (monaco as any).editor.setModelMarkers(model, "solidity", []);
      }
    } catch {}
  }, []);

  // Current account and on-screen network/balance next to Account
  const [currentAccount, setCurrentAccount] = useState<string | null>(null);
  const [chainName, setChainName] = useState<string | null>(null);
  const [balanceSymbol, setBalanceSymbol] = useState<string>("ETH");
  const [balanceText, setBalanceText] = useState<string | null>(null);

  // Notify if MetaMask is missing (only if no wallet is already stored)
  useEffect(() => {
    const addr =
      typeof window !== "undefined"
        ? localStorage.getItem("walletAddress")
        : null;
    const ethereum =
      typeof window !== "undefined" ? (window as any).ethereum : null;
    if (!addr && !ethereum) {
      toast.warning("MetaMask not detected", {
        description: "Install MetaMask to manage and deploy contracts.",
        action: {
          label: "Install",
          onClick: () => {
            try {
              window.open("https://metamask.io/download.html", "_blank");
            } catch {}
          },
        },
      });
    }
  }, []);

  // Initialize wallet state from storage and listen for live changes
  useEffect(() => {
    const init = () => {
      try {
        const conn =
          typeof window !== "undefined" &&
          localStorage.getItem("walletConnected") === "true";
        const addr =
          typeof window !== "undefined"
            ? localStorage.getItem("walletAddress")
            : null;
        setWalletConnected(!!conn && !!addr);
        setWalletAddr(!!conn && addr ? addr : null);
      } catch {}
    };
    init();

    const onConnected = (e: any) => {
      const addr = e?.detail?.address || null;
      setWalletConnected(!!addr);
      setWalletAddr(addr);
    };
    const onDisconnected = () => {
      setWalletConnected(false);
      setWalletAddr(null);
      try {
        queryClient.removeQueries({ queryKey: ["contract-list"] });
      } catch {}
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "walletConnected" || ev.key === "walletAddress") {
        init();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("wallet:connected", onConnected as EventListener);
      window.addEventListener(
        "wallet:disconnected",
        onDisconnected as EventListener
      );
      window.addEventListener("storage", onStorage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          "wallet:connected",
          onConnected as EventListener
        );
        window.removeEventListener(
          "wallet:disconnected",
          onDisconnected as EventListener
        );
        window.removeEventListener("storage", onStorage);
      }
    };
  }, [queryClient]);

  // Restore active chat history selection from URL (/sol/:id) on refresh/navigation
  useEffect(() => {
    try {
      const p = pathname || "";
      const m = p.match(/^\/sol\/([a-fA-F0-9]{24})/);
      const id = m?.[1] || null;
      setSelectedContractId(id);
    } catch {}
  }, [pathname]);

  // Hydrate deployed info immediately from props (SSR) to avoid delayed render
  useEffect(() => {
    try {
      if (!deployedAddress && !deployedNetwork && !deployedOwner) return;
      setOverrideDoc((prev) => ({
        _id: prev?._id || selectedContractId || "",
        question: prev?.question || prompt || "",
        code: prev?.code,
        files: prev?.files,
        createdAt: prev?.createdAt,
        updatedAt: prev?.updatedAt,
        deployedAddress: deployedAddress || prev?.deployedAddress,
        deployedNetwork: deployedNetwork || prev?.deployedNetwork,
        deployedOwner: deployedOwner || prev?.deployedOwner,
      }));
    } catch {}
  }, [deployedAddress, deployedNetwork, deployedOwner]);

  // Determine current account to reflect in balance/network (prefer deployAccount, then storage; avoid auto-connecting)
  useEffect(() => {
    const readAcct = async () => {
      let acct = deployAccount?.trim() || null;
      if (!acct) {
        try {
          const isConnected =
            typeof window !== "undefined" &&
            localStorage.getItem("walletConnected") === "true";
          if (isConnected && typeof window !== "undefined") {
            const stored = localStorage.getItem("walletAddress");
            if (stored) acct = stored;
          } else {
            acct = null;
          }
        } catch {}
      }
      setCurrentAccount(acct);
    };
    readAcct();
  }, [deployAccount]);

  // Read chain/network name and decide native symbol
  useEffect(() => {
    const readChain = async () => {
      try {
        const ethereum =
          typeof window !== "undefined" ? (window as any).ethereum : null;
        if (!ethereum || typeof ethereum.request !== "function") return;
        const cidHex: any = await ethereum.request({ method: "eth_chainId" });
        const cidNum =
          typeof cidHex === "string" ? parseInt(cidHex, 16) : Number(cidHex);
        let name = "Unknown";
        let symbol = "ETH";
        switch (cidNum) {
          case 1:
            name = "Ethereum";
            symbol = "ETH";
            break;
          case 137:
            name = "Polygon";
            symbol = "POL"; // show POL per request
            break;
          case 10:
            name = "Optimism";
            symbol = "ETH";
            break;
          case 42161:
            name = "Arbitrum";
            symbol = "ETH";
            break;
          case 11155111:
            name = "Sepolia";
            symbol = "ETH";
            break;
          case 80002:
            name = "Polygon Amoy";
            symbol = "POL";
            break;
          default:
            name = `Chain ${cidNum}`;
            symbol = "ETH";
        }
        setChainName(name);
        setBalanceSymbol(symbol);
      } catch {}
    };
    readChain();
  }, []);

  // Keep chain and balance in sync when user switches network in wallet
  useEffect(() => {
    const ethereum =
      typeof window !== "undefined" ? (window as any).ethereum : null;
    if (!ethereum || typeof ethereum.on !== "function") return;
    const onChainChanged = async (cidHex: string) => {
      try {
        const cidNum = parseInt(cidHex, 16);
        let name = "Unknown";
        let symbol = "ETH";
        switch (cidNum) {
          case 1:
            name = "Ethereum";
            symbol = "ETH";
            break;
          case 137:
            name = "Polygon";
            symbol = "POL";
            break;
          case 10:
            name = "Optimism";
            symbol = "ETH";
            break;
          case 42161:
            name = "Arbitrum";
            symbol = "ETH";
            break;
          case 11155111:
            name = "Sepolia";
            symbol = "ETH";
            break;
          case 80002:
            name = "Polygon Amoy";
            symbol = "POL";
            break;
          default:
            name = `Chain ${cidNum}`;
            symbol = "ETH";
        }
        setChainName(name);
        setBalanceSymbol(symbol);
        // Update balance text for current account on chain change
        if (currentAccount) {
          const provider = new ethers.BrowserProvider(ethereum);
          const wei = await provider.getBalance(currentAccount);
          const fmt = ethers.formatEther(wei);
          const [whole, dec = "0"] = fmt.split(".");
          const text = `${whole}.${dec.slice(0, 4)} ${symbol}`;
          setBalanceText(text);
        }
      } catch {}
    };
    ethereum.on("chainChanged", onChainChanged);
    return () => {
      try {
        if (typeof ethereum.removeListener === "function") {
          ethereum.removeListener("chainChanged", onChainChanged);
        }
      } catch {}
    };
  }, [currentAccount]);

  // Fetch and format native balance for the current account (via ethers)
  useEffect(() => {
    const readBalance = async () => {
      try {
        const acct = currentAccount;
        const ethereum =
          typeof window !== "undefined" ? (window as any).ethereum : null;
        if (!ethereum || !acct) return;
        const browserProvider = new ethers.BrowserProvider(ethereum);
        const wei = await browserProvider.getBalance(acct);
        const fmt = ethers.formatEther(wei);
        const [whole, dec = "0"] = fmt.split(".");
        const text = `${whole}.${dec.slice(0, 4)} ${balanceSymbol}`;
        setBalanceText(text);
      } catch {
        setBalanceText(null);
      }
    };
    readBalance();
  }, [currentAccount, balanceSymbol]);

  // Extra directories created by user (shown even without files)
  const [extraDirs, setExtraDirs] = useState<string[]>([]);

  // Inline create input state
  const [inlineCreate, setInlineCreate] = useState<{
    parentKey: string | null;
    type: "folder" | "file" | null;
    value: string;
  }>({ parentKey: null, type: null, value: "" });

  // Inline rename state
  const [renameItem, setRenameItem] = useState<{
    key: string | null;
    type: "folder" | "file" | null;
    value: string;
  }>({ key: null, type: null, value: "" });

  const fileList: SolFile[] = useMemo(() => {
    const srcFiles = overrideDoc?.files ?? files;
    const srcCode = overrideDoc?.code ?? code;
    const list = (srcFiles ?? []).filter(
      (f) => f && f.name && f.content && f.name.endsWith(".sol")
    );
    if (list.length > 0) return list;
    return [{ name: "[Contract].sol", content: srcCode }];
  }, [overrideDoc, files, code]);

  // Inline diff state for active file selection (moved below fileList to avoid early reference)
  const [diffActiveName, setDiffActiveName] = useState<string>("");
  const diffFileNames = useMemo(() => {
    const names = new Set<string>();
    (Array.isArray(fileList) ? fileList : []).forEach((f: any) =>
      names.add(f.name)
    );
    (Array.isArray(proposedFiles) ? proposedFiles : []).forEach((f: any) =>
      names.add(f.name)
    );
    return Array.from(names);
  }, [fileList, proposedFiles]);
  useEffect(() => {
    if (!diffOpen) return;
    if (!diffActiveName && diffFileNames.length > 0)
      setDiffActiveName(diffFileNames[0]);
  }, [diffOpen, diffFileNames, diffActiveName]);

  // Hydrate selected contract details (including deployed info) on refresh/navigation
  useEffect(() => {
    const loadSelected = async () => {
      try {
        if (!selectedContractId || !walletAddr) return;
        const res = await fetch(`/api/contract/${selectedContractId}`, {
          headers: { "x-wallet-address": walletAddr },
        });
        if (!res.ok) return;
        const data = await res.json();
        const d = data?.contract as ContractDoc | undefined;
        if (!d) return;
        setOverrideDoc((prev) => ({
          _id: d._id,
          question: d.question || prev?.question || prompt || "",
          code: typeof d.code === "string" ? d.code : prev?.code || code || "",
          files: Array.isArray(d.files) ? d.files : prev?.files || files,
          createdAt: d.createdAt || prev?.createdAt,
          updatedAt: d.updatedAt || prev?.updatedAt,
          deployedAddress: d.deployedAddress || prev?.deployedAddress,
          deployedNetwork: d.deployedNetwork || prev?.deployedNetwork,
          deployedOwner: d.deployedOwner || prev?.deployedOwner,
          abi: Array.isArray(d.abi) ? d.abi : prev?.abi,
        }));
      } catch {}
    };
    loadSelected();
  }, [selectedContractId, walletAddr]);

  const saveNow = useCallback(async () => {
    try {
      if (!selectedContractId || !walletAddr) {
        // No save toast; rely on status overlay
        return;
      }
      setIsSaving(true);
      const payload: any =
        fileList && fileList.length > 0
          ? { files: fileList, code: "" }
          : { code: overrideDoc?.code || code || "" };
      const res = await fetch(`/api/contract/${selectedContractId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddr,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        // No save toast; rely on status overlay
        return;
      }
      const updated = data?.contract as ContractDoc;
      if (updated) {
        setOverrideDoc((prev) => {
          const next: ContractDoc = {
            _id: updated._id,
            question: updated.question,
            code: updated.code || "",
            files: updated.files,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt,
            deployedAddress: updated.deployedAddress || prev?.deployedAddress,
            deployedNetwork: updated.deployedNetwork || prev?.deployedNetwork,
            deployedOwner: updated.deployedOwner || prev?.deployedOwner,
          };
          return next;
        });
        // Update cached history list and move updated item to top
        queryClient.setQueryData<ContractDoc[]>(
          ["contract-list", walletAddr || ""],
          (old) => {
            const arr = Array.isArray(old) ? old : [];
            const filtered = arr.filter((x) => x._id !== updated._id);
            return [
              {
                _id: updated._id,
                question: updated.question,
                code: updated.code || "",
                files: updated.files,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt,
              },
              ...filtered,
            ];
          }
        );
        setIsDirty(false);
        // No save toast; rely on status overlay
      }
    } catch (e) {
      console.error(e);
      // No save toast; rely on status overlay
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedContractId,
    walletAddr,
    fileList,
    overrideDoc,
    code,
    queryClient,
  ]);

  // Save files immediately with an explicit snapshot to avoid stale closures
  const saveFilesImmediate = useCallback(
    async (nextFiles: SolFile[]) => {
      try {
        if (!selectedContractId || !walletAddr) return;
        setIsSaving(true);
        const res = await fetch(`/api/contract/${selectedContractId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddr,
          },
          body: JSON.stringify({ files: nextFiles, code: "" }),
        });
        const data = await res.json();
        if (!res.ok) return;
        const updated = data?.contract as ContractDoc;
        if (updated) {
          setOverrideDoc((prev) => ({
            _id: updated._id,
            question: updated.question || prev?.question || prompt || "",
            code: updated.code || prev?.code || code || "",
            files: Array.isArray(updated.files) ? updated.files : nextFiles,
            createdAt: updated.createdAt || prev?.createdAt,
            updatedAt: updated.updatedAt || prev?.updatedAt,
            deployedAddress: updated.deployedAddress || prev?.deployedAddress,
            deployedNetwork: updated.deployedNetwork || prev?.deployedNetwork,
            deployedOwner: updated.deployedOwner || prev?.deployedOwner,
            abi: Array.isArray(updated.abi) ? updated.abi : prev?.abi,
          }));
        }
      } catch {
      } finally {
        try {
          setIsSaving(false);
        } catch {}
      }
    },
    [selectedContractId, walletAddr, prompt, code]
  );

  // Autosave removed; saving occurs explicitly via button

  // No timer cleanup required since autosave is removed

  useEffect(() => {
    // Reset dirty state on selection change
    setIsDirty(false);
  }, [selectedContractId]);

  useEffect(() => {
    const v =
      typeof window !== "undefined"
        ? localStorage.getItem("solidityVersion")
        : null;
    if (v) setSelectedSolVersion(v);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && selectedSolVersion) {
      localStorage.setItem("solidityVersion", selectedSolVersion);
    }
  }, [selectedSolVersion]);

  // Load valid Solidity versions from server, fall back to static list on error
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
        setSelectedSolVersion((prev) => {
          // Ensure the selected version is valid; otherwise pick first
          return arr.includes(prev) ? prev : arr[0];
        });
      } catch {}
    };
    loadVersions();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const addr =
          (typeof window !== "undefined"
            ? localStorage.getItem("walletAddress")
            : null) || "";
        if (!addr) return;
        const resp = await fetch(`/api/contract/${id}`, {
          method: "DELETE",
          headers: { "x-wallet-address": addr },
        });
        if (!resp.ok) return;
        // Update cached history list
        queryClient.setQueryData<ContractDoc[]>(
          ["contract-list", addr || ""],
          (old) => {
            return (old || []).filter((x) => x._id !== id);
          }
        );
        // If deleting currently viewed, navigate accordingly
        const isCurrent = selectedContractId === id;
        const nextHistory = (history || []).filter((x) => x._id !== id);
        if (isCurrent) {
          if (nextHistory.length > 0) {
            router.push(`/sol/${nextHistory[0]._id}`);
          } else {
            router.push(`/`);
          }
        }
      } catch {}
    },
    [history, selectedContractId, router, queryClient]
  );

  const handleCompile = useCallback(async (): Promise<boolean> => {
    try {
      setIsCompiling(true);
      setCompileStatus("idle");
      setCompileMessage(null);
      const current = fileList[activeIndex] || {
        name: "[Contract].sol",
        content: code,
      };
      const res = await fetch("/api/solc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: selectedSolVersion,
          fileName: current.name,
          source: current.content,
          files: fileList,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        setCompiledAbi(null);
        setCompiledBytecode(null);
        setCompiledContractName(null);
        setCompileErrors(Array.isArray(data?.errors) ? data.errors : []);
        const hasMarkers =
          Array.isArray(data?.errors) && data.errors.length > 0;
        if (hasMarkers) {
          applyMarkers(data.errors);
          const first = data.errors[0] || {};
          const line = Number(
            first?.line || first?.loc?.line || first?.loc?.start?.line || 0
          );
          const col = Number(
            first?.column ||
              first?.loc?.column ||
              first?.loc?.start?.column ||
              0
          );
          const baseMsg = String(
            first?.message || data?.error || "Syntax error"
          )
            .replace(/^Parser error\s*:\s*/i, "")
            .trim();
          const msgText =
            line && col
              ? `Syntax error at line ${line}, column ${col}: ${baseMsg}`
              : `Syntax error: ${baseMsg}`;
          setCompileStatus("error");
          setCompileMessage(msgText);
          toast.error(msgText, {
            description: current.name,
          });
        } else {
          let msg =
            data?.error ||
            (Array.isArray(data?.output?.errors)
              ? data.output.errors
                  .map((e: any) => e?.formattedMessage || e?.message)
                  .join("\n")
              : "Compilation failed");
          if (/incompatible\s+with\s+pragma/i.test(String(msg))) {
            msg = `Version incompatible with pragma. ${String(msg)}`;
          }
          setCompileStatus("error");
          setCompileMessage(String(msg || "Compilation failed"));
          setCompileErrors(
            Array.isArray(data?.output?.errors) ? data.output.errors : []
          );
          clearMarkers();
          toast.error("Compilation failed", {
            description: String(msg || selectedSolVersion),
          });
        }
        return false;
      }

      const warnCount = Array.isArray(data?.warnings)
        ? data.warnings.length
        : 0;
      setCompileStatus("success");
      setCompileMessage(
        warnCount > 0
          ? `${selectedSolVersion} · ${warnCount} warning${
              warnCount === 1 ? "" : "s"
            }`
          : selectedSolVersion
      );
      setCompileErrors([]);
      clearMarkers();
      // Store compiled artifacts (if provided)
      try {
        const art = data?.artifact || {};
        const abi = Array.isArray(art?.abi) ? art.abi : null;
        const bytecode =
          typeof art?.bytecode === "string" ? art.bytecode : null;
        const name =
          typeof art?.contractName === "string" ? art.contractName : null;
        setCompiledAbi(abi);
        setCompiledBytecode(bytecode);
        setCompiledContractName(name);
      } catch {}
      toast.success("Compiled successfully", {
        description:
          warnCount > 0
            ? `${selectedSolVersion} · ${warnCount} warning${
                warnCount === 1 ? "" : "s"
              }`
            : selectedSolVersion,
      });
      return true;
    } catch (e: any) {
      const raw = String(e?.message || e || "Compilation error");
      const sanitized = /getText/i.test(raw)
        ? "Editor error during compile. Please retry."
        : raw;
      setCompileStatus("error");
      setCompileMessage(sanitized);
      setCompileErrors([]);
      setCompiledAbi(null);
      setCompiledBytecode(null);
      setCompiledContractName(null);
      toast.error(sanitized, {
        description: selectedSolVersion,
      });
      return false;
    } finally {
      setIsCompiling(false);
    }
  }, [
    fileList,
    activeIndex,
    code,
    selectedSolVersion,
    applyMarkers,
    clearMarkers,
  ]);

  // Save & Compile: persist changes then compile (compile continues even if save fails)
  const handleSaveAndCompile = useCallback(async () => {
    try {
      await saveNow();
    } catch {}
    await handleCompile();
  }, [saveNow, handleCompile]);

  const handleDownload = useCallback(() => {
    try {
      const current = fileList[activeIndex] || {
        name: "[Contract].sol",
        content: code,
      };
      const fileName = current.name?.endsWith(".sol")
        ? current.name
        : `${current.name || "Contract"}.sol`;
      const blob = new Blob([current.content || ""], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Failed to download .sol file");
    }
  }, [fileList, activeIndex, code]);

  const handleDownloadAbi = useCallback(() => {
    try {
      const abiSrc = Array.isArray(overrideDoc?.abi)
        ? overrideDoc!.abi!
        : Array.isArray(compiledAbi)
        ? compiledAbi!
        : null;
      if (!abiSrc || !Array.isArray(abiSrc)) {
        toast.error("ABI not available for download");
        return;
      }
      const current = fileList[activeIndex] || { name: "[Contract].sol" };
      const addr =
        typeof overrideDoc?.deployedAddress === "string" &&
        overrideDoc.deployedAddress
          ? overrideDoc.deployedAddress
          : "";
      const baseName = addr
        ? `abi-${addr.toLowerCase()}`
        : (current.name?.endsWith(".sol")
            ? current.name.replace(/\.sol$/i, "")
            : current.name || "Contract") + ".abi";
      const blob = new Blob([JSON.stringify(abiSrc, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${baseName}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast.error("Failed to download ABI");
    }
  }, [overrideDoc?.abi, compiledAbi, fileList, activeIndex]);

  const handleCopy = useCallback(async () => {
    try {
      const current = fileList[activeIndex] || {
        name: "[Contract].sol",
        content: code,
      };
      const text = current.content || "";
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Code copied");
    } catch (e) {
      console.error(e);
      toast.error("Failed to copy code");
    }
  }, [fileList, activeIndex, code]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const addr = localStorage.getItem("walletAddress") || "";
      setDeployAccount(addr);
    }
  }, [overrideDoc]);

  // Detect constructor params (callable on demand)
  const detectCtorParams = useCallback(async () => {
    const f = fileList[activeIndex];
    if (!f || !f.content) return [] as Array<{ type: string; name?: string }>;
    try {
      const res = await fetch("/api/solc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: selectedSolVersion,
          fileName: f.name,
          source: f.content,
        }),
      });
      const data = await res.json();
      const arr = Array.isArray(data?.ctorParams) ? data.ctorParams : [];
      setConstructorParams(
        arr.map((p: any) => ({
          type: String(p?.type || ""),
          name: p?.name || undefined,
          value: "",
        }))
      );
      return arr;
    } catch {
      return [] as Array<{ type: string; name?: string }>;
    }
  }, [fileList, activeIndex, selectedSolVersion]);

  // Populate constructor params directly from ABI (fast, no recompile)
  const populateCtorFromAbi = useCallback(() => {
    try {
      const abiArr = Array.isArray(overrideDoc?.abi)
        ? (overrideDoc!.abi as any[])
        : Array.isArray(compiledAbi)
        ? (compiledAbi as any[])
        : [];
      const ctor = (abiArr || []).find((it: any) => it?.type === "constructor");
      const inputs = Array.isArray(ctor?.inputs) ? ctor.inputs : [];
      setConstructorParams(
        inputs.map((p: any) => ({
          type: String(p?.type || ""),
          name: p?.name || undefined,
          value: "",
        }))
      );
    } catch {}
  }, [overrideDoc?.abi, compiledAbi]);

  const handleDeployClick = useCallback(async () => {
    // If already compiled, open deploy immediately and hydrate ctor from ABI
    const hasCompiled =
      compileStatus === "success" && !!compiledAbi && !!compiledBytecode;
    if (hasCompiled) {
      populateCtorFromAbi();
      setFunctionsOpen(false);
      setDeployOpen(true);
      return;
    }
    // Otherwise, compile once, then open deploy
    toast.info("Compiling…", { description: selectedSolVersion });
    const ok = await handleCompile();
    if (!ok) {
      toast.error("Compilation failed. Please select a compatible version.");
      return;
    }
    // After first compile, populate constructor params quickly
    populateCtorFromAbi();
    setFunctionsOpen(false);
    setDeployOpen(true);
  }, [
    compileStatus,
    compiledAbi,
    compiledBytecode,
    populateCtorFromAbi,
    handleCompile,
    selectedSolVersion,
  ]);

  const handleConfirmDeploy = useCallback(async () => {
    try {
      setIsDeploying(true);
      const ethereum =
        typeof window !== "undefined" ? (window as any).ethereum : null;
      if (!ethereum || typeof ethereum.request !== "function") {
        toast.error("Wallet not found", {
          description: "Install MetaMask or connect your wallet.",
        });
        return;
      }
      const provider = new ethers.BrowserProvider(ethereum);
      const signer = await provider.getSigner();
      const signerAddr = await signer.getAddress();
      const acct = (deployAccount?.trim() || signerAddr).toLowerCase();
      if (signerAddr.toLowerCase() !== acct) {
        toast.warning("Account mismatch", {
          description: "Activate the selected account in MetaMask.",
        });
      }

      // Ensure artifacts
      if (!compiledAbi || !compiledBytecode) {
        const ok = await handleCompile();
        if (!ok || !compiledAbi || !compiledBytecode) {
          toast.error("Compilation error", {
            description: "Please compile successfully first.",
          });
          return;
        }
      }

      // Prepare constructor args
      const args: any[] = [];
      for (const p of constructorParams) {
        const t = String(p.type || "").toLowerCase();
        const v = (p.value ?? "").trim();
        if (t.startsWith("uint") || t.startsWith("int")) {
          if (!v) args.push(0);
          else args.push(BigInt(v));
        } else if (t === "address") {
          args.push(v);
        } else if (t === "bool") {
          args.push(/^true$/i.test(v));
        } else if (t.startsWith("bytes") && t !== "bytes") {
          args.push(v);
        } else if (t === "string" || t === "bytes") {
          args.push(v);
        } else if (/\[\s*\]$/.test(t)) {
          try {
            const arr = JSON.parse(v);
            args.push(arr);
          } catch {
            args.push([]);
          }
        } else {
          args.push(v);
        }
      }

      // Value and gas options
      let txOpts: any = {};
      const valNum = String(value || "0").trim();
      if (valNum && Number(valNum) > 0) {
        const unit =
          valueUnit === "ether"
            ? "ether"
            : valueUnit === "gwei"
            ? "gwei"
            : "wei";
        try {
          txOpts.value = ethers.parseUnits(valNum, unit as any);
        } catch {
          txOpts.value = ethers.parseUnits("0", "wei");
        }
      }
      if (customGas && gasLimit && Number(gasLimit) > 0) {
        txOpts.gasLimit = BigInt(gasLimit);
      }

      // Deploy (ensure bytecode has 0x prefix)
      const bytecodeHex = (compiledBytecode || "").startsWith("0x")
        ? (compiledBytecode as string)
        : "0x" + String(compiledBytecode || "");
      const factory = new ethers.ContractFactory(
        compiledAbi as any,
        bytecodeHex,
        signer
      );
      const contract = await factory.deploy(...args, txOpts);
      const deployment = contract.deploymentTransaction();
      if (deployment) {
        await deployment.wait();
      }
      const addr = await contract.getAddress();
      toast.success("Contract deployed", { description: addr });
      // Persist deployed info to backend
      try {
        if (selectedContractId && walletAddr) {
          const res2 = await fetch(`/api/contract/${selectedContractId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-wallet-address": walletAddr,
            },
            body: JSON.stringify({
              deployedAddress: addr,
              deployedNetwork: chainName || "Unknown",
              deployedOwner: (
                currentAccount || (await signer.getAddress())
              )?.toLowerCase(),
              abi: compiledAbi,
            }),
          });
          const data2 = await res2.json();
          if (res2.ok && data2?.contract) {
            const u = data2.contract as ContractDoc;
            setOverrideDoc((prev) => ({
              _id: u._id,
              question: u.question || prev?.question || "",
              code: u.code || prev?.code || "",
              files: u.files || prev?.files,
              createdAt: u.createdAt || prev?.createdAt,
              updatedAt: u.updatedAt || prev?.updatedAt,
              deployedAddress: u.deployedAddress,
              deployedNetwork: u.deployedNetwork,
              deployedOwner: u.deployedOwner,
              abi: Array.isArray(u.abi) ? u.abi : prev?.abi,
            }));
          }
        }
      } catch {}
      setDeployOpen(false);
    } catch (e: any) {
      const msg = String(
        e?.info?.error?.message || e?.message || e || "Deployment error"
      );
      toast.error("Deployment failed", { description: msg });
    } finally {
      setIsDeploying(false);
    }
  }, [
    deployAccount,
    customGas,
    gasLimit,
    value,
    valueUnit,
    constructorParams,
    compiledAbi,
    compiledBytecode,
    handleCompile,
  ]);

  // Auto-detect constructor params from code when deploy panel opens or file/version changes
  useEffect(() => {
    const detectCtor = async () => {
      if (!deployOpen) return;
      const f = fileList[activeIndex];
      if (!f || !f.content) return;
      try {
        const res = await fetch("/api/solc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            version: selectedSolVersion,
            fileName: f.name,
            source: f.content,
          }),
        });
        const data = await res.json();
        const arr = Array.isArray(data?.ctorParams) ? data.ctorParams : [];
        setConstructorParams(
          arr.map((p: any) => ({
            type: String(p?.type || ""),
            name: p?.name || undefined,
            value: "",
          }))
        );
      } catch {}
    };
    detectCtor();
  }, [deployOpen, fileList, activeIndex, selectedSolVersion]);

  // history is fetched and cached by React Query above

  // Preserve selected file across data refreshes; prefer hash when present
  useEffect(() => {
    try {
      const hash =
        typeof window !== "undefined"
          ? decodeURIComponent((window.location.hash || "").slice(1))
          : "";
      if (hash) {
        const idx = (fileList || []).findIndex((f) => f?.name === hash);
        if (idx >= 0 && idx !== activeIndex) {
          setActiveIndex(idx);
          return;
        }
      }
      // Ensure index stays in-bounds if files change
      if (activeIndex < 0 || activeIndex >= (fileList?.length || 0)) {
        setActiveIndex(0);
      }
    } catch {}
  }, [overrideDoc, fileList, activeIndex]);

  // Sync URL hash to currently selected file for persistence on refresh
  useEffect(() => {
    try {
      const f = fileList?.[activeIndex];
      if (!f?.name) return;
      if (typeof window !== "undefined") {
        const hash = encodeURIComponent(f.name);
        if (window.location.hash !== `#${hash}`) {
          window.location.hash = hash;
        }
      }
    } catch {}
  }, [activeIndex, fileList, router, pathname]);

  // Update active file when URL hash changes (back/forward or manual edit)
  useEffect(() => {
    const onHashChange = () => {
      try {
        const hash =
          typeof window !== "undefined"
            ? decodeURIComponent((window.location.hash || "").slice(1))
            : "";
        if (!hash) return;
        const idx = (fileList || []).findIndex((f) => f?.name === hash);
        if (idx >= 0) setActiveIndex(idx);
      } catch {}
    };
    if (typeof window !== "undefined") {
      window.addEventListener("hashchange", onHashChange);
    }
    return () => {
      try {
        if (typeof window !== "undefined") {
          window.removeEventListener("hashchange", onHashChange);
        }
      } catch {}
    };
  }, [fileList]);

  type RcNode = {
    key: string;
    title: any;
    children?: RcNode[];
    isLeaf?: boolean;
    selectable?: boolean;
  };

  const {
    treeData,
    keyIndexMap,
    dirKeys,
    topLevelDirKeys,
    dirTitles,
    dirPaths,
  } = useMemo(() => {
    const root: RcNode = { key: "root", title: "files", children: [] };
    const dirMap: Record<string, RcNode> = { "": root };
    const map: Record<string, number> = {};
    const dirKeys: string[] = [];
    const topLevelDirKeys: string[] = [];
    const dirTitles: Record<string, string> = {};
    const dirPaths: Record<string, string> = {};
    (fileList || []).forEach((f, idx) => {
      const parts = (f.name || "")
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean);
      let parentPath = "";
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLeaf = i === parts.length - 1;
        const currentPath = parentPath ? `${parentPath}/${part}` : part;
        const parentNode = dirMap[parentPath] || root;
        if (isLeaf) {
          const leafKey = `leaf-${idx}`;
          parentNode.children = parentNode.children || [];
          parentNode.children.push({
            key: leafKey,
            title: part,
            isLeaf: true,
            selectable: true,
          });
          map[leafKey] = idx;
        } else {
          if (!dirMap[currentPath]) {
            const dirKey = `dir-${currentPath}`;
            const node: RcNode = {
              key: dirKey,
              title: part,
              children: [],
              // Make folders selectable so we can toggle expand/collapse on label click
              selectable: true,
            };
            parentNode.children = parentNode.children || [];
            parentNode.children.push(node);
            dirMap[currentPath] = node;
            if (!dirKeys.includes(dirKey)) dirKeys.push(dirKey);
            dirTitles[dirKey] = part;
            dirPaths[dirKey] = currentPath;
            // If parent is root, this is a top-level directory
            if (parentNode.key === "root") {
              if (!topLevelDirKeys.includes(dirKey))
                topLevelDirKeys.push(dirKey);
            }
          }
        }
        parentPath = currentPath;
      }
    });

    // Ensure extra directories are shown even if empty
    (extraDirs || []).forEach((path) => {
      const parts = String(path || "")
        .replace(/^\/+/, "")
        .split("/")
        .filter(Boolean);
      let parentPath = "";
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const currentPath = parentPath ? `${parentPath}/${part}` : part;
        const parentNode = dirMap[parentPath] || root;
        if (!dirMap[currentPath]) {
          const dirKey = `dir-${currentPath}`;
          const node: RcNode = {
            key: dirKey,
            title: part,
            children: [],
            selectable: true,
          };
          parentNode.children = parentNode.children || [];
          parentNode.children.push(node);
          dirMap[currentPath] = node;
          if (!dirKeys.includes(dirKey)) dirKeys.push(dirKey);
          dirTitles[dirKey] = part;
          dirPaths[dirKey] = currentPath;
          if (parentNode.key === "root") {
            if (!topLevelDirKeys.includes(dirKey)) topLevelDirKeys.push(dirKey);
          }
        }
        parentPath = currentPath;
      }
    });
    // Sort children at each level: directories first, then files, alphabetically
    const collator = new Intl.Collator(undefined, {
      numeric: true,
      sensitivity: "base",
    });
    const sortChildren = (children?: RcNode[]) => {
      if (!children || children.length === 0) return;
      children.sort((a, b) => {
        const aIsDir = !!a.children && !a.isLeaf;
        const bIsDir = !!b.children && !b.isLeaf;
        if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
        const aTitle = String(a.title ?? "");
        const bTitle = String(b.title ?? "");
        return collator.compare(aTitle, bTitle);
      });
    };
    const sortDeep = (node: RcNode) => {
      sortChildren(node.children);
      (node.children || []).forEach(sortDeep);
    };
    sortDeep(root);
    return {
      treeData: root.children || [],
      keyIndexMap: map,
      dirKeys,
      topLevelDirKeys,
      dirTitles,
      dirPaths,
    };
  }, [fileList, extraDirs]);

  // Expanded folder keys (controlled)
  const [expandedDirKeys, setExpandedDirKeys] = useState<string[]>([]);
  useEffect(() => {
    // Expand only top-level folders except '@openzeppelin'
    const initial = (topLevelDirKeys || []).filter(
      (k) => dirTitles[k] !== "@openzeppelin"
    );
    setExpandedDirKeys(initial);
  }, [topLevelDirKeys, dirTitles]);

  // Register Solidity language and theme once for Monaco
  const setupSolidityMonaco = useCallback((monaco: any) => {
    try {
      const w: any = typeof window !== "undefined" ? window : {};
      if (w.__solidityMonacoSetup) return;
      w.__solidityMonacoSetup = true;
      monaco.languages.register({ id: "solidity" });
      monaco.languages.setMonarchTokensProvider("solidity", {
        defaultToken: "",
        tokenPostfix: ".sol",
        keywords: [
          "pragma",
          "solidity",
          "contract",
          "library",
          "interface",
          "struct",
          "enum",
          "function",
          "returns",
          "return",
          "event",
          "error",
          "modifier",
          "calldata",
          "memory",
          "storage",
          "public",
          "private",
          "external",
          "internal",
          "payable",
          "pure",
          "view",
          "virtual",
          "override",
          "immutable",
          "constant",
          "using",
          "for",
          "if",
          "else",
          "while",
          "do",
          "emit",
          "new",
          "mapping",
          "delete",
          "require",
          "revert",
          "assembly",
          "this",
          "super",
        ],
        typeKeywords: [
          "address",
          "bool",
          "string",
          "bytes",
          "uint",
          "int",
          "bytes1",
          "bytes2",
          "bytes3",
          "bytes4",
          "bytes5",
          "bytes6",
          "bytes7",
          "bytes8",
          "bytes9",
          "bytes10",
          "bytes11",
          "bytes12",
          "bytes13",
          "bytes14",
          "bytes15",
          "bytes16",
          "bytes17",
          "bytes18",
          "bytes19",
          "bytes20",
          "bytes21",
          "bytes22",
          "bytes23",
          "bytes24",
          "bytes25",
          "bytes26",
          "bytes27",
          "bytes28",
          "bytes29",
          "bytes30",
          "bytes31",
          "bytes32",
          "uint8",
          "uint16",
          "uint24",
          "uint32",
          "uint40",
          "uint48",
          "uint56",
          "uint64",
          "uint72",
          "uint80",
          "uint88",
          "uint96",
          "uint104",
          "uint112",
          "uint120",
          "uint128",
          "uint136",
          "uint144",
          "uint152",
          "uint160",
          "uint168",
          "uint176",
          "uint184",
          "uint192",
          "uint200",
          "uint208",
          "uint216",
          "uint224",
          "uint232",
          "uint240",
          "uint248",
          "uint256",
          "int8",
          "int16",
          "int24",
          "int32",
          "int40",
          "int48",
          "int56",
          "int64",
          "int72",
          "int80",
          "int88",
          "int96",
          "int104",
          "int112",
          "int120",
          "int128",
          "int136",
          "int144",
          "int152",
          "int160",
          "int168",
          "int176",
          "int184",
          "int192",
          "int200",
          "int208",
          "int216",
          "int224",
          "int232",
          "int240",
          "int248",
          "int256",
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
          "<=",
          ">=",
          "!=",
          "&&",
          "||",
          "++",
          "--",
          "+",
          "-",
          "*",
          "/",
          "&",
          "|",
          "^",
          "%",
          "<<",
          ">>",
          ">>>",
        ],
        symbols: /[=><!~?:&|+\-*/^%]+/,
        escapes: /\\(?:[abfnrtv\\\"'|x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{4})/,
        tokenizer: {
          root: [
            [/\/\/.*$/, "comment"],
            [/\/*/, "comment", "@comment"],
            [
              /[a-zA-Z_$][\w$]*/,
              {
                cases: {
                  "@keywords": "keyword",
                  "@typeKeywords": "type",
                  "@default": "identifier",
                },
              },
            ],
            { include: "@whitespace" },
            [/[{()}\[\]]/, "@brackets"],
            [
              /(@symbols)/,
              { cases: { "@operators": "operator", "@default": "" } },
            ],
            [/0[xX][0-9a-fA-F]+/, "number.hex"],
            [/\d+/, "number"],
            [/"([^"\\]|\\.)*$/, "string.invalid"],
            [/"/, "string", "@string"],
            [/\'([^'\\]|\\.)*$/, "string.invalid"],
            [/\'/, "string", "@string"],
          ],
          comment: [
            [/[^\/*]+/, "comment"],
            [/\*\//, "comment", "@pop"],
            [/[/\*]/, "comment"],
          ],
          whitespace: [[/\s+/, "white"]],
          string: [
            [/[^\\"]+/, "string"],
            [/\\./, "string.escape"],
            [/\"/, "string", "@pop"],
          ],
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
      monaco.editor.defineTheme("solidity-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "keyword", foreground: "c792ea" },
          { token: "type", foreground: "82AAFF" },
          { token: "number", foreground: "F78C6C" },
          { token: "string", foreground: "ECC48D" },
          { token: "comment", foreground: "637777" },
        ],
        colors: {},
      });
    } catch {}
  }, []);

  const skeletonWidths = useMemo(() => {
    const base = 35; // minimum width percent
    const range = 40; // additional random percent
    const arr: number[] = [];
    const cryptoObj: Crypto | undefined =
      typeof window !== "undefined"
        ? (window.crypto as Crypto | undefined)
        : undefined;
    let bytes: Uint32Array | null = null;
    if (cryptoObj?.getRandomValues) {
      bytes = new Uint32Array(skeletonLines);
      cryptoObj.getRandomValues(bytes);
    }
    for (let i = 0; i < skeletonLines; i++) {
      const r = bytes ? bytes[i] / 0xffffffff : Math.random();
      arr.push(Math.round(base + r * range));
    }
    return arr;
  }, [skeletonLines]);
  return (
    <div
      className="border mt-12 m-6 border-foreground/20 rounded-xl overflow-hidden h-full w-full"
      style={{ height: height ?? "100%", width: "calc(100svw - 48px)" }}
    >
      <PanelGroup direction="horizontal" className="w-full h-full">
        {showHistory && (
          <>
            <Panel minSize={10} defaultSize={15} className="h-full">
              <div className="h-full bg-[#111] border-r border-foreground/10">
                <div
                  className="px-3 py-2 flex items-center justify-between bg-[#fff1] mb-3 font-mono text-xs text-foreground/60  uppercase truncate"
                  title={prompt ?? "contracts"}
                >
                  history
                  <button
                    className={`underline hover:opacity-70 cursor-pointer text-white rounded-md font-mono text-xs`}
                    onClick={() => {
                      setSelectedContractId(null);
                      setOverrideDoc(null);
                      router.push("/");
                    }}
                    title={"Start a new chat"}
                  >
                    {"Let's Build"}
                  </button>
                </div>
                {historyLoading ? (
                  <div className={styles.historySkeleton}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className={styles.historySkeletonItem} />
                    ))}
                  </div>
                ) : (
                  <ul
                    className={`${styles.scrollArea} px-2 space-y-1 overflow-auto h-[calc(100%-32px)]`}
                  >
                    {/* Pinned first item: Let's Start */}
                    <li className="group relative flex items-center gap-2"></li>
                    {history.map((h) => (
                      <li
                        key={h._id}
                        className="group relative flex items-center gap-2"
                      >
                        <Link
                          href={`/sol/${h._id}`}
                          className={`flex-1 text-left px-3 pr-9 py-2 rounded-md font-mono text-xs ${
                            selectedContractId === h._id
                              ? "bg-foreground/10 text-foreground"
                              : "text-foreground/70 hover:bg-foreground/15"
                          }`}
                          onClick={() => {
                            setSelectedContractId(h._id);
                            setOverrideDoc(h);
                          }}
                          title={h.question}
                        >
                          {h.deployedAddress ? (
                            <span className="mr-1 px-[3px] py-[1px] rounded-[4px] border border-emerald-400/40 text-emerald-400 bg-emerald-400/10 text-[10px] align-middle">
                              Deployed
                            </span>
                          ) : null}
                          {(() => {
                            const words = (h.question || "")
                              .trim()
                              .split(/\s+/);
                            const preview = words.slice(0, 6).join(" ");
                            const tooLong = words.length > 6;
                            return `${preview}${tooLong ? "..." : ""}`;
                          })()}
                        </Link>
                        <button
                          className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 px-1 py-1 rounded-md font-mono text-[10px] text-red-400 hover:bg-red-400/10 transition-colors"
                          onClick={() => handleDelete(h._id)}
                          aria-label="Delete"
                        >
                          <GoTrash className="inline-block w-[14px] h-[14px]" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
            <PanelResizeHandle className={styles.resizeHandleCol}>
              <div className={styles.resizeBarCol} />
            </PanelResizeHandle>
          </>
        )}
        <Panel minSize={10} defaultSize={20} className="h-full">
          <div
            className={`${styles.scrollArea} h-full overflow-auto border-r border-foreground/10 bg-[#0f0f0f]`}
          >
            <div
              className={`${styles.scrollArea} mb-4 ${styles.rcTree} px-1 pt-1 overflow-auto text-xs leading-4 font-mono text-foreground/80`}
            >
              <Tree
                treeData={treeData as any}
                // do not auto-expand nodes by default
                expandedKeys={expandedDirKeys as any}
                showIcon
                selectable
                selectedKeys={
                  activeIndex >= 0 && activeIndex < (fileList?.length || 0)
                    ? ([`leaf-${activeIndex}`] as any)
                    : ([] as any)
                }
                onExpand={(keys: any) => {
                  // Sync expanded folders when user clicks the expand toggler
                  const arr = Array.isArray(keys) ? (keys as string[]) : [];
                  setExpandedDirKeys(arr);
                }}
                onSelect={(keys) => {
                  const k = Array.isArray(keys) ? keys[0] : (keys as any);
                  if (!k) return;
                  // Toggle folder expand/collapse when clicking folder label
                  if (typeof k === "string" && k.startsWith("dir-")) {
                    setExpandedDirKeys((prev) => {
                      const has = prev.includes(k as string);
                      return has
                        ? prev.filter((x) => x !== k)
                        : [...prev, k as string];
                    });
                    return; // do not change active file on folder click
                  }
                  const idx = keyIndexMap[k as string];
                  if (typeof idx === "number") {
                    setActiveIndex(idx);
                    try {
                      const name = fileList?.[idx]?.name;
                      if (name) {
                        if (typeof window !== "undefined") {
                          window.location.hash = encodeURIComponent(name);
                        }
                      }
                    } catch {}
                  }
                }}
                titleRender={(nodeData: any) => {
                  const isLeaf = !!nodeData?.isLeaf;
                  const key = String(nodeData?.key || "");
                  // Folder title render
                  if (
                    !isLeaf &&
                    typeof key === "string" &&
                    key.startsWith("dir-")
                  ) {
                    const isCreatingHere = inlineCreate.parentKey === key;
                    const isRenamingHere =
                      renameItem.key === key && renameItem.type === "folder";
                    const currentTitle = String(nodeData?.title ?? "");
                    return (
                      <div className="group inline-flex items-center gap-1">
                        {!isRenamingHere ? (
                          <span>{currentTitle}</span>
                        ) : (
                          <input
                            value={renameItem.value}
                            onChange={(e) =>
                              setRenameItem((prev) => ({
                                ...prev,
                                value: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                const basePath = dirPaths[key] || "";
                                const parentPath = basePath
                                  .split("/")
                                  .slice(0, -1)
                                  .join("/");
                                const newLeaf = renameItem.value.trim();
                                if (!newLeaf) return;
                                const newPath = parentPath
                                  ? `${parentPath}/${newLeaf}`
                                  : newLeaf;
                                // Update extraDirs (including nested ones)
                                setExtraDirs((prev) => {
                                  const updated = (prev || []).map((d) =>
                                    d === basePath
                                      ? newPath
                                      : d.startsWith(basePath + "/")
                                      ? newPath + d.slice(basePath.length)
                                      : d
                                  );
                                  // Ensure uniqueness
                                  return Array.from(new Set(updated));
                                });
                                // Update files path prefixes
                                setOverrideDoc((prev) => {
                                  const prevFiles =
                                    prev?.files ?? fileList ?? [];
                                  const nextFiles = prevFiles.map((f) => {
                                    if (
                                      (f.name || "").startsWith(basePath + "/")
                                    ) {
                                      const suffix = f.name.slice(
                                        basePath.length
                                      );
                                      return { ...f, name: newPath + suffix };
                                    }
                                    return f;
                                  });
                                  // Persist renamed folder paths immediately
                                  saveFilesImmediate(nextFiles);
                                  const nextDoc: ContractDoc = {
                                    _id: prev?._id ?? "",
                                    question:
                                      prev?.question ??
                                      overrideDoc?.question ??
                                      prompt ??
                                      "",
                                    code: prev?.code ?? code ?? "",
                                    files: nextFiles,
                                    createdAt: prev?.createdAt,
                                    updatedAt: prev?.updatedAt,
                                    deployedAddress: prev?.deployedAddress,
                                    deployedNetwork: prev?.deployedNetwork,
                                    deployedOwner: prev?.deployedOwner,
                                    abi: prev?.abi,
                                  };
                                  return nextDoc;
                                });
                                // Keep expanded state on the renamed folder
                                setExpandedDirKeys((prev) =>
                                  prev.map((k) =>
                                    k === key ? `dir-${newPath}` : k
                                  )
                                );
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                              } else if (e.key === "Escape") {
                                e.stopPropagation();
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              e.stopPropagation();
                              // Commit folder rename on blur if valid
                              const basePath = dirPaths[key] || "";
                              const parentPath = basePath
                                .split("/")
                                .slice(0, -1)
                                .join("/");
                              const newLeaf = renameItem.value.trim();
                              if (!newLeaf) {
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                                return;
                              }
                              const newPath = parentPath
                                ? `${parentPath}/${newLeaf}`
                                : newLeaf;
                              setExtraDirs((prev) => {
                                const updated = (prev || []).map((d) =>
                                  d === basePath
                                    ? newPath
                                    : d.startsWith(basePath + "/")
                                    ? newPath + d.slice(basePath.length)
                                    : d
                                );
                                return Array.from(new Set(updated));
                              });
                              setOverrideDoc((prev) => {
                                const prevFiles = prev?.files ?? fileList ?? [];
                                const nextFiles = prevFiles.map((f) => {
                                  if (
                                    (f.name || "").startsWith(basePath + "/")
                                  ) {
                                    const suffix = f.name.slice(
                                      basePath.length
                                    );
                                    return { ...f, name: newPath + suffix };
                                  }
                                  return f;
                                });
                                // Persist immediately
                                saveFilesImmediate(nextFiles);
                                const nextDoc: ContractDoc = {
                                  _id: prev?._id ?? "",
                                  question:
                                    prev?.question ??
                                    overrideDoc?.question ??
                                    prompt ??
                                    "",
                                  code: prev?.code ?? code ?? "",
                                  files: nextFiles,
                                  createdAt: prev?.createdAt,
                                  updatedAt: prev?.updatedAt,
                                  deployedAddress: prev?.deployedAddress,
                                  deployedNetwork: prev?.deployedNetwork,
                                  deployedOwner: prev?.deployedOwner,
                                  abi: prev?.abi,
                                };
                                return nextDoc;
                              });
                              setExpandedDirKeys((prev) =>
                                prev.map((k) =>
                                  k === key ? `dir-${newPath}` : k
                                )
                              );
                              setRenameItem({
                                key: null,
                                type: null,
                                value: "",
                              });
                            }}
                            className="ml-2 bg-transparent border-none outline-none focus:outline-none px-1 text-white placeholder-foreground/40"
                            placeholder="Folder name"
                            autoFocus
                          />
                        )}
                        {isCreatingHere ? (
                          <span className="inline-flex ml-2">
                            <input
                              value={inlineCreate.value}
                              onChange={(e) =>
                                setInlineCreate((prev) => ({
                                  ...prev,
                                  value: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.stopPropagation();
                                  const name = inlineCreate.value.trim();
                                  if (!name) return;
                                  const basePath = dirPaths[key] || "";
                                  if (inlineCreate.type === "folder") {
                                    const newDir = basePath
                                      ? `${basePath}/${name}`
                                      : name;
                                    setExtraDirs((prev) =>
                                      prev.includes(newDir)
                                        ? prev
                                        : [...prev, newDir]
                                    );
                                    // Persist folder creation via hidden placeholder file
                                    setOverrideDoc((prev) => {
                                      const prevFiles =
                                        prev?.files ?? fileList ?? [];
                                      const placeholder = {
                                        name: `${newDir}/.keep`,
                                        content: "// folder placeholder",
                                      };
                                      const nextFiles = prevFiles.some(
                                        (f) => f.name === placeholder.name
                                      )
                                        ? prevFiles
                                        : [...prevFiles, placeholder];
                                      // Persist immediately
                                      saveFilesImmediate(nextFiles);
                                      const nextDoc: ContractDoc = {
                                        _id: prev?._id ?? "",
                                        question:
                                          prev?.question ??
                                          overrideDoc?.question ??
                                          prompt ??
                                          "",
                                        code: prev?.code ?? code ?? "",
                                        files: nextFiles,
                                        createdAt: prev?.createdAt,
                                        updatedAt: prev?.updatedAt,
                                        deployedAddress: prev?.deployedAddress,
                                        deployedNetwork: prev?.deployedNetwork,
                                        deployedOwner: prev?.deployedOwner,
                                        abi: prev?.abi,
                                      };
                                      return nextDoc;
                                    });
                                  } else if (inlineCreate.type === "file") {
                                    const targetPath = basePath
                                      ? `${basePath}/${name}`
                                      : name;
                                    const finalName = targetPath.endsWith(
                                      ".sol"
                                    )
                                      ? targetPath
                                      : `${targetPath}.sol`;
                                    setOverrideDoc((prev) => {
                                      const prevFiles =
                                        prev?.files ?? fileList ?? [];
                                      const exists = prevFiles.some(
                                        (f) => f.name === finalName
                                      );
                                      const nextFiles = exists
                                        ? prevFiles
                                        : [
                                            ...prevFiles,
                                            {
                                              name: finalName,
                                              content:
                                                "pragma solidity ^0.8.20;\n// new file",
                                            },
                                          ];
                                      if (!exists)
                                        saveFilesImmediate(nextFiles);
                                      const nextDoc: ContractDoc = {
                                        _id: prev?._id ?? "",
                                        question:
                                          prev?.question ??
                                          overrideDoc?.question ??
                                          prompt ??
                                          "",
                                        code: prev?.code ?? code ?? "",
                                        files: nextFiles,
                                        createdAt: prev?.createdAt,
                                        updatedAt: prev?.updatedAt,
                                        deployedAddress: prev?.deployedAddress,
                                        deployedNetwork: prev?.deployedNetwork,
                                        deployedOwner: prev?.deployedOwner,
                                        abi: prev?.abi,
                                      };
                                      return nextDoc;
                                    });
                                  }
                                  setInlineCreate({
                                    parentKey: null,
                                    type: null,
                                    value: "",
                                  });
                                } else if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setInlineCreate({
                                    parentKey: null,
                                    type: null,
                                    value: "",
                                  });
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                e.stopPropagation();
                                const name = inlineCreate.value.trim();
                                if (!name) {
                                  setInlineCreate({
                                    parentKey: null,
                                    type: null,
                                    value: "",
                                  });
                                  return;
                                }
                                const basePath = dirPaths[key] || "";
                                if (inlineCreate.type === "folder") {
                                  const newDir = basePath
                                    ? `${basePath}/${name}`
                                    : name;
                                  setExtraDirs((prev) =>
                                    prev.includes(newDir)
                                      ? prev
                                      : [...prev, newDir]
                                  );
                                  // Persist folder via placeholder
                                  setOverrideDoc((prev) => {
                                    const prevFiles =
                                      prev?.files ?? fileList ?? [];
                                    const placeholder = {
                                      name: `${newDir}/.keep`,
                                      content: "// folder placeholder",
                                    };
                                    const nextFiles = prevFiles.some(
                                      (f) => f.name === placeholder.name
                                    )
                                      ? prevFiles
                                      : [...prevFiles, placeholder];
                                    saveFilesImmediate(nextFiles);
                                    const nextDoc: ContractDoc = {
                                      _id: prev?._id ?? "",
                                      question:
                                        prev?.question ??
                                        overrideDoc?.question ??
                                        prompt ??
                                        "",
                                      code: prev?.code ?? code ?? "",
                                      files: nextFiles,
                                      createdAt: prev?.createdAt,
                                      updatedAt: prev?.updatedAt,
                                      deployedAddress: prev?.deployedAddress,
                                      deployedNetwork: prev?.deployedNetwork,
                                      deployedOwner: prev?.deployedOwner,
                                      abi: prev?.abi,
                                    };
                                    return nextDoc;
                                  });
                                } else if (inlineCreate.type === "file") {
                                  const targetPath = basePath
                                    ? `${basePath}/${name}`
                                    : name;
                                  const finalName = targetPath.endsWith(".sol")
                                    ? targetPath
                                    : `${targetPath}.sol`;
                                  setOverrideDoc((prev) => {
                                    const prevFiles =
                                      prev?.files ?? fileList ?? [];
                                    const exists = prevFiles.some(
                                      (f) => f.name === finalName
                                    );
                                    const nextFiles = exists
                                      ? prevFiles
                                      : [
                                          ...prevFiles,
                                          {
                                            name: finalName,
                                            content:
                                              "pragma solidity ^0.8.20;\n// new file",
                                          },
                                        ];
                                    if (!exists) saveFilesImmediate(nextFiles);
                                    const nextDoc: ContractDoc = {
                                      _id: prev?._id ?? "",
                                      question:
                                        prev?.question ??
                                        overrideDoc?.question ??
                                        prompt ??
                                        "",
                                      code: prev?.code ?? code ?? "",
                                      files: nextFiles,
                                      createdAt: prev?.createdAt,
                                      updatedAt: prev?.updatedAt,
                                      deployedAddress: prev?.deployedAddress,
                                      deployedNetwork: prev?.deployedNetwork,
                                      deployedOwner: prev?.deployedOwner,
                                      abi: prev?.abi,
                                    };
                                    return nextDoc;
                                  });
                                }
                                setInlineCreate({
                                  parentKey: null,
                                  type: null,
                                  value: "",
                                });
                              }}
                              className="bg-transparent border-none outline-none focus:outline-none px-1 text-white placeholder-foreground/40"
                              placeholder={
                                inlineCreate.type === "folder"
                                  ? "Folder name"
                                  : "File name"
                              }
                              autoFocus
                            />
                          </span>
                        ) : (
                          <span className="opacity-0 group-hover:opacity-100 inline-flex gap-1 ml-2 transition-opacity transition-transform duration-200 ease-out -translate-y-1 group-hover:translate-y-0">
                            <button
                              className="w-[20px] h-[20px] p-0 flex items-center justify-center rounded hover:bg-foreground/10 text-foreground/60"
                              aria-label="Add folder"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineCreate({
                                  parentKey: key,
                                  type: "folder",
                                  value: "",
                                });
                                setExpandedDirKeys((prev) =>
                                  prev.includes(key) ? prev : [...prev, key]
                                );
                              }}
                            >
                              <HiOutlineFolderPlus className="inline-block w-[12px] h-[12px]" />
                            </button>
                            <button
                              className="w-[20px] h-[20px] p-0 flex items-center justify-center rounded hover:bg-foreground/10 text-foreground/60"
                              aria-label="Add file"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInlineCreate({
                                  parentKey: key,
                                  type: "file",
                                  value: "",
                                });
                                setExpandedDirKeys((prev) =>
                                  prev.includes(key) ? prev : [...prev, key]
                                );
                              }}
                            >
                              <GoFileCode className="inline-block w-[12px] h-[12px]" />
                            </button>
                            <button
                              className="w-[20px] h-[20px] p-0 flex items-center justify-center rounded hover:bg-foreground/10 text-foreground/60"
                              aria-label="Rename folder"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentTitle = String(
                                  nodeData?.title ?? ""
                                );
                                setRenameItem({
                                  key,
                                  type: "folder",
                                  value: currentTitle,
                                });
                              }}
                            >
                              <HiOutlinePencil className="inline-block w-[12px] h-[12px]" />
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  }
                  // File title render
                  if (
                    isLeaf &&
                    typeof key === "string" &&
                    key.startsWith("leaf-")
                  ) {
                    const idx = keyIndexMap[key];
                    const currentName =
                      idx != null && idx >= 0 ? fileList[idx]?.name || "" : "";
                    const baseTitle = String(nodeData?.title ?? "");
                    const isRenamingHere =
                      renameItem.key === key && renameItem.type === "file";
                    return (
                      <div className="group inline-flex items-center gap-1">
                        {!isRenamingHere ? (
                          <span>{baseTitle}</span>
                        ) : (
                          <input
                            value={renameItem.value}
                            onChange={(e) =>
                              setRenameItem((prev) => ({
                                ...prev,
                                value: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.stopPropagation();
                                const typed = renameItem.value.trim();
                                if (!typed || typeof idx !== "number") return;
                                const oldFull = currentName;
                                const parts = oldFull.split("/");
                                const oldBase = parts[parts.length - 1];
                                const parent = parts.slice(0, -1).join("/");
                                const hasDot = /\./.test(typed);
                                const ext = (() => {
                                  const i = oldBase.lastIndexOf(".");
                                  return i >= 0 ? oldBase.slice(i + 1) : "";
                                })();
                                const newBase =
                                  hasDot || !ext ? typed : `${typed}.${ext}`;
                                const newFull = parent
                                  ? `${parent}/${newBase}`
                                  : newBase;
                                // Avoid duplicate names
                                const nameExists = (fileList || []).some(
                                  (f, i) => i !== idx && f.name === newFull
                                );
                                if (nameExists) {
                                  try {
                                    toast.error("Name already exists");
                                  } catch {}
                                  return;
                                }
                                setOverrideDoc((prev) => {
                                  const prevFiles =
                                    prev?.files ?? fileList ?? [];
                                  const nextFiles = prevFiles.map((f, i) =>
                                    i === idx ? { ...f, name: newFull } : f
                                  );
                                  // Persist file rename immediately
                                  saveFilesImmediate(nextFiles);
                                  const nextDoc: ContractDoc = {
                                    _id: prev?._id ?? "",
                                    question:
                                      prev?.question ??
                                      overrideDoc?.question ??
                                      prompt ??
                                      "",
                                    code: prev?.code ?? code ?? "",
                                    files: nextFiles,
                                    createdAt: prev?.createdAt,
                                    updatedAt: prev?.updatedAt,
                                    deployedAddress: prev?.deployedAddress,
                                    deployedNetwork: prev?.deployedNetwork,
                                    deployedOwner: prev?.deployedOwner,
                                    abi: prev?.abi,
                                  };
                                  return nextDoc;
                                });
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                              } else if (e.key === "Escape") {
                                e.stopPropagation();
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              e.stopPropagation();
                              const typed = renameItem.value.trim();
                              if (!typed || typeof idx !== "number") {
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                                return;
                              }
                              const oldFull = currentName;
                              const parts = oldFull.split("/");
                              const oldBase = parts[parts.length - 1];
                              const parent = parts.slice(0, -1).join("/");
                              const hasDot = /\./.test(typed);
                              const ext = (() => {
                                const i = oldBase.lastIndexOf(".");
                                return i >= 0 ? oldBase.slice(i + 1) : "";
                              })();
                              const newBase =
                                hasDot || !ext ? typed : `${typed}.${ext}`;
                              const newFull = parent
                                ? `${parent}/${newBase}`
                                : newBase;
                              const nameExists = (fileList || []).some(
                                (f, i) => i !== idx && f.name === newFull
                              );
                              if (nameExists) {
                                try {
                                  toast.error("Name already exists");
                                } catch {}
                                setRenameItem({
                                  key: null,
                                  type: null,
                                  value: "",
                                });
                                return;
                              }
                              setOverrideDoc((prev) => {
                                const prevFiles = prev?.files ?? fileList ?? [];
                                const nextFiles = prevFiles.map((f, i) =>
                                  i === idx ? { ...f, name: newFull } : f
                                );
                                saveFilesImmediate(nextFiles);
                                const nextDoc: ContractDoc = {
                                  _id: prev?._id ?? "",
                                  question:
                                    prev?.question ??
                                    overrideDoc?.question ??
                                    prompt ??
                                    "",
                                  code: prev?.code ?? code ?? "",
                                  files: nextFiles,
                                  createdAt: prev?.createdAt,
                                  updatedAt: prev?.updatedAt,
                                  deployedAddress: prev?.deployedAddress,
                                  deployedNetwork: prev?.deployedNetwork,
                                  deployedOwner: prev?.deployedOwner,
                                  abi: prev?.abi,
                                };
                                return nextDoc;
                              });
                              setRenameItem({
                                key: null,
                                type: null,
                                value: "",
                              });
                            }}
                            className="ml-2 bg-transparent border-none outline-none focus:outline-none px-1 text-white placeholder-foreground/40"
                            placeholder="File name"
                            autoFocus
                          />
                        )}
                        <span className="opacity-0 group-hover:opacity-100 inline-flex gap-1 ml-2 transition-opacity transition-transform duration-200 ease-out -translate-y-1 group-hover:translate-y-0">
                          <button
                            className="w-[20px] h-[20px] p-0 flex items-center justify-center rounded hover:bg-foreground/10 text-foreground/60"
                            aria-label="Rename file"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenameItem({
                                key,
                                type: "file",
                                value: baseTitle,
                              });
                            }}
                          >
                            <HiOutlinePencil className="inline-block w-[12px] h-[12px]" />
                          </button>
                        </span>
                      </div>
                    );
                  }
                  return String(nodeData?.title ?? "");
                }}
                icon={({ isLeaf, expanded }: any) =>
                  isLeaf ? (
                    <GoFileCode
                      className="inline-block w-[14px] h-[14px] mr-2 text-emerald-400"
                      style={{ minWidth: 14, marginTop: -4 }}
                    />
                  ) : (
                    <span
                      className="inline-block mr-2"
                      style={{ minWidth: 14 }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
                          fill={expanded ? "#9ca3af" : "#6b7280"}
                        />
                      </svg>
                    </span>
                  )
                }
              />
            </div>
            {overrideDoc?.deployedAddress ? (
              <div
                className="border-t border-foreground/10 pt-2 font-mono text-xs text-foreground/60 mt-4"
                title={overrideDoc?.question ?? prompt ?? "contracts"}
              >
                <div className=" px-3 pb-2  mb-4">
                  <div
                    style={{ background: "#00d49222" }}
                    className="flex items-center gap-2 mb-2 w-max rounded-md  p-1 text-emerald-400"
                  >
                    <GoShieldCheck className="inline-block w-[14px] h-[14px]" />
                    <span>Contract deployed successfully.</span>
                  </div>
                  <span className="mr-2 whitespace-normal">
                    Contract Address:
                  </span>
                  <div className="flex gap-2 items-center">
                    <div className="text-white flex items-center gap-2 my-1 w-max border border-foreground/20 pl-2 bg-black rounded-md p-1">
                      {ellipsizeMiddle(overrideDoc.deployedAddress)}
                      <button
                        className="inline-flex cursor-pointer items-center gap-1 px-1 py-[2px] rounded-md border border-foreground/20 text-foreground/70 hover:bg-foreground/10"
                        onClick={() => {
                          try {
                            navigator.clipboard.writeText(
                              String(overrideDoc.deployedAddress || "")
                            );
                            toast.success("Copied", {
                              description: "Contract address",
                            });
                          } catch {}
                        }}
                        aria-label="Copy contract address"
                        title="Copy contract address"
                      >
                        <GoCopy className="inline-block w-[12px] h-[12px]" />
                      </button>
                    </div>{" "}
                    {Array.isArray(overrideDoc?.abi) ||
                    Array.isArray(compiledAbi) ? (
                      <button
                        onClick={handleDownloadAbi}
                        className="cursor-pointer text-white underline text-xs"
                      >
                        Donwload ABI
                      </button>
                    ) : null}
                  </div>

                  <div className="mr-2 whitespace-normal mt-3">Network:</div>
                  <div className="text-white flex items-center gap-2 my-1 w-max border border-foreground/20 pl-2 bg-black rounded-md p-1">
                    {overrideDoc.deployedNetwork || chainName}
                    <button
                      className="inline-flex cursor-pointer items-center gap-1 px-1 py-[2px] rounded-md border border-foreground/20 text-foreground/70 hover:bg-foreground/10"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(
                            String(overrideDoc.deployedNetwork || "")
                          );
                          toast.success("Copied", {
                            description: "Network",
                          });
                        } catch {}
                      }}
                      aria-label="Copy contract address"
                      title="Copy contract address"
                    >
                      <GoCopy className="inline-block w-[12px] h-[12px]" />
                    </button>
                  </div>

                  <div className="mr-2 whitespace-normal mt-3">Owner:</div>
                  <div className="text-white flex items-center gap-2 my-1 w-max border border-foreground/20 pl-2 bg-black rounded-md p-1">
                    <img
                      src="/metamask-icon.webp"
                      className="w-[14px] h-[14px]"
                    />{" "}
                    {ellipsizeMiddle(overrideDoc.deployedOwner)}
                    <button
                      className="inline-flex cursor-pointer items-center gap-1 px-1 py-[2px] rounded-md border border-foreground/20 text-foreground/70 hover:bg-foreground/10"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(
                            String(overrideDoc.deployedOwner || "")
                          );
                          toast.success("Copied", {
                            description: "Network",
                          });
                        } catch {}
                      }}
                      aria-label="Copy contract address"
                      title="Copy contract address"
                    >
                      <GoCopy className="inline-block w-[12px] h-[12px]" />
                    </button>
                  </div>

                  <button
                    className="bg-foreground/20 mt-4 rounded-md hover:bg-foreground/30 cursor-pointer text-white flex gap-1 items-center justify-center  px-2 w-full py-[6px] font-mono text-xs"
                    onClick={() => {
                      setFunctionsOpen(true);
                      setDeployOpen(false);
                    }}
                  >
                    functions <GoArrowRight className="h-[15px] w-[15px]" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
        <PanelResizeHandle className={styles.resizeHandleCol}>
          <div className={styles.resizeBarCol} />
        </PanelResizeHandle>
        <Panel minSize={30} defaultSize={65} className="h-full">
          <div
            className={styles.editorWrapper}
            style={{ background: "#232323" }}
          >
            <div className="flex justify-between">
              <div className="flex">
                <button
                  onClick={handleSaveAndCompile}
                  disabled={
                    isCompiling || isSaving || !!overrideDoc?.deployedAddress
                  }
                  className="bg-emerald-400 flex items-center justify-center hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer text-black px-3 py-[6px] font-mono text-xs"
                  title={
                    overrideDoc?.deployedAddress
                      ? "Contract is deployed; editing disabled"
                      : undefined
                  }
                >
                  <GoSync className="inline-block w-[14px] h-[14px] mr-2" />
                  {isSaving
                    ? "Saving…"
                    : isCompiling
                    ? "Compiling…"
                    : "Save & Compile"}
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      disabled={!!overrideDoc?.deployedAddress}
                      title={
                        overrideDoc?.deployedAddress
                          ? "Contract is deployed; compiler version locked"
                          : undefined
                      }
                      className="bg-emerald-500 outline-none h-[30px] flex items-center justify-center hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer text-black px-2 py-[6px] font-mono text-xs"
                    >
                      <GoChevronDown className="inline-block w-[14px] h-[14px]" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      side="bottom"
                      align="start"
                      sideOffset={6}
                      className="z-50 min-w-[320px] max-h-[300px] overflow-auto bg-[#111] border border-foreground/10 rounded-md p-1 shadow-xl"
                    >
                      {solidityVersions.map((v) => (
                        <DropdownMenu.Item
                          key={v}
                          disabled={!!overrideDoc?.deployedAddress}
                          className="px-3 py-1 rounded text-foreground/80 hover:bg-foreground/15 font-mono text-xs cursor-pointer focus:outline-none"
                          onSelect={() => {
                            if (overrideDoc?.deployedAddress) return;
                            setSelectedSolVersion(v);
                          }}
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
                {overrideDoc?.deployedAddress ? (
                  <button
                    onClick={() => {
                      setFunctionsOpen(true);
                      setDeployOpen(false);
                    }}
                    className="bg-white flex items-center justify-center hover:bg-[#fff9] cursor-pointer text-black px-3 py-[6px] font-mono text-xs"
                  >
                    <GoCommandPalette className="inline-block w-[14px] h-[14px] mr-2" />
                    Functions
                  </button>
                ) : (
                  <button
                    onClick={handleDeployClick}
                    disabled={isCompiling}
                    className="bg-white flex items-center justify-center hover:bg-[#fff9] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer text-black px-3 py-[6px] font-mono text-xs"
                  >
                    <GoCommandPalette className="inline-block w-[14px] h-[14px] mr-2" />
                    Deploy
                  </button>
                )}
              </div>
            </div>
            {compileStatus === "error" && compileMessage ? (
              <div className="mt-2 bg-red-500/15 border border-red-500/30 text-red-300 rounded-md p-2 font-mono text-xs">
                <div
                  style={{ alignItems: "end" }}
                  className="flex justify-between gap-2"
                >
                  <div className="flex-1 whitespace-pre-wrap">
                    {compileMessage}
                  </div>
                  <button
                    disabled={isFixing}
                    className="shrink-0 bg-white hover:bg-[#fff9] disabled:opacity-60 disabled:cursor-not-allowed text-black px-4 min-w-9 py-[4px] rounded-md"
                    onClick={async () => {
                      try {
                        if (!walletAddr) {
                          toast.error("Wallet not connected");
                          return;
                        }
                        setIsFixing(true);
                        // Clear error UI immediately when starting Fix
                        setCompileStatus("idle");
                        setCompileMessage(null);
                        setCompileErrors([]);
                        clearMarkers();
                        const current = fileList[activeIndex] || {
                          name: "[Contract].sol",
                          content: code,
                        };
                        toast.info("AI fixing…", {
                          description: selectedSolVersion,
                        });
                        const res = await fetch("/api/fix", {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            "x-wallet-address": walletAddr,
                          },
                          body: JSON.stringify({
                            address: walletAddr,
                            contractId: selectedContractId,
                            version: selectedSolVersion,
                            fileName: current.name,
                            source: current.content,
                            files: fileList,
                            error: compileMessage,
                            errors: compileErrors,
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          toast.error(String(data?.error || "Fix failed"));
                          return;
                        }
                        const outFiles = Array.isArray(data?.files)
                          ? data.files
                          : [];
                        if (outFiles.length > 0) {
                          setOverrideDoc((prev) => ({
                            _id:
                              data?.contractId ||
                              prev?._id ||
                              selectedContractId ||
                              "",
                            question:
                              prev?.question ||
                              overrideDoc?.question ||
                              prompt ||
                              "",
                            code: undefined,
                            files: outFiles,
                            deployedAddress: prev?.deployedAddress,
                            deployedNetwork: prev?.deployedNetwork,
                            deployedOwner: prev?.deployedOwner,
                          }));
                        }
                        toast.success("Code fixed. Recompiling…", {
                          description: selectedSolVersion,
                        });
                        await handleCompile();
                      } catch (e) {
                        console.error(e);
                        toast.error("Error calling fix API");
                      } finally {
                        setIsFixing(false);
                      }
                    }}
                  >
                    {isFixing ? "Fixing…" : "Fix"}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="flex-1 min-h-0">
              {!(deployOpen || functionsOpen) ? (
                <Editor
                  height="100%"
                  language="solidity"
                  theme="solidity-dark"
                  value={fileList[activeIndex]?.content ?? code}
                  onChange={(val) => {
                    if (overrideDoc?.deployedAddress || isFixing) {
                      // Prevent edits once deployed
                      return;
                    }
                    const nextContent = val || "";
                    setOverrideDoc((prev) => {
                      const next: ContractDoc = {
                        _id: prev?._id || selectedContractId || "",
                        question:
                          prev?.question ||
                          overrideDoc?.question ||
                          prompt ||
                          "",
                        code: prev?.code || code || "",
                        files: prev?.files || fileList,
                        deployedAddress: prev?.deployedAddress,
                        deployedNetwork: prev?.deployedNetwork,
                        deployedOwner: prev?.deployedOwner,
                      };
                      if (fileList && fileList.length > 0) {
                        const arr = [...(next.files || [])];
                        if (
                          typeof activeIndex === "number" &&
                          arr[activeIndex]
                        ) {
                          arr[activeIndex] = {
                            ...arr[activeIndex],
                            content: nextContent,
                          };
                        }
                        next.files = arr;
                        next.code = undefined;
                      } else {
                        next.code = nextContent;
                        next.files = undefined;
                      }
                      return next;
                    });
                    setIsDirty(true);
                  }}
                  onMount={(editor, monaco) => {
                    try {
                      // Track monaco and current model for diagnostics
                      monacoRef.current = monaco;
                      try {
                        modelRef.current = editor?.getModel?.() || null;
                      } catch {}
                      editor.addAction({
                        id: "sol-save",
                        label: "Save",
                        keybindings: [
                          (monaco as any).KeyMod.CtrlCmd |
                            (monaco as any).KeyCode.KeyS,
                        ],
                        run: () => {
                          saveNow();
                        },
                      });
                    } catch {}
                  }}
                  beforeMount={(monaco) => {
                    // Register Solidity language with minimal Monarch tokens
                    monaco.languages.register({ id: "solidity" });
                    monaco.languages.setMonarchTokensProvider("solidity", {
                      defaultToken: "",
                      tokenPostfix: ".sol",
                      keywords: [
                        "pragma",
                        "solidity",
                        "contract",
                        "library",
                        "interface",
                        "struct",
                        "enum",
                        "function",
                        "returns",
                        "return",
                        "event",
                        "error",
                        "modifier",
                        "calldata",
                        "memory",
                        "storage",
                        "public",
                        "private",
                        "external",
                        "internal",
                        "payable",
                        "pure",
                        "view",
                        "virtual",
                        "override",
                        "immutable",
                        "constant",
                        "using",
                        "for",
                        "if",
                        "else",
                        "while",
                        "do",
                        "emit",
                        "new",
                        "mapping",
                        "delete",
                        "require",
                        "revert",
                        "assembly",
                        "this",
                        "super",
                      ],
                      typeKeywords: [
                        "address",
                        "bool",
                        "string",
                        "bytes",
                        "byte",
                        "bytes1",
                        "bytes2",
                        "bytes3",
                        "bytes4",
                        "bytes5",
                        "bytes6",
                        "bytes7",
                        "bytes8",
                        "bytes9",
                        "bytes10",
                        "bytes11",
                        "bytes12",
                        "bytes13",
                        "bytes14",
                        "bytes15",
                        "bytes16",
                        "bytes17",
                        "bytes18",
                        "bytes19",
                        "bytes20",
                        "bytes21",
                        "bytes22",
                        "bytes23",
                        "bytes24",
                        "bytes25",
                        "bytes26",
                        "bytes27",
                        "bytes28",
                        "bytes29",
                        "bytes30",
                        "bytes31",
                        "bytes32",
                        "int",
                        "int8",
                        "int16",
                        "int24",
                        "int32",
                        "int40",
                        "int48",
                        "int56",
                        "int64",
                        "int72",
                        "int80",
                        "int88",
                        "int96",
                        "int104",
                        "int112",
                        "int120",
                        "int128",
                        "int136",
                        "int144",
                        "int152",
                        "int160",
                        "int168",
                        "int176",
                        "int184",
                        "int192",
                        "int200",
                        "int208",
                        "int216",
                        "int224",
                        "int232",
                        "int240",
                        "int248",
                        "int256",
                        "uint",
                        "uint8",
                        "uint16",
                        "uint24",
                        "uint32",
                        "uint40",
                        "uint48",
                        "uint56",
                        "uint64",
                        "uint72",
                        "uint80",
                        "uint88",
                        "uint96",
                        "uint104",
                        "uint112",
                        "uint120",
                        "uint128",
                        "uint136",
                        "uint144",
                        "uint152",
                        "uint160",
                        "uint168",
                        "uint176",
                        "uint184",
                        "uint192",
                        "uint200",
                        "uint208",
                        "uint216",
                        "uint224",
                        "uint232",
                        "uint240",
                        "uint248",
                        "uint256",
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
                        "<=",
                        ">=",
                        "!=",
                        "&&",
                        "||",
                        "++",
                        "--",
                        "+",
                        "-",
                        "*",
                        "/",
                        "&",
                        "|",
                        "^",
                        "%",
                        "<<",
                        ">>",
                        ">>>",
                      ],
                      symbols: /[=><!~?:&|+\-*/^%]+/,
                      escapes:
                        /\\(?:[abfnrtv\\\"'|x[0-9A-Fa-f]{1,2}|u[0-9A-Fa-f]{4})/,
                      tokenizer: {
                        root: [
                          [/\/\/.*$/, "comment"],
                          [/\/\*/, "comment", "@comment"],
                          [
                            /[a-zA-Z_$][\w$]*/,
                            {
                              cases: {
                                "@keywords": "keyword",
                                "@typeKeywords": "type",
                                "@default": "identifier",
                              },
                            },
                          ],
                          { include: "@whitespace" },
                          [/[{}()\[\]]/, "@brackets"],
                          [
                            /(@symbols)/,
                            {
                              cases: {
                                "@operators": "operator",
                                "@default": "",
                              },
                            },
                          ],
                          [/0[xX][0-9a-fA-F]+/, "number.hex"],
                          [/\d+/, "number"],
                          [/"([^"\\]|\\.)*$/, "string.invalid"],
                          [/"/, "string", "@string"],
                          [/'([^'\\]|\\.)*$/, "string.invalid"],
                          [/'/, "string", "@string"],
                        ],
                        comment: [
                          [/[^\/*]+/, "comment"],
                          [/\*\//, "comment", "@pop"],
                          [/[\/*]/, "comment"],
                        ],
                        whitespace: [[/\s+/, "white"]],
                        string: [
                          [/[^\\"]+/, "string"],
                          [/\\./, "string.escape"],
                          [/\"/, "string", "@pop"],
                        ],
                      },
                    });
                    monaco.languages.setLanguageConfiguration("solidity", {
                      comments: {
                        lineComment: "//",
                        blockComment: ["/*", "*/"],
                      },
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
                    monaco.editor.defineTheme("solidity-dark", {
                      base: "vs-dark",
                      inherit: true,
                      rules: [
                        { token: "keyword", foreground: "c792ea" },
                        { token: "type", foreground: "82AAFF" },
                        { token: "number", foreground: "F78C6C" },
                        { token: "string", foreground: "ECC48D" },
                        { token: "comment", foreground: "637777" },
                      ],
                      colors: {},
                    });
                  }}
                  options={{
                    readOnly: isFixing || !!overrideDoc?.deployedAddress,
                    minimap: { enabled: false },
                    fontLigatures: true,
                    fontSize: 13,
                  }}
                />
              ) : (
                <PanelGroup direction="vertical">
                  <Panel minSize={20} defaultSize={60}>
                    <Editor
                      height="100%"
                      language="solidity"
                      theme="solidity-dark"
                      value={fileList[activeIndex]?.content ?? code}
                      onChange={(val) => {
                        if (isFixing || overrideDoc?.deployedAddress) {
                          return;
                        }
                        const nextContent = val || "";
                        setOverrideDoc((prev) => {
                          const next: ContractDoc = {
                            _id: prev?._id || selectedContractId || "",
                            question:
                              prev?.question ||
                              overrideDoc?.question ||
                              prompt ||
                              "",
                            code: prev?.code || code || "",
                            files: prev?.files || fileList,
                            deployedAddress: prev?.deployedAddress,
                            deployedNetwork: prev?.deployedNetwork,
                            deployedOwner: prev?.deployedOwner,
                          };
                          if (fileList && fileList.length > 0) {
                            const arr = [...(next.files || [])];
                            if (
                              typeof activeIndex === "number" &&
                              arr[activeIndex]
                            ) {
                              arr[activeIndex] = {
                                ...arr[activeIndex],
                                content: nextContent,
                              };
                            }
                            next.files = arr;
                            next.code = undefined;
                          } else {
                            next.code = nextContent;
                            next.files = undefined;
                          }
                          return next;
                        });
                        setIsDirty(true);
                      }}
                      onMount={(editor, monaco) => {
                        try {
                          // Track monaco and current model for diagnostics
                          monacoRef.current = monaco;
                          try {
                            modelRef.current = editor?.getModel?.() || null;
                          } catch {}
                          editor.addAction({
                            id: "sol-save",
                            label: "Save",
                            keybindings: [
                              (monaco as any).KeyMod.CtrlCmd |
                                (monaco as any).KeyCode.KeyS,
                            ],
                            run: () => {
                              saveNow();
                            },
                          });
                        } catch {}
                      }}
                      beforeMount={(monaco) => {
                        // Register Solidity language with minimal Monarch tokens
                        monaco.languages.register({ id: "solidity" });
                        monaco.languages.setMonarchTokensProvider("solidity", {
                          defaultToken: "",
                          tokenPostfix: ".sol",
                          keywords: [
                            "pragma",
                            "solidity",
                            "contract",
                            "library",
                            "interface",
                            "struct",
                            "enum",
                            "function",
                            "returns",
                            "return",
                            "event",
                            "error",
                            "modifier",
                            "calldata",
                            "memory",
                            "storage",
                            "public",
                            "private",
                            "external",
                            "internal",
                            "payable",
                            "pure",
                            "view",
                            "virtual",
                            "override",
                            "immutable",
                            "constant",
                            "using",
                            "for",
                            "if",
                            "else",
                            "while",
                            "do",
                            "emit",
                            "new",
                            "mapping",
                            "delete",
                            "require",
                            "revert",
                            "assembly",
                            "this",
                            "super",
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
                            "<=",
                            ">=",
                            "==",
                            "!=",
                            "=>",
                            "++",
                            "--",
                            "+",
                            "-",
                            "*",
                            "/",
                            "%",
                            "<",
                            ">",
                            "=",
                            "&&",
                            "||",
                            "!",
                            "&",
                            "|",
                            "^",
                            "~",
                            "<<",
                            ">>",
                          ],
                          symbols: /[=><!~?:&|+\-*\/%^]+/,
                          tokenizer: {
                            root: [
                              [/pragma|solidity/, "keyword"],
                              [/contract|interface|library/, "keyword"],
                              [
                                /[A-Za-z_$][\w$]*/,
                                {
                                  cases: {
                                    "@keywords": "keyword",
                                    "@typeKeywords": "type",
                                    "@default": "identifier",
                                  },
                                },
                              ],
                              [
                                /@symbols/,
                                {
                                  cases: {
                                    "@operators": "operator",
                                    "@default": "",
                                  },
                                },
                              ],
                              [/0[xX][0-9a-fA-F]+/, "number.hex"],
                              [/\d+/, "number"],
                              [/"([^"\\]|\\.)*$/, "string.invalid"],
                              [/"/, "string", "@string"],
                              [/'([^'\\]|\\.)*$/, "string.invalid"],
                              [/'/, "string", "@string"],
                            ],
                            comment: [
                              [/[^\/*]+/, "comment"],
                              [/\*\//, "comment", "@pop"],
                              [/[/\*]/, "comment"],
                            ],
                            whitespace: [[/\s+/, "white"]],
                            string: [
                              [/[^\\"]+/, "string"],
                              [/\\./, "string.escape"],
                              [/\"/, "string", "@pop"],
                            ],
                          },
                        });
                        monaco.languages.setLanguageConfiguration("solidity", {
                          comments: {
                            lineComment: "//",
                            blockComment: ["/*", "*/"],
                          },
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
                        monaco.editor.defineTheme("solidity-dark", {
                          base: "vs-dark",
                          inherit: true,
                          rules: [
                            { token: "keyword", foreground: "c792ea" },
                            { token: "type", foreground: "82AAFF" },
                            { token: "number", foreground: "F78C6C" },
                            { token: "string", foreground: "ECC48D" },
                            { token: "comment", foreground: "637777" },
                          ],
                          colors: {},
                        });
                      }}
                      options={{
                        readOnly: isFixing || !!overrideDoc?.deployedAddress,
                        minimap: { enabled: false },
                        fontLigatures: true,
                        fontSize: 13,
                      }}
                    />
                  </Panel>
                  <PanelResizeHandle className={styles.resizeHandleRow}>
                    <div className={styles.resizeBarRow} />
                  </PanelResizeHandle>
                  <Panel minSize={20} defaultSize={40}>
                    {deployOpen ? (
                      <div className="h-full relative z-2 bg-[#111] font-mono text-xs text-foreground/80 flex flex-col">
                        <div className={styles.deployPanelHeader}>
                          <div>
                            <span className="text-emerald-400 mr-2">
                              Deploy & run transactions
                              {chainName && (
                                <span
                                  style={{
                                    backgroundImage:
                                      "linear-gradient(to right, #43e97b 0%, #38f9d7 100%)",
                                  }}
                                  className="ml-2 px-1 py-1 rounded-md font-mono text-[11px] text-black"
                                >
                                  {chainName}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="px-2 py-[4px] rounded-md border border-foreground/20 text-foreground/70 hover:bg-foreground/10"
                              onClick={() => setDeployOpen(false)}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                        <div className={styles.deployPanelBody}>
                          <div className={styles.deployField}>
                            <label className="w-[200px] flex items-center gap-1 text-foreground/60">
                              <GoShieldCheck className="mr-2" /> Account
                              <span className="ml-2 px-1 py-1 rounded-md font-mono text-[11px] text-foreground/40">
                                {balanceText ?? "--"}
                              </span>
                            </label>
                            <input
                              className="flex-1 px-2 py-[6px] rounded-md bg-[#111] border border-foreground/10 text-foreground/80 outline-none"
                              placeholder="0x..."
                              value={deployAccount}
                              onChange={(e) => setDeployAccount(e.target.value)}
                            />
                          </div>
                          <div className={styles.deployField}>
                            <label className="w-[200px] flex items-center gap-1 text-foreground/60">
                              <GoShare className="mr-2" /> Value
                            </label>
                            <input
                              className="flex-1 px-2 py-[6px] rounded-md bg-[#111] border border-foreground/10 text-foreground/80 outline-none"
                              placeholder="0"
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                            />
                            <select
                              className="px-2 py-[6px] rounded-md bg-[#111] border border-foreground/10 text-foreground/80 outline-none"
                              value={valueUnit}
                              onChange={(e) =>
                                setValueUnit(e.target.value as any)
                              }
                            >
                              <option value="wei">wei</option>
                              <option value="gwei">gwei</option>
                              <option value="ether">ether</option>
                            </select>
                          </div>

                          <div className="bg-foreground/5 rounded-md p-3 mt-4">
                            <div className="flex items-center gap-1 uppercase text-foreground/60  mb-2">
                              Constructor Parameters
                            </div>
                            {constructorParams.length === 0 && (
                              <div className="text-foreground/60 text-xs font-mono">
                                No constructor parameters
                              </div>
                            )}

                            {constructorParams.map((p, idx) => (
                              <div className={styles.deployField} key={idx}>
                                <label className="w-[200px] text-foreground/60">
                                  {p.name ?? `Param #${idx + 1}`} · {p.type}
                                </label>
                                <input
                                  className="flex-1 px-2 py-[6px] rounded-md  border border-foreground/10 text-foreground/80 outline-none"
                                  placeholder="value"
                                  value={p.value}
                                  onChange={(e) => {
                                    const arr = [...constructorParams];
                                    arr[idx] = {
                                      ...arr[idx],
                                      value: e.target.value,
                                    };
                                    setConstructorParams(arr);
                                  }}
                                />
                              </div>
                            ))}
                          </div>

                          <div className="uppercase text-foreground/60 mt-4 mb-2">
                            Deployment Configurations
                          </div>
                          <div className={styles.deployField}>
                            <label className="w-[200px] text-foreground/60">
                              Gas limit
                            </label>
                            <input
                              className="flex-1 px-2 py-[6px] rounded-md bg-[#111] border border-foreground/10 text-foreground/80 outline-none"
                              placeholder="auto"
                              value={gasLimit}
                              onChange={(e) => setGasLimit(e.target.value)}
                              disabled={!customGas}
                            />
                            <label className="text-foreground/60 ml-2">
                              Custom
                            </label>
                            <input
                              type="checkbox"
                              checked={customGas}
                              onChange={(e) => setCustomGas(e.target.checked)}
                            />
                          </div>
                        </div>
                        <div className={styles.deployActions}>
                          <button
                            className="bg-emerald-400 hover:bg-emerald-500 disabled:bg-emerald-400/60 disabled:cursor-not-allowed text-black px-3 py-[6px] rounded-md"
                            onClick={handleConfirmDeploy}
                            disabled={
                              isDeploying ||
                              isCompiling ||
                              !compiledAbi ||
                              !compiledBytecode
                            }
                          >
                            {isDeploying ? "Deploying…" : "Deploy"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full relative z-2 bg-[#111] font-mono text-xs text-foreground/80 flex flex-col">
                        <div className={styles.deployPanelHeader}>
                          <div>
                            <span className="text-emerald-400 mr-2">
                              Contract functions
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              className="px-2 py-[4px] rounded-md border border-foreground/20 text-foreground/70 hover:bg-foreground/10"
                              onClick={() => {
                                setFunctionsOpen(false);
                                setFnOpenMap({});
                              }}
                            >
                              Close
                            </button>
                          </div>
                        </div>
                        <div className={styles.deployPanelBody}>
                          {(() => {
                            const abiArr = Array.isArray(overrideDoc?.abi)
                              ? overrideDoc!.abi!
                              : Array.isArray(compiledAbi)
                              ? compiledAbi!
                              : [];
                            const fnItems = abiArr.filter(
                              (x: any) => x && x.type === "function"
                            );
                            const readFns = fnItems.filter(
                              (x: any) =>
                                x.stateMutability === "view" ||
                                x.stateMutability === "pure"
                            );
                            const writeFns = fnItems.filter(
                              (x: any) =>
                                x.stateMutability === "nonpayable" ||
                                x.stateMutability === "payable"
                            );
                            const q = fnFilter.trim().toLowerCase();
                            const matchFn = (fn: any) => {
                              if (!q) return true;
                              const nm = String(fn?.name || "").toLowerCase();
                              const mut = String(
                                fn?.stateMutability || ""
                              ).toLowerCase();
                              const inputHit = (fn?.inputs || []).some(
                                (inp: any) =>
                                  String(inp?.type || "")
                                    .toLowerCase()
                                    .includes(q)
                              );
                              return (
                                nm.includes(q) || mut.includes(q) || inputHit
                              );
                            };
                            return (
                              <div className="space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <input
                                    className="flex-1 px-2 py-[6px] rounded-md bg-[#0e0e0e] border border-foreground/10 text-foreground/80 outline-none font-mono text-xs"
                                    placeholder="Filter functions…"
                                    value={fnFilter}
                                    onChange={(e) =>
                                      setFnFilter(e.target.value)
                                    }
                                  />
                                  <span className="px-2 py-[4px] rounded-md bg-emerald-400/10 text-emerald-300 font-mono text-[11px] border border-emerald-400/30">
                                    READ {readFns.filter(matchFn).length}
                                  </span>
                                  <span className="px-2 py-[4px] rounded-md bg-yellow-300/10 text-yellow-200 font-mono text-[11px] border border-yellow-300/30">
                                    WRITE {writeFns.filter(matchFn).length}
                                  </span>
                                </div>
                                <div>
                                  <div className="font-mono text-xs text-emerald-400">
                                    READ
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {readFns.filter(matchFn).length === 0 && (
                                      <div className="text-foreground/60 font-mono text-xs">
                                        No read functions
                                      </div>
                                    )}
                                    {readFns
                                      .filter(matchFn)
                                      .map((fn: any, i: number) => (
                                        <div
                                          key={`read-${i}`}
                                          className="rounded-md bg-foreground/7 cursor-pointer hover:bg-foreground/15"
                                        >
                                          <button
                                            className="w-full  cursor-pointer text-left pl-1 pr-3 py-2  font-mono text-xs text-white"
                                            onClick={() =>
                                              toggleFnOpen(fn.name)
                                            }
                                          >
                                            <span className="bg-emerald-400 px-2 py-1 mr-3 text-xs text-black rounded-md">
                                              {fn.stateMutability}
                                            </span>
                                            {fn.name}
                                          </button>
                                          {fnOpenMap[fn.name] && (
                                            <div className="p-3 space-y-2">
                                              {(fn.inputs || []).map(
                                                (inp: any, idx: number) => (
                                                  <div
                                                    key={idx}
                                                    className="flex items-center gap-2"
                                                  >
                                                    <label className="w-[200px] text-foreground/60">
                                                      {inp.name ||
                                                        `param_${idx}`}{" "}
                                                      · {inp.type}
                                                    </label>
                                                    {Array.isArray(
                                                      inp?.components
                                                    ) ||
                                                    /\[\]$/.test(
                                                      inp?.type || ""
                                                    ) ? (
                                                      <textarea
                                                        className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                                                        placeholder="JSON"
                                                        rows={2}
                                                        value={
                                                          fnInputMap[fn.name]?.[
                                                            `${fn.name}-${idx}`
                                                          ] || ""
                                                        }
                                                        onChange={(e) =>
                                                          setFnParam(
                                                            fn,
                                                            idx,
                                                            e.target.value
                                                          )
                                                        }
                                                      />
                                                    ) : (
                                                      <input
                                                        className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                                                        placeholder={inp.type}
                                                        value={
                                                          fnInputMap[fn.name]?.[
                                                            `${fn.name}-${idx}`
                                                          ] || ""
                                                        }
                                                        onChange={(e) =>
                                                          setFnParam(
                                                            fn,
                                                            idx,
                                                            e.target.value
                                                          )
                                                        }
                                                      />
                                                    )}
                                                  </div>
                                                )
                                              )}
                                              <div className="flex justify-end">
                                                <button
                                                  className="px-3 py-[6px] rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-xs"
                                                  onClick={() => callFnRead(fn)}
                                                  disabled={
                                                    !overrideDoc?.deployedAddress
                                                  }
                                                  title={
                                                    !overrideDoc?.deployedAddress
                                                      ? "Deploy the contract to enable reads"
                                                      : "Execute"
                                                  }
                                                >
                                                  Execute
                                                </button>
                                              </div>
                                              {fnResultMap[fn.name] && (
                                                <div className="mt-2 bg-[#111] border border-foreground/15 rounded-md p-2 font-mono text-xs text-foreground/80 whitespace-pre-wrap">
                                                  {fnResultMap[fn.name].ok
                                                    ? JSON.stringify(
                                                        fnResultMap[fn.name]
                                                          .data,
                                                        null,
                                                        2
                                                      )
                                                    : `Error: ${
                                                        fnResultMap[fn.name]
                                                          .error
                                                      }`}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="font-mono text-xs text-yellow-300">
                                    WRITE
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {writeFns.filter(matchFn).length === 0 && (
                                      <div className="text-foreground/60 font-mono text-xs">
                                        No write functions
                                      </div>
                                    )}
                                    {writeFns
                                      .filter(matchFn)
                                      .map((fn: any, i: number) => (
                                        <div
                                          key={`write-${i}`}
                                          className="rounded-md bg-foreground/7 cursor-pointer hover:bg-foreground/15"
                                        >
                                          <button
                                            className="w-full text-left px-1 py-2  font-mono text-xs text-white"
                                            onClick={() =>
                                              toggleFnOpen(fn.name)
                                            }
                                          >
                                            <span className="bg-yellow-300 px-2 py-1 mr-3 text-xs text-black rounded-md">
                                              implement
                                            </span>

                                            {fn.name}
                                          </button>
                                          {fnOpenMap[fn.name] && (
                                            <div className="p-3 space-y-2">
                                              {(fn.inputs || []).map(
                                                (inp: any, idx: number) => (
                                                  <div
                                                    key={idx}
                                                    className="flex items-center gap-2"
                                                  >
                                                    <label className="w-[200px] text-foreground/60">
                                                      {inp.name ||
                                                        `param_${idx}`}{" "}
                                                      · {inp.type}
                                                    </label>
                                                    {Array.isArray(
                                                      inp?.components
                                                    ) ||
                                                    /\[\]$/.test(
                                                      inp?.type || ""
                                                    ) ? (
                                                      <textarea
                                                        className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                                                        placeholder="JSON"
                                                        rows={2}
                                                        value={
                                                          fnInputMap[fn.name]?.[
                                                            `${fn.name}-${idx}`
                                                          ] || ""
                                                        }
                                                        onChange={(e) =>
                                                          setFnParam(
                                                            fn,
                                                            idx,
                                                            e.target.value
                                                          )
                                                        }
                                                      />
                                                    ) : (
                                                      <input
                                                        className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                                                        placeholder={inp.type}
                                                        value={
                                                          fnInputMap[fn.name]?.[
                                                            `${fn.name}-${idx}`
                                                          ] || ""
                                                        }
                                                        onChange={(e) =>
                                                          setFnParam(
                                                            fn,
                                                            idx,
                                                            e.target.value
                                                          )
                                                        }
                                                      />
                                                    )}
                                                  </div>
                                                )
                                              )}
                                              {fn.stateMutability ===
                                                "payable" && (
                                                <div className="flex items-center gap-2">
                                                  <label className="w-[200px] text-foreground/60">
                                                    value · ETH
                                                  </label>
                                                  <input
                                                    className="flex-1 bg-black border border-foreground/20 rounded-md p-2 font-mono text-xs"
                                                    placeholder="0.0"
                                                    value={
                                                      fnValueMap[fn.name] || ""
                                                    }
                                                    onChange={(e) =>
                                                      setFnValueMap((prev) => ({
                                                        ...prev,
                                                        [fn.name]:
                                                          e.target.value,
                                                      }))
                                                    }
                                                  />
                                                </div>
                                              )}
                                              <div className="flex justify-end">
                                                <button
                                                  className="px-3 py-[6px] rounded-md bg-yellow-300 hover:bg-yellow-400 text-black font-mono text-xs"
                                                  onClick={() =>
                                                    callFnWrite(fn)
                                                  }
                                                  disabled={
                                                    !overrideDoc?.deployedAddress
                                                  }
                                                  title={
                                                    !overrideDoc?.deployedAddress
                                                      ? "Deploy the contract to enable transactions"
                                                      : "Send Transaction"
                                                  }
                                                >
                                                  Send Transaction
                                                </button>
                                              </div>
                                              {fnResultMap[fn.name] && (
                                                <div className="mt-2 bg-[#111] border border-foreground/15 rounded-md p-2 font-mono text-xs text-foreground/80 whitespace-pre-wrap">
                                                  {fnResultMap[fn.name].ok
                                                    ? JSON.stringify(
                                                        {
                                                          txHash:
                                                            fnResultMap[fn.name]
                                                              .txHash,
                                                          receipt:
                                                            summarizeReceipt(
                                                              fnResultMap[
                                                                fn.name
                                                              ].receipt
                                                            ),
                                                        },
                                                        null,
                                                        2
                                                      )
                                                    : `Error: ${
                                                        fnResultMap[fn.name]
                                                          .error
                                                      }`}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </Panel>
                </PanelGroup>
              )}
            </div>
            {loading && (
              <div id="loading" className={styles.overlay}>
                <div
                  className="rounded-md opacity-35 grayscale-100 overflow-hidden"
                  style={{ width: 400 }}
                >
                  <span className="font-mono px-4 italic text-xs">
                    // Loading...
                  </span>
                  <Editor
                    height="400px"
                    width="450px"
                    theme="sol-dark"
                    language="sol"
                    value={typingText}
                    beforeMount={handleEditorWillMount}
                    onMount={(editor, monaco) => {
                      try {
                        monacoRef.current = monaco;
                        try {
                          modelRef.current = editor.getModel();
                        } catch {}
                        editorRef.current = editor;
                      } catch {}
                    }}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      lineNumbers: "off",
                      glyphMargin: false,
                      lineDecorationsWidth: 0,
                      automaticLayout: true,
                      contextmenu: false,
                      selectionHighlight: false,
                      renderLineHighlight: "none",
                      scrollbar: {
                        vertical: "hidden",
                        horizontal: "hidden",
                        useShadows: false,
                      },
                      fontSize: 12,
                      scrollBeyondLastLine: false,
                      smoothScrolling: true,
                      renderWhitespace: "none",
                      wordWrap: "on",
                    }}
                  />
                </div>
              </div>
            )}
            {noSelection && (
              <div style={{ paddingTop: 80 }} className={styles.overlay}>
                <div className="text-center font-mono text-sm text-foreground/60">
                  No contract selected. Choose one from history to preview,
                  compile, or deploy.
                </div>
              </div>
            )}
            <span
              className={`${styles.saveStatus} font-mono text-[11px] px-2 py-[6px] text-foreground/70`}
            >
              {isSaving ? "Saving…" : isDirty ? "Unsaved" : "Saved"}
            </span>
            {/* Inline diff section inside main viewer */}
            {diffOpen && (
              <div className="mt-2 rounded-md border border-foreground/20 bg-[#0b0b0b] h-[380px] flex flex-col overflow-hidden">
                <div className="px-3 py-2 border-b border-foreground/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <select
                      className="bg-black border border-foreground/20 rounded-md px-2 py-1 font-mono text-[11px] text-white"
                      value={diffActiveName}
                      onChange={(e) => setDiffActiveName(e.target.value)}
                    >
                      {diffFileNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                    <button
                      className="px-3 py-[6px] rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-[11px]"
                      onClick={async () => {
                        try {
                          const m = (pathname || "").match(
                            /^\/sol\/([a-fA-F0-9]{24})/
                          );
                          const cid = selectedContractId || m?.[1] || "";
                          const addr =
                            walletAddr ||
                            (typeof window !== "undefined"
                              ? localStorage.getItem("walletAddress")
                              : null);
                          if (!cid || !addr) {
                            toast.error("Cannot save changes", {
                              description:
                                "Missing contract ID or wallet address",
                            });
                            return;
                          }
                          const current = Array.isArray(fileList)
                            ? fileList
                            : [];
                          const map = new Map<string, any>(
                            current.map((f: any) => [f.name, { ...f }])
                          );
                          for (const pf of Array.isArray(proposedFiles)
                            ? proposedFiles
                            : []) {
                            map.set(pf.name, {
                              name: pf.name,
                              content: pf.content,
                            });
                          }
                          const merged = Array.from(map.values());
                          const r = await fetch(`/api/contract/${cid}`, {
                            method: "PATCH",
                            headers: {
                              "Content-Type": "application/json",
                              "x-wallet-address": addr!,
                            },
                            body: JSON.stringify({ files: merged, code: "" }),
                          });
                          if (!r.ok) {
                            const t = await r.text();
                            toast.error("Save failed", { description: t });
                            return;
                          }
                          setOverrideDoc((prev) => ({
                            _id: prev?._id || cid,
                            question: prev?.question || prompt || "",
                            code: undefined,
                            files: merged,
                            deployedAddress: prev?.deployedAddress,
                            deployedNetwork: prev?.deployedNetwork,
                            deployedOwner: prev?.deployedOwner,
                            abi: prev?.abi,
                          }));
                          setDiffOpen(false);
                          toast.success("Changes applied and saved");
                        } catch (e: any) {
                          toast.error("Apply changes error", {
                            description: e?.message || String(e),
                          });
                        }
                      }}
                    >
                      Apply All
                    </button>
                    <button
                      className="px-3 py-[6px] rounded-md bg-foreground/20 hover:bg-foreground/30 text-white font-mono text-[11px]"
                      onClick={() => setDiffOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <DiffEditor
                    original={
                      (Array.isArray(fileList) ? fileList : []).find(
                        (f: any) => f.name === diffActiveName
                      )?.content || ""
                    }
                    modified={
                      (Array.isArray(proposedFiles) ? proposedFiles : []).find(
                        (f: any) => f.name === diffActiveName
                      )?.content || ""
                    }
                    language="solidity"
                    theme="solidity-dark"
                    height="100%"
                    options={{
                      readOnly: true,
                      renderSideBySide: false,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      scrollbar: {
                        vertical: "hidden",
                        horizontal: "hidden",
                        useShadows: false,
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

"use client";

import { Hero } from "@/components/hero";
import { Leva } from "leva";
import Marquee from "react-fast-marquee";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  GoSync,
  GoChevronDown,
  GoCopy,
  GoFileCode,
  GoCommandPalette,
  GoArrowUpRight,
} from "react-icons/go";
import { FaXTwitter } from "react-icons/fa6";
// Icons are now served as static SVGs from public/icons/networks

export default function Home() {
  const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
    ssr: false,
  });
  const router = useRouter();
  const [selectedSolVersion, setSelectedSolVersion] = useState("0.8.20");
  const [solidityVersions, setSolidityVersions] = useState<string[]>([]);

  // Fresh init prompt used by Build Now! and Initialize buttons
  const initFreshPrompt =
    "Initialize a fresh Solidity setup with two minimal contracts. Create exactly two .sol files with PascalCase names. Each file must include // SPDX-License-Identifier: MIT, pragma solidity ^0.8.20;, a top multi-line comment with purpose, next steps, and links to `https://docs.soliditylang.org/`  and `http://third.codes/academy,`  and an empty contract <Name> {}. Do not add functions, variables, events, imports, inheritance, or modifiers.";

  const smartContractTemplates = [
    {
      title: "ERC20 Token",
      badge: "Token",
      description: "Create your own crypto token",
      prompt:
        "Create an ERC20 token named ForgeToken with 18 decimals and an initial supply of 1,000,000. Include mint and burn functions.",
    },
    {
      title: "ERC721 NFT",

      description: "Mint and manage NFTs easily",
      prompt:
        "Generate an ERC721 NFT contract called ThridNFT. Include minting and metadata (tokenURI) functions.",
    },
    {
      title: "Staking ",

      description: "Lock tokens and earn rewards",
      prompt:
        "Build a staking contract where users can deposit ERC20 tokens to earn rewards over time. Include claim and withdraw functions.",
    },
    {
      title: "Voting System",

      description: "Token-based governance voting",
      prompt:
        "Create a decentralized voting contract. Token holders can propose, vote, and execute proposals.",
    },
    {
      title: "DEX Contract",
      description: "Swap tokens via liquidity pools",
      prompt:
        "Generate a simple DEX that swaps between two ERC20 tokens using a liquidity pool. Include add/remove liquidity functions.",
    },
    {
      title: "DAO Contract",

      description: "Community-driven project control",
      prompt:
        "Create a DAO contract with proposal creation, voting, and treasury management. Include execution of approved proposals.",
    },
  ];

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
        ? localStorage.getItem("walletAddress") || ""
        : "";
    if (!addr) {
      toast.warning("Please connect your wallet first", {
        description: "Connect MetaMask and try again.",
      });
      return;
    }
    router.push("/sol");
  };

  // Deploy helper: checks wallet, initializes a contract, fires AI, then navigates
  const deployWithPrompt = async (prompt: string) => {
    const addr =
      typeof window !== "undefined"
        ? localStorage.getItem("walletAddress") || ""
        : "";
    if (!addr) {
      toast.warning("Please connect your wallet first", {
        description: "Connect MetaMask and try again.",
      });
      return;
    }
    try {
      const initRes = await fetch("/api/contract/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": addr,
        },
        body: JSON.stringify({ address: addr, question: prompt }),
      });
      const initData = await initRes.json().catch(() => ({} as any));
      if (!initRes.ok || !initData?.contractId) {
        toast.error("Initialization failed", {
          description: String(initData?.error || "Could not start session"),
        });
        return;
      }
      const cid = String(initData.contractId);
      // Navigate to Solidity viewer first
      router.push(`/sol/${cid}`);
      // Fire AI build in background
      try {
        fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": addr,
          },
          body: JSON.stringify({
            question: prompt,
            address: addr,
            contractId: cid,
          }),
        }).catch(() => {});
      } catch {}
    } catch (e: any) {
      toast.error("Network error", {
        description: String(e?.message || e || ""),
      });
    }
  };
  return (
    <>
      <Hero />
      <Leva hidden />
      <div>
        <div className="mt-8 max-w-[1150px] mx-auto mb-12  sm:px-6">
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
        <div className="mt-8 max-w-[1150px] mx-auto mb-16 border border-[#fff2] min-h-[600px] md:min-h-[900px] px-4 md:px-0">
          <div className="border-b border-[#fff2]">
            <div className="flex justify-between flex-wrap gap-2">
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
                  onClick={() => deployWithPrompt(initFreshPrompt)}
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
              beforeMount={(monaco) => {
                try {
                  monaco.languages.register({ id: "solidity" });
                  monaco.languages.setLanguageConfiguration("solidity", {
                    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
                    brackets: [
                      ["{", "}"],
                      ["[", "]"],
                      ["(", ")"],
                    ],
                  });
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
                      "immutable",
                      "indexed",
                    ],
                    typeKeywords: [
                      "address",
                      "bool",
                      "string",
                      "bytes",
                      "int",
                      "uint",
                      "byte",
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
                      "+",
                      "-",
                      "*",
                      "/",
                      "&",
                      "|",
                      "^",
                      "%",
                      "<<",
                      " >>",
                    ],
                    symbols: /[=><!~?:&|+\-*\/\^%]+/,
                    tokenizer: {
                      root: [
                        [/\/\/.*$/, "comment"],
                        [/\/\*/, "comment", "comment"],
                        [
                          /[a-zA-Z_$][\w$]*/,
                          {
                            cases: {
                              "@keywords": "keyword",
                              "@typeKeywords": "type.identifier",
                              "@default": "identifier",
                            },
                          },
                        ],
                        { include: "@whitespace" },
                        [/[{}()\[\]]/, "delimiter.bracket"],
                        [/"([^"\\]|\\.)*$/, "string.invalid"],
                        [/"/, "string", "@string"],
                        [/'[^'\\]*(?:\\.[^'\\]*)*'/, "string"],
                        [
                          /\d+(?:_\d+)*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?/,
                          "number",
                        ],
                        [
                          /(@symbols)/,
                          {
                            cases: {
                              "@operators": "operator",
                              "@default": "delimiter",
                            },
                          },
                        ],
                      ],
                      comment: [
                        [/[^/*]+/, "comment"],
                        [/\/\*/, "comment", "@push"],
                        [/\*\//, "comment", "@pop"],
                        [/\/[/*]/, "comment"],
                      ],
                      whitespace: [
                        [/\s+/, "white"],
                        [/\/\/.*$/, "comment"],
                      ],
                      string: [
                        [/[^\\"]+/, "string"],
                        [/\\./, "string.escape"],
                        [/"/, "string", "@pop"],
                      ],
                    },
                  });
                } catch {}
              }}
              defaultValue={
                '// ThirdCodes — browser-based Solidity with AI.\n// Write, compile, deploy on your preferred network.\n// Connect MetaMask, pick version, and ship.\npragma solidity ^0.8.20;\n\ncontract ThirdCodes {\n    // Simple example; extend with your logic.\n    string public greeting = "Hello, ThirdCodes!";\n\n    // TODO: add functions, events, modifiers.\n    // Example getter:\n    function greet() external view returns (string memory) {\n        return greeting;\n    }\n\n    // Change greeting in future versions.\n    // function setGreeting(string calldata m) external { greeting = m; }\n}\n'
              }
            />
          </div>
          <h3 className="text-white text-center border-b pb-8 border-[#fff2] font-mono text-2xl mt-8">
            AI-Codes: From Prompt to Protocol
          </h3>
          <div className="md:flex">
            <div className="border-r p-12 font-mono md:w-[50%] border-[#fff2]">
              <span className="text-xs text-emerald-400 border border-emerald-400 px-3 py-[3px] rounded-full">
                Create
              </span>
              <h2 className="text-xl mt-2">From Idea to Code in Seconds</h2>
              <p className="text-[12px] mt-2 text-foreground/60">
                Instantly generate Solidity smart contracts with AI. Describe
                your idea and get clean, deployment-ready code in seconds.
              </p>
              <img src={"/ai-codes-min.png"} className="mt-7" />
            </div>

            <div className="p-12 font-mono md:w-[50%]">
              <span className="text-xs text-emerald-400 border border-emerald-400  px-3 py-[3px] rounded-full">
                Fix/Update
              </span>
              <h2 className="text-xl mt-2">AI-Powered Debugging & Upgrades</h2>
              <p className="text-[12px] mt-2 text-foreground/60">
                Each contract includes an AI agent that understands your
                codebase, finds issues, and updates logic safely.
              </p>
              <img src={"/contract-chat-min.png"} className="mt-7" />
            </div>
          </div>

          <div className="text-white border-t py-8 border-[#fff2] font-mono text-2xl">
            <h3 className="text-center"> One-Click Deployment</h3>
            <p className="text-sm mt-4 text-center text-foreground/60">
              Connect your wallet and deploy your smart contract to the
              blockchain with a single click.
            </p>
            <button
              className="bg-white hover:opacity-80 cursor-pointer py-2 mx-auto mt-5 block px-4 text-black rounded-full text-sm"
              onClick={() => deployWithPrompt(initFreshPrompt)}
            >
              Initialize a new contract
            </button>
          </div>
          <div className="md:grid border-t border-[#fff2] grid-cols-3">
            {smartContractTemplates.map((item, idx) => (
              <div
                key={item.title}
                className={`p-4 font-mono border-[#fff2] ${
                  idx % 3 !== 2 ? "md:border-r" : ""
                } ${idx < 3 ? "md:border-b" : ""}`}
              >
                <p className="text-[32px]   font-mono text-center my-24 items-center justify-between">
                  {item.title}
                  {/* <span className="text-[10px] bg-emerald-400 text-black px-2 py-[2px] rounded-full">Popular</span> */}
                </p>
                <h3 className="mt-2">{item.description}</h3>
                <p className="text-foreground/60 text-[12px] mt-2">
                  {item.prompt}
                </p>
                <button
                  className="text-[12px] mb-2 flex gap-1 items-center hover:opacity-80 cursor-pointer bg-emerald-400 text-black mt-3 px-3 py-[3px] rounded-full"
                  onClick={() => deployWithPrompt(item.prompt)}
                >
                  Deploy <GoArrowUpRight />
                </button>
              </div>
            ))}
          </div>
          <div className="text-white h-[340px] border-t border-[#fff2] font-mono text-2xl">
            <MonacoEditor
              defaultLanguage="solidity"
              theme="vs-dark"
              options={{
                readOnly: true,
                contextmenu: false,
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 6 },
                scrollbar: { alwaysConsumeMouseWheel: false },
              }}
              defaultValue={
                "pragma solidity ^0.8.20;\n\ncontract ThirdCodesFAQ {\n    // Q1: How can I deploy a contract?\n    // A1: Write your Solidity code, compile it, then click Deploy while connected to MetaMask.\n\n    // Q2: What happens to my code after saving?\n    // A2: Your contract is saved in the backend or downloaded via export options.\n\n    // Q3: Can I interact with deployed contracts?\n    // A3: Yes, after deployment the interface automatically loads all public/external functions.\n\n    // Q4: Which Solidity versions are supported?\n    // A4: All official compiler releases from 0.4.x to 0.8.x can be selected from the version menu.\n\n    // Q5: How do I switch blockchain networks?\n    // A5: Change your MetaMask network to any supported EVM chain; the app will auto-detect it.\n}"
              }
            />
          </div>
          <div className="text-white border-t border-[#fff2] font-mono text-2xl">
            <h3 className="text-center mt-16"> One Code. Every Chain.</h3>
            <p className="text-sm mt-4 text-center text-foreground/60">
              With third.codes, your smart contracts are ready to deploy on any
              <br />
              EVM compatible network, seamlessly, securely, and instantly.
            </p>
            {/* EVM-compatible networks marquee */}
            <div className="mt-16">
              <Marquee
                speed={35}
                pauseOnHover
                gradient
                gradientColor="#000000"
                gradientWidth={80}
              >
                {[
                  { label: "Ethereum", ledgerId: "ethereum", ticker: "ETH" },
                  { label: "Polygon", ledgerId: "polygon", ticker: "MATIC" },
                  { label: "BSC", ledgerId: "bnb", ticker: "BNB" },
                  { label: "Arbitrum", ledgerId: "arbitrum", ticker: "ARB" },
                  { label: "Optimism", ledgerId: "optimism", ticker: "OP" },
                  { label: "zkSync", ledgerId: "zksync", ticker: "ZK" },
                  { label: "Avalanche", ledgerId: "avalanche", ticker: "AVAX" },
                  { label: "Fantom", ledgerId: "fantom", ticker: "FTM" },
                  { label: "Celo", ledgerId: "celo", ticker: "CELO" },
                  { label: "Harmony", ledgerId: "harmony", ticker: "ONE" },
                  { label: "Moonbeam", ledgerId: "moonbeam", ticker: "GLMR" },
                  { label: "Moonriver", ledgerId: "moonriver", ticker: "MOVR" },
                  { label: "Aurora", ledgerId: "aurora", ticker: "AURORA" },
                ].map(({ label, ledgerId }) => (
                  <div
                    key={label}
                    className="w-[160px] py-7 flex gap-2 justify-center border border-l-0 border-b-0 border-[#fff2] items-center"
                  >
                    <img
                      src={`/icons/${ledgerId}.svg`}
                      alt={`${label} logo`}
                      className="h-8 w-8"
                    />
                    <span className="text-xs text-foreground/50">{label}</span>
                  </div>
                ))}
              </Marquee>
            </div>
          </div>
        </div>
        <h3 className="text-center text-4xl font-mono mt-22">
          {" "}
          Ready to start?
        </h3>
        <p className="mt-3 text-center mb-5 font-mono text-foreground/60">
          We’ll generate an empty smart contract structure for you, ready to
          build <br /> and launch with AI instantly.
        </p>
        <button
          className="bg-white font-mono mb-16 hover:opacity-80 cursor-pointer py-2 mx-auto mt-5 block px-8 text-black rounded-full text-sm"
          onClick={() => deployWithPrompt(initFreshPrompt)}
        >
          Build Now!
        </button>
        {/* Tweets Marquee: Social proof below Ready to start section */}
        <div className="mt-8 mb-16 w-full">
          {/* <h4 className="text-center text-lg font-mono text-foreground/40 mb-8">
            What people say about us
          </h4> */}
          <Marquee
            speed={40}
            pauseOnHover
            className=""
            gradient
            gradientColor="#000000"
            gradientWidth={80}
          >
            {[
              {
                name: "Emily Johnson",
                role: "Product Manager, Finch Labs",
                text: "third.codes helped us ship a governance MVP in an afternoon. Clean output, clear guidance, and zero Solidity headaches. Seriously, it's a gamechanger for fast prototyping!",
                hashtags: [
                  "#Blockchain",
                  "#Prototyping",
                  "#ThirdCodes",
                  "#Tools",
                  "#Trend",
                  "#WEb3",
                ],
              },
              {
                name: "Michael Carter",
                role: "CTO, BrightChain",
                text: "Spun up an ERC20 with mint/burn in minutes. Went from idea to test-ready token in the same day. The AI workflow feels like having a senior engineer on standby.",
                hashtags: ["@thirdcodes"],
              },
              {
                name: "Lily Fox",
                role: "Founder, NovaDAO",
                text: "From concept to live DAO contract without deep blockchain expertise. third.codes let us experiment fearlessly and ship fast—our community loved it!",
                hashtags: ["www.third.codes", "@thirdcodes"],
              },
              {
                name: "Matthew Adams",
                role: "Blockchain Engineer, SkyNet",
                text: "Generated code was readable, maintainable, and production-ready. Integrates perfectly with our CI/CD pipelines. Feels like it was made for engineers.",
                hashtags: ["#web3", "#evm", "@polygon", "#smartContracts"],
              },
              {
                name: "Noah Reed",
                role: "Head of Ops, MetaForge",
                text: "If your team isn’t blockchain-native, this is the tool you need. Iterate, validate, and deploy smart contracts effortlessly. It just works.",
                hashtags: ["#NoCode", "#SmartContracts"],
              },
              {
                name: "Ava Mitchell",
                role: "Researcher, DeFi Lab",
                text: "Rapid DeFi prototyping became painless. Tested multiple models, shipped contracts fast, and learned without headaches.",
                hashtags: ["https://third.codes"],
              },
              {
                name: "Peter Collins",
                role: "Lead Dev, OrbitX",
                text: "Token-based voting done in no time. AI helpers were practical, guiding us through without micromanaging. Smooth experience.",
                hashtags: [],
              },
              {
                name: "Mary Smith",
                role: "QA Lead, Quartz",
                text: "Common pitfalls flagged automatically, fixes suggested instantly. Saved days of QA cycles. Wish all tools were this smart.",
                hashtags: [
                  "#BlockchainTools",
                  "#thirdcodes",
                  "#web3",
                  "#noCode",
                ],
              },
              {
                name: "Cameron Hayes",
                role: "DevRel, Web3Hub",
                text: "For workshops and demos, third.codes lets us spin up real contracts in minutes. Audience actually plays with live code—mind-blowing!",
                hashtags: ["#Web3", ""],
              },
              {
                name: "Ryan Keller",
                role: "PM, ChainWave",
                text: "Instant deploy with AI cut our timeline drastically. From prototyping to testing in record time. Highly recommend anyone curious about smart contracts to try it.",
                hashtags: [],
              },
            ].map((t, idx) => (
              <div
                key={idx}
                className="mx-4 w-[360px] sm:w-[440px] bg-[#ffffff0b] border border-[#fff2] rounded-md p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-sm text-white">{t.name}</div>
                    <div className="font-mono text-[11px] text-foreground/50">
                      {t.role}
                    </div>
                  </div>
                  <FaXTwitter className="w-6 h-6 text-white" />
                </div>
                <p className="mt-2 font-mono text-sm text-foreground/80">
                  {t.text}
                </p>
                <div className="flex flex-wrap gap-2 font-mono text-[11px] text-blue-400 mt-2">
                  {t.hashtags.map((item) => (
                    <p>{item}</p>
                  ))}
                </div>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </>
  );
}

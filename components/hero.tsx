"use client";

import Link from "next/link";
import { Pill } from "./pill";
import { Button } from "./ui/button";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Plus } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { GoUpload, GoLink, GoArrowRight } from "react-icons/go";
import { GoPackage, GoCreditCard } from "react-icons/go";
import { useRouter } from "next/navigation";
import { GoBook } from "react-icons/go";

// Toasts disabled by request. Provide no-op API to avoid UI popups.
const toast = {
  success: (..._args: any[]) => {},
  error: (..._args: any[]) => {},
  info: (..._args: any[]) => {},
  warning: (..._args: any[]) => {},
};

const LazyGL = dynamic(
  () => import("./gl").then((mod) => ({ default: mod.GL })),
  { ssr: false }
);

export function Hero() {
  // react-query removed; no cache updates
  const [hovering, setHovering] = useState(false);
  const [allowGL, setAllowGL] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(false);

  // Suggestion: Initialize fresh contract (concise prompt)
  const initFreshPrompt =
    "Initialize a fresh Solidity setup with two minimal contracts. Create exactly two .sol files with PascalCase names. Each file must include // SPDX-License-Identifier: MIT, pragma solidity ^0.8.20;, a top multi-line comment with purpose, next steps, and links to https://docs.soliditylang.org/ and http://third.codes/academy, and an empty contract <Name> {}. Do not add functions, variables, events, imports, inheritance, or modifiers.";

  // Suggestion: Token Creation Smart Contract
  const tokenCreationPrompt =
    "Create an ERC20 token smart contract using ./@openZeppelin.";

  // Suggestion: Crowdsale Funding Mechanism Contract
  const crowdsalePrompt =
    "Create a simple crowdsale funding contract. Accept ETH and sell an ERC20 token at a fixed rate; enforce start/end timestamps, soft cap and hard cap; owner can withdraw when goal reached; allow refunds if goal not met after end. Use MIT license, pragma ^0.8.20, ReentrancyGuard, and NatSpec. Return full file content.";

  // Submit helper to send a specific prompt value immediately
  const submitPromptWith = async (p: string) => {
    if (loading || authLoading) return;
    if (!walletAddr) {
      toast.warning("Connect your wallet first", {
        description: "Please connect MetaMask and try again.",
      });
      return;
    }
    setLoading(true);
    setError("");
    setAnswer("");
    setPrompt("Thinking…");
    try {
      const traceId = `ai-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      console.log(`[AI][${traceId}] init_click`, {
        addr: walletAddr,
        promptLen: (p || "").length,
      });
      const initRes = await fetch("/api/contract/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddr!,
        },
        body: JSON.stringify({
          address: walletAddr,
          question: p,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData?.contractId) {
        setError(initData?.error || "Init failed");
        return;
      }
      const cid = initData.contractId as string;
      // No cache mutation; viewer will fetch history directly
      console.log(`[AI][${traceId}] navigate_immediate`, `/sol/${cid}`);
      router.push(`/sol/${cid}`);
      try {
        fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddr!,
          },
          body: JSON.stringify({
            question: p,
            address: walletAddr,
            traceId,
            contractId: cid,
          }),
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.error(`[AI] client error`, e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  const submitPrompt = async () => {
    if (loading || authLoading) return;
    // Require wallet connection before proceeding
    if (!walletAddr) {
      toast.warning("Connect your wallet first", {
        description: "Please connect MetaMask and try again.",
      });
      return;
    }
    setLoading(true);
    setError("");
    setAnswer("");
    // Show thinking inside the input
    setPrompt("Thinking…");
    try {
      const traceId = `ai-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      console.log(`[AI][${traceId}] init_click`, {
        addr: walletAddr,
        promptLen: (prompt || "").length,
      });
      const initRes = await fetch("/api/contract/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-wallet-address": walletAddr!,
        },
        body: JSON.stringify({
          address: walletAddr,
          question: prompt,
        }),
      });
      const initData = await initRes.json();
      if (!initRes.ok || !initData?.contractId) {
        setError(initData?.error || "Init failed");
        return;
      }
      const cid = initData.contractId as string;
      // Optimistically update chat history so the new prompt appears and is active on the next page
      // No cache mutation; viewer will fetch history directly
      console.log(`[AI][${traceId}] navigate_immediate`, `/sol/${cid}`);
      router.push(`/sol/${cid}`);
      // Fire AI build in background without blocking navigation
      try {
        fetch("/api/ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-wallet-address": walletAddr!,
          },
          body: JSON.stringify({
            question: prompt,
            address: walletAddr,
            traceId,
            contractId: cid,
          }),
        }).catch(() => {});
      } catch {}
    } catch (e) {
      console.error(`[AI] client error`, e);
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Respect users who prefer reduced motion
    if (typeof window !== "undefined") {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (prefersReducedMotion) setAllowGL(false);
    }
  }, []);

  // Initialize wallet strictly: require provider + active account; do not trust storage alone
  useEffect(() => {
    (async () => {
      try {
        const ethereum =
          typeof window !== "undefined" ? (window as any).ethereum : null;
        // If no provider, ensure we show disconnected and clear any stale flags
        if (!ethereum || typeof ethereum.request !== "function") {
          setWalletAddr(null);
          try {
            if (typeof window !== "undefined") {
              localStorage.setItem("walletConnected", "false");
              document.cookie = "walletAddress=; path=/; max-age=0";
            }
          } catch {}
          return;
        }
        // Read accounts without prompting; only mark connected if an account exists
        const accs = (await ethereum.request({ method: "eth_accounts" })) as string[];
        const addr = Array.isArray(accs) && accs.length > 0 ? accs[0] : null;
        setWalletAddr(addr);
        try {
          if (addr) {
            localStorage.setItem("walletAddress", addr);
            localStorage.setItem("walletConnected", "true");
            const maxAge = 60 * 60 * 24 * 30; // 30 days
            document.cookie = `walletAddress=${addr}; path=/; max-age=${maxAge}`;
          } else {
            localStorage.removeItem("walletAddress");
            localStorage.setItem("walletConnected", "false");
            document.cookie = "walletAddress=; path=/; max-age=0";
          }
        } catch {}
      } catch {}
    })();
  }, []);

  // Live-sync wallet changes when MetaMask account changes
  useEffect(() => {
    const ethereum =
      typeof window !== "undefined" ? (window as any).ethereum : null;
    if (!ethereum || typeof ethereum.on !== "function") return;

    const onAccountsChanged = (accs: string[]) => {
      const addr = accs?.[0] ?? null;
      setWalletAddr(addr);
      try {
        if (addr) {
          localStorage.setItem("walletAddress", addr);
          localStorage.setItem("walletConnected", "true");
          const maxAge = 60 * 60 * 24 * 30; // 30 days
          document.cookie = `walletAddress=${addr}; path=/; max-age=${maxAge}`;
        } else {
          localStorage.removeItem("walletAddress");
          localStorage.setItem("walletConnected", "false");
          document.cookie = "walletAddress=; path=/; max-age=0";
        }
      } catch {}
    };

    ethereum.on("accountsChanged", onAccountsChanged);
    return () => {
      if (typeof ethereum?.removeListener === "function") {
        ethereum.removeListener("accountsChanged", onAccountsChanged);
      }
    };
  }, []);

  // Respond to custom wallet events emitted by the connect button
  useEffect(() => {
    const onConnected = (e: any) => {
      const addr = e?.detail?.address || null;
      setWalletAddr(addr);
    };
    const onDisconnected = () => {
      setWalletAddr(null);
    };
    if (typeof window !== "undefined") {
      window.addEventListener("wallet:connected", onConnected as EventListener);
      window.addEventListener(
        "wallet:disconnected",
        onDisconnected as EventListener
      );
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
      }
    };
  }, []);

  // No history and no data fetching needed here per requirements
  return (
    <div className="flex flex-col h-svh justify-between relative">
      {allowGL && <LazyGL hovering={hovering} />}

      <div className="pb-16 mt-auto text-center relative">
        {/* Product Hunt badge above the main slogan (dark theme) */}
        <div className="flex justify-center mb-14">
          <a
            href="https://www.producthunt.com/products/third-codes?embed=true&utm_source=badge-featured&utm_medium=badge&utm_source=badge-third-codes"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Third Codes on Product Hunt"
          >
            <img
              src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1039031&theme=dark&t=1763560836430"
              alt="Third Codes - Create and deploy smart contracts instantly with AI. | Product Hunt"
              style={{ width: 250, height: 54 }}
              width={250}
              height={54}
            />
          </a>
        </div>

        {/* <Pill className="mb-6">BETA RELEASE</Pill>
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-sentient">
          Unlock your <br />
          <i className="font-light">future</i> growth
        </h1>
        <p className="font-mono text-sm sm:text-base text-foreground/60 text-balance mt-8 max-w-[440px] mx-auto">
          Through perpetual investment strategies that outperform the market
        </p> */}

        <h1 className="text-4xl font-sentient">
          What do you want to deploy on{" "}
          <span className=" text-emerald-400">Web3</span>?
        </h1>
        <p className="font-mono text-sm sm:text-base text-foreground/60 text-balance mt-3 mx-auto">
          Build and launch smart contracts with AI. Low-code, high impact.{" "}
        </p>
        {/* Text editor: controlled, fixed size, no outline, no resize */}
        <div className="max-w-[900px] mx-auto relative">
          <textarea
            className="w-full  font-mono max-w-[900px] bg-[#18181888] h-32 backdrop-blur-lg p-4 mt-4 border border-foreground/20 rounded-xl resize-none outline-none focus:outline-none focus:ring-0 focus:border-foreground/20 focus-visible:outline-none disabled:bg-[#18181855] disabled:opacity-70 disabled:cursor-not-allowed"
            spellCheck={false}
            data-gramm="false"
            data-gramm_editor="false"
            data-grammarly="false"
            autoCorrect="off"
            autoCapitalize="off"
            translate="no"
            placeholder={
              walletAddr
                ? "ask third.codes to build..."
                : "Connect MetaMask to start..."
            }
            value={prompt}
            disabled={loading || authLoading}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitPrompt();
              }
            }}
          />

          <button
            className="hover:bg-[#fff2] cursor-pointer absolute right-4 bottom-5 backdrop-blur-sm p-1 rounded-md disabled:opacity-50"
            disabled={loading || authLoading || !prompt.trim()}
            onClick={submitPrompt}
          >
            <GoArrowRight className="text-[22px] text-[#fff9]" />
          </button>
          {/* {!walletAddr && (
            <div className="absolute px-3 py-1 font-mono text-xs bg-transparent">
              Wallet not connected. Connect MetaMask to submit.
            </div>
          )} */}

          <button className="bg-[#ffffff0b] text-[#fff7]  font-mono text-xs  absolute left-4 bottom-5 backdrop-blur-sm py-1 px-3  rounded-full">
            Auto Mode
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                console.log("selected file:", file.name);
              }
            }}
          />
        </div>
        {/* Suggestions below the text area */}
        <div className="max-w-[900px] justify-center mx-auto mt-1 flex flex-wrap items-center gap-2">
          <p className="text-xs text-gray-400">Suggestions:</p>

          <button
            className="px-3 cursor-pointer backdrop-blur-lg  flex items-center gap-2 py-[6px] rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray font-mono text-[11px] disabled:opacity-60"
            disabled={loading || authLoading}
            onClick={async () => {
              try {
                await (navigator.clipboard?.writeText?.(initFreshPrompt) ||
                  Promise.resolve());
              } catch {}
              setPrompt(initFreshPrompt);
              submitPromptWith(initFreshPrompt);
            }}
          >
            <GoBook className="" />
            Initialize fresh contract
          </button>

          <button
            className="px-3 flex cursor-pointer backdrop-blur-lg  items-center gap-2 py-[6px] rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray font-mono text-[11px] disabled:opacity-60"
            disabled={loading || authLoading}
            onClick={async () => {
              try {
                await (navigator.clipboard?.writeText?.(tokenCreationPrompt) ||
                  Promise.resolve());
              } catch {}
              setPrompt(tokenCreationPrompt);
              submitPromptWith(tokenCreationPrompt);
            }}
          >
            <GoPackage className="" />
            Token Creation Smart Contract
          </button>

          <button
            className="px-3 flex cursor-pointer backdrop-blur-lg items-center gap-2 py-[6px] rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-gray font-mono text-[11px] disabled:opacity-60"
            disabled={loading || authLoading}
            onClick={async () => {
              try {
                await (navigator.clipboard?.writeText?.(crowdsalePrompt) ||
                  Promise.resolve());
              } catch {}
              setPrompt(crowdsalePrompt);
              submitPromptWith(crowdsalePrompt);
            }}
          >
            <GoCreditCard className="" />
            Crowdsale Funding Mechanism Contract
          </button>
        </div>
        {/* AI response area */}
        <div className="max-w-[900px] mx-auto text-left mt-4">
          {/* {history.length > 0 && (
            <div className="mb-3">
              <div className="font-mono text-xs text-foreground/60 mb-2">Previous chats</div>
              <div className="space-y-2">
                {history.slice(0, 5).map((h, idx) => (
                  <div key={idx} className="bg-[#18181866] border border-foreground/15 rounded-lg p-3">
                    <div className="font-mono text-xs text-foreground/80">Q: {h.question}</div>
                    <div className="font-mono text-xs text-foreground/60 mt-1 line-clamp-2">A: {h.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          )} */}
          {/* {loading && (
            <div className="text-foreground/70 font-mono text-sm">
              Thinking…
            </div>
          )} */}
          {error && (
            <div className="text-red-400 font-mono text-sm">{error}</div>
          )}
          {answer && (
            <div className="bg-[#18181888] border border-foreground/20 rounded-xl p-4 font-mono text-sm whitespace-pre-wrap">
              {answer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

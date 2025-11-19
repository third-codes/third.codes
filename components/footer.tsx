"use client";
import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

export const Footer = () => {
  const pathname = usePathname();
  if (pathname?.startsWith("/sol")) {
    return null;
  }
  const year = new Date().getFullYear();
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [newsletterMsg, setNewsletterMsg] = useState<string>("");
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
  return (
    <footer className="border-t mt-[100px] border-[#fff2] bg-black">
      <div className="mx-auto w-full max-w-[1100px] px-5 sm:px-8 py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="mr-10">
            <img src="./thirdcodes.png" className="w-12 mt-6" />
            <Link href="/" className="flex items-center">
              {/* <Logo className="w-[100px] md:w-[120px]" /> */}
              <span className="text-foreground font-mono text-lg">
                third.codes
              </span>
              <p
                style={{
                  backgroundImage:
                    "linear-gradient(-225deg, #FF057C 0%, #8D0B93 50%, #321575 100%)",
                }}
                className=" ml-1 font-mono text-[10px] text-white px-1 rounded-[2px]"
              >
                beta
              </p>
            </Link>
            <p className="text-foreground/60 font-mono text-xs mt-2">
              Build and launch Web3 smart contracts with AI.
            </p>
            <p className="text-foreground/50 mt-2 whitespace-nowrap font-mono text-[11px]">
              # We just launched and are in beta
            </p>
          </div>
          {/* Swap: Deploy Now! column here */}
          <div>
            <h4 className="text-foreground/80 font-mono  mb-6 text-sm">
              # Deploy Now
            </h4>
            <ul className="space-y-4">
              {smartContractTemplates.map((t) => (
                <li key={t.title} className="">
                  <div className="text-foreground/60 hover:text-foreground/100 font-mono text-xs">
                    {t.title}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-foreground/80 font-mono  mb-5 text-sm">
              # Company
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/enterprise"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  Enterprise
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  Pricing
                </Link>
              </li>
              <li>
                {/* Students link removed per request */}
              </li>
              <li>
                <a
                  href="https://x.com/thirdcodes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/thirdcodes"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          {/* Swap: Contact column moved here */}
          <div>
            <h4 className="text-foreground/80 font-mono mb-5 text-sm">
             # Contact
            </h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="mailto:feedback@third.codes"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  Feedback
                </a>
              </li>
              <li>
                <a
                  href="mailto:partnerships@third.codes"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  Partnerships
                </a>
              </li>
              <li>
                <a
                  href="mailto:support@third.codes"
                  className="text-foreground/60 hover:text-foreground/100 font-mono text-xs"
                >
                  Support
                </a>
              </li>
              <li>{/* Newsletter mailto link removed as per request */}</li>
            </ul>
            <div className="mt-4">
              <div className="text-foreground/70 font-mono text-xs mb-2">
                Newsletter
              </div>
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const email = newsletterEmail.trim().toLowerCase();
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(email)) {
                    setNewsletterStatus("error");
                    setNewsletterMsg("ایمیل نامعتبر است");
                    return;
                  }
                  try {
                    setNewsletterStatus("loading");
                    setNewsletterMsg("");
                    const res = await fetch("/api/newsletter", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ email }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data?.ok) {
                      setNewsletterStatus("success");
                      setNewsletterMsg("ثبت شد! ما به شما ایمیل می‌زنیم.");
                      setNewsletterEmail("");
                    } else {
                      setNewsletterStatus("error");
                      setNewsletterMsg(data?.error || "خطا در ثبت ایمیل");
                    }
                  } catch {
                    setNewsletterStatus("error");
                    setNewsletterMsg("خطای سرور");
                  }
                }}
              >
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 outline-none bg-[#ffffff05] border border-foreground/20 rounded-md p-2 font-mono text-xs text-white"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-xs disabled:opacity-60"
                  disabled={newsletterStatus === "loading"}
                >
                  {newsletterStatus === "loading" ? "…" : "Subscribe"}
                </button>
              </form>
              {newsletterMsg ? (
                <div
                  className={`mt-2 font-mono text-[11px] ${
                    newsletterStatus === "success"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {newsletterMsg}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-[#fff1] flex items-center justify-between flex-wrap gap-3">
          <span className="text-foreground/50 font-mono text-[11px]">
            © {year} third.codes — All rights reserved.
          </span>
          <div className="flex gap-4">
            <Link
              href="/privacy"
              className="text-foreground/60 hover:text-foreground/100 font-mono text-[11px]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-foreground/60 hover:text-foreground/100 font-mono text-[11px]"
            >
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

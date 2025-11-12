"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Marquee from "react-fast-marquee";
import Link from "next/link";
import { GoCopy } from "react-icons/go";
import { toast } from "sonner";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// Lazy client-side WebGL background (same pattern as Hero)
const LazyGL = dynamic(
  () => import("@/components/gl").then((mod) => ({ default: mod.GL })),
  { ssr: false }
);

export default function EnterprisePage() {
  const router = useRouter();
  const [hovering, setHovering] = useState(false);
  const [allowGL, setAllowGL] = useState(true);

  // Respect reduced motion preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      const prefersReducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
      if (prefersReducedMotion) setAllowGL(false);
    }
  }, []);

  return (
    <div className="overflow-x-hidden min-h-[900px]">
      {allowGL && <LazyGL hovering={hovering} />}
      <div className="max-w-[1150px] relative z-5 mx-auto px-4 mt-10 mb-26">
        <h1 className="text-white font-mono mt-[250px] text-center text-6xl">
          Enterprise
        </h1>
        <p className="text-foreground/60 font-mono text-center text-sm mt-4">
          Work with an expert team to design, build, and deploy your custom
          smart contracts.
        </p>
        <div className="flex items-center mt-8 justify-center gap-2">
          <Link href={"mailto:enterprise@third.codes"}>
            <button className="bg-white font-mono  hover:opacity-80 cursor-pointer py-2 mx-auto  block px-8 text-black rounded-full text-sm">
              Let's Talk!
            </button>
          </Link>{" "}
          <span
            className="bg-[#fff1] text-xs rounded-md backdrop-blur-sm border border-[#fff1] px-2 py-[2px] text-foreground/60 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={async () => {
              try {
                await (navigator.clipboard?.writeText?.(
                  "enterprise@third.codes"
                ) || Promise.resolve());
                toast.success("Email copied to clipboard");
              } catch {
                toast.error("Failed to copy email");
              }
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter" || e.key === " ") {
                try {
                  await (navigator.clipboard?.writeText?.(
                    "enterprise@third.codes"
                  ) || Promise.resolve());
                  toast.success("Email copied to clipboard");
                } catch {
                  toast.error("Failed to copy email");
                }
              }
            }}
          >
            enterprise@third.codes
          </span>
        </div>
        <Marquee
          speed={35}
          pauseOnHover
          gradient
          gradientColor="#000000"
          gradientWidth={80}
          className="mt-20"
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
        {/* Enterprise inquiry form */}
        <div className="max-w-[800px] mb-[-100px] mx-auto mt-16 bg-[#18181888] border border-foreground/20 rounded-xl p-6">
          <h3 className="text-white font-mono text-xl mb-4 text-center">Share your requirements</h3>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget as HTMLFormElement);
              const name = String(fd.get("name") || "").trim();
              const company = String(fd.get("company") || "").trim();
              const kind = String(fd.get("kind") || "").trim();
              const description = String(fd.get("description") || "").trim();
              if (!name || !company || !kind || !description) {
                toast.error("Please fill in all required fields");
                return;
              }
              try {
                const resp = await fetch("/api/enterprise", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ name, company, kind, description }),
                });
                if (!resp.ok) throw new Error("Bad status");
                (e.currentTarget as HTMLFormElement).reset();
                toast.success("Request sent. We'll get back to you soon.");
              } catch (err) {
                toast.error("Failed to submit. Please try again.");
              }
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs text-foreground/60 mb-1">Your Name</label>
                <input name="name" required className="w-full bg-[#18181855] border border-foreground/20 rounded-md p-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block font-mono text-xs text-foreground/60 mb-1">Company</label>
                <input name="company" required className="w-full bg-[#18181855] border border-foreground/20 rounded-md p-2 text-sm outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-xs text-foreground/60 mb-1">Contract/Dapp Type</label>
                <input name="kind" required placeholder="e.g., ERC20, Marketplace, Staking" className="w-full bg-[#18181855] border border-foreground/20 rounded-md p-2 text-sm outline-none" />
              </div>
              <div>
                <label className="block font-mono text-xs text-foreground/60 mb-1">Brief Description</label>
                <input name="description" required placeholder="One-line overview" className="w-full bg-[#18181855] border border-foreground/20 rounded-md p-2 text-sm outline-none" />
              </div>
            </div>
            <div>
              <label className="block font-mono text-xs text-foreground/60 mb-1">Details</label>
              <textarea name="description" required className="w-full bg-[#18181855] border border-foreground/20 rounded-md p-2 text-sm outline-none h-28" placeholder="Share requirements, timelines, networks, integrations..." />
            </div>
            <div className="flex justify-center">
              <button type="submit" className="px-6 py-2 rounded-full bg-white text-black text-sm font-mono hover:opacity-80 cursor-pointer">
                Send Request
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

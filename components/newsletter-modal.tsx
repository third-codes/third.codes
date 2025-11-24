"use client";
import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";

export default function NewsletterModal() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    try {
      const walletConnected = typeof window !== "undefined" ? localStorage.getItem("walletConnected") === "true" : false;
      if (walletConnected) return;
      const hasCookie = typeof document !== "undefined" && document.cookie.includes("newsletter_subscribed=true");
      if (hasCookie) return;
      const subscribedAt = typeof window !== "undefined" ? Number(localStorage.getItem("newsletterSubscribedAt") || "0") : 0;
      if (subscribedAt > 0) return;
      const dismissedUntil = typeof window !== "undefined" ? Number(localStorage.getItem("newsletterDismissedUntil") || "0") : 0;
      if (dismissedUntil && now < dismissedUntil) return;
      const t = setTimeout(() => setOpen(true), 0);
      return () => clearTimeout(t);
    } catch {}
  }, [now]);

  const onClose = () => {
    try {
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      const until = Date.now() + twoDaysMs;
      localStorage.setItem("newsletterDismissedUntil", String(until));
    } catch {}
    setOpen(false);
  };

  const onSubmit = async () => {
    if (loading) return;
    const v = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(v)) {
      toast.error("Invalid email");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: v }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok) {
        try {
          localStorage.setItem("newsletterSubscribedAt", String(Date.now()));
          localStorage.setItem("newsletterEmail", v);
          document.cookie = `newsletter_subscribed=true; path=/; max-age=${60 * 60 * 24 * 365}`;
        } catch {}
        toast.success("Subscribed successfully");
        setOpen(false);
      } else {
        toast.error(data?.error || "Subscription failed");
      }
    } catch {
      toast.error("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? setOpen(true) : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[1000]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] max-w-[420px] rounded-xl border border-foreground/20 bg-[#0b0b0b] p-4 shadow-xl z-[1001]">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-mono text-sm text-foreground">Subscribe to Newsletter</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close" className="text-foreground/60 hover:text-foreground/100 font-mono text-xs" onClick={onClose}>×</button>
            </Dialog.Close>
          </div>
          <div className="mt-2 font-mono text-[11px] text-foreground/70">Get updates on new features and templates.</div>
          <div className="mt-3 flex gap-2">
            <input
              type="email"
              placeholder="Your email"
              className="flex-1 outline-none bg-[#ffffff05] border border-foreground/20 rounded-md p-2 font-mono text-xs text-white"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button
              className="px-3 py-2 rounded-md bg-emerald-400 hover:bg-emerald-500 text-black font-mono text-xs disabled:opacity-60"
              onClick={onSubmit}
              disabled={loading}
            >
              {loading ? "…" : "Subscribe"}
            </button>
          </div>
          <div className="mt-2 font-mono text-[10px] text-foreground/50">We respect your privacy.</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
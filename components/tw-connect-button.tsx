"use client";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

type Props = {
  className?: string;
  style?: React.CSSProperties;
};

export default function TwConnectButton({ className, style }: Props) {
  const [address, setAddress] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [chainId, setChainId] = useState<number | null>(null);
  const [chainName, setChainName] = useState<string | null>(null);
  const [nativeSymbol, setNativeSymbol] = useState<string>("ETH");
  const [balance, setBalance] = useState<string | null>(null);
  const [infoLoading, setInfoLoading] = useState<boolean>(false);
  const [providers, setProviders] = useState<
    { id: string; name: string; provider: any }[]
  >([]);
  const [currentProvider, setCurrentProvider] = useState<any | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );

  const shortAddr = useMemo(
    () => (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null),
    [address]
  );

  // Detect available injected providers and select current provider
  useEffect(() => {
    const injected =
      typeof window !== "undefined" ? (window as any).ethereum : null;

    const infoFor = (p: any) => {
      const name = p?.isMetaMask
        ? "MetaMask"
        : p?.isCoinbaseWallet
        ? "Coinbase Wallet"
        : p?.isBraveWallet
        ? "Brave Wallet"
        : p?.isOkxWallet
        ? "OKX Wallet"
        : p?.isWalletConnect
        ? "WalletConnect"
        : p?.isTrust
        ? "Trust Wallet"
        : "Injected";
      const id = name.toLowerCase().replace(/\s+/g, "-");
      return { id, name };
    };

    const arr = Array.isArray(injected?.providers)
      ? (injected.providers as any[])
      : injected
      ? [injected]
      : [];
    const list = arr.map((p) => {
      const { id, name } = infoFor(p);
      return { id, name, provider: p };
    });
    setProviders(list);

    // Select persisted provider or fallback to first
    const persisted =
      typeof window !== "undefined"
        ? localStorage.getItem("walletProvider")
        : null;
    const sel = list.find((x) => x.id === persisted) || list[0] || null;
    if (sel) {
      setSelectedProviderId(sel.id);
      setCurrentProvider(sel.provider);
      try {
        // Rebind window.ethereum to chosen provider for downstream consumers
        (window as any).ethereum = sel.provider;
      } catch {}
    } else {
      setSelectedProviderId(null);
      setCurrentProvider(null);
    }
  }, []);

  // Register account and chain listeners on the currently selected provider
  useEffect(() => {
    const ethereum =
      currentProvider ??
      (typeof window !== "undefined" ? (window as any).ethereum : null);

    const mirror = (addr: string | null, conn: boolean) => {
      setAddress(addr);
      setConnected(conn);
      if (typeof window === "undefined") return;
      try {
        localStorage.setItem("walletConnected", conn ? "true" : "false");
        if (addr && conn) {
          localStorage.setItem("walletAddress", addr);
          const maxAge = 60 * 60 * 24 * 30; // 30 days
          document.cookie = `walletAddress=${addr}; path=/; max-age=${maxAge}`;
        } else {
          localStorage.removeItem("walletAddress");
          document.cookie = "walletAddress=; path=/; max-age=0";
        }
      } catch {}
    };

    // Initialize from storage only if a provider exists AND has an active account
    // We still avoid prompting the user; eth_accounts does not trigger a prompt.
    (async () => {
      try {
        // If no provider or request API, ensure we are NOT marked connected
        if (!ethereum || typeof ethereum.request !== "function") {
          mirror(null, false);
          return;
        }
        const accs = (await ethereum.request({
          method: "eth_accounts",
        })) as string[];
        const hasActiveAccount = Array.isArray(accs) && accs.length > 0;
        const storedAddr =
          typeof window !== "undefined"
            ? localStorage.getItem("walletAddress")
            : null;
        const storedConn =
          typeof window !== "undefined"
            ? localStorage.getItem("walletConnected") === "true"
            : false;
        if (storedConn && storedAddr && hasActiveAccount) {
          mirror(storedAddr, true);
          // Immediately refresh network and balance after restoring from storage
          refreshWalletInfo(storedAddr).catch(() => {});
        } else {
          // Either provider missing or no active account; stay disconnected
          mirror(null, false);
        }
      } catch {
        mirror(null, false);
      }
    })();

    // Keep address in sync when user changes accounts in MetaMask (only if connected)
    const onAccountsChanged = (accs: string[]) => {
      const conn =
        typeof window !== "undefined" &&
        localStorage.getItem("walletConnected") === "true";
      if (!conn) return;
      const addr = accs?.[0] ?? null;
      mirror(addr, !!addr);
      // Refresh wallet info when account changes
      if (addr) {
        refreshWalletInfo(addr).catch(() => {});
      } else {
        setBalance(null);
      }
      if (!addr) {
        toast.info("Disconnected locally", {
          description: "To fully disconnect, manage connections in MetaMask.",
        });
      }
    };
    const onChainChanged = async () => {
      // Re-read network and balance on chain change
      if (connected && address) {
        await refreshWalletInfo(address);
      }
    };
    if (ethereum && typeof ethereum.on === "function") {
      ethereum.on("accountsChanged", onAccountsChanged);
      ethereum.on("chainChanged", onChainChanged);
    }
    return () => {
      if (ethereum && typeof ethereum.removeListener === "function") {
        ethereum.removeListener("accountsChanged", onAccountsChanged);
        ethereum.removeListener("chainChanged", onChainChanged);
      }
    };
  }, [currentProvider]);

  // Broadcast wallet connection state changes to other components
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (connected && address) {
        window.dispatchEvent(
          new CustomEvent("wallet:connected", { detail: { address } })
        );
      } else if (!connected) {
        window.dispatchEvent(new CustomEvent("wallet:disconnected"));
      }
    } catch {}
  }, [address, connected]);

  const symbolByChain: Record<number, string> = {
    1: "ETH",
    11155111: "ETH", // Sepolia
    137: "MATIC",
    10: "ETH", // Optimism uses ETH as gas
    8453: "ETH", // Base
    42161: "ETH", // Arbitrum
    56: "BNB",
    43114: "AVAX",
    1088: "METIS", // Metis Andromeda
    133717: "tMETIS", // Metis Hyperion Testnet
  };

  const nameByChain: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
    137: "Polygon",
    10: "Optimism",
    8453: "Base",
    42161: "Arbitrum One",
    56: "BNB Smart Chain",
    43114: "Avalanche C-Chain",
    1088: "Metis Andromeda",
    133717: "Hyperion Testnet",
  };

  // Params for adding networks if not present in MetaMask
  const chainParams: Record<
    number,
    {
      chainId: string;
      chainName: string;
      nativeCurrency: { name: string; symbol: string; decimals: number };
      rpcUrls: string[];
      blockExplorerUrls?: string[];
    }
  > = {
    1: {
      chainId: "0x1",
      chainName: "Ethereum Mainnet",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.ankr.com/eth"],
      blockExplorerUrls: ["https://etherscan.io"],
    },
    11155111: {
      chainId: "0xaa36a7",
      chainName: "Sepolia",
      nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://rpc.sepolia.org"],
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
    137: {
      chainId: "0x89",
      chainName: "Polygon",
      nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
      rpcUrls: ["https://polygon-rpc.com"],
      blockExplorerUrls: ["https://polygonscan.com"],
    },
    10: {
      chainId: "0xa",
      chainName: "Optimism",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://mainnet.optimism.io"],
      blockExplorerUrls: ["https://optimistic.etherscan.io"],
    },
    8453: {
      chainId: "0x2105",
      chainName: "Base",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://mainnet.base.org"],
      blockExplorerUrls: ["https://basescan.org"],
    },
    42161: {
      chainId: "0xa4b1",
      chainName: "Arbitrum One",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: ["https://arb1.arbitrum.io/rpc"],
      blockExplorerUrls: ["https://arbiscan.io"],
    },
    56: {
      chainId: "0x38",
      chainName: "BNB Smart Chain",
      nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
      rpcUrls: ["https://bsc-dataseed.binance.org"],
      blockExplorerUrls: ["https://bscscan.com"],
    },
    43114: {
      chainId: "0xa86a",
      chainName: "Avalanche C-Chain",
      nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
      rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"],
      blockExplorerUrls: ["https://snowtrace.io"],
    },
    1088: {
      chainId: "0x440",
      chainName: "Metis Andromeda",
      nativeCurrency: { name: "Metis", symbol: "METIS", decimals: 18 },
      rpcUrls: ["https://andromeda.metis.io/?owner=1088"],
      blockExplorerUrls: ["https://andromeda-explorer.metis.io"],
    },
    133717: {
      chainId: "0x20a55",
      chainName: "Hyperion Testnet",
      nativeCurrency: { name: "Test Metis", symbol: "tMETIS", decimals: 18 },
      rpcUrls: ["https://hyperion-testnet.metisdevops.link"],
      blockExplorerUrls: ["https://hyperion-testnet-explorer.metisdevops.link"],
    },
  };

  const refreshWalletInfo = async (addr?: string | null) => {
    try {
      const ethereum =
        currentProvider ??
        (typeof window !== "undefined" ? (window as any).ethereum : null);
      if (!ethereum) return;
      const provider = new ethers.BrowserProvider(ethereum);
      setInfoLoading(true);
      const net = await provider.getNetwork();
      const cid = Number(net.chainId);
      setChainId(cid);
      const resolvedName =
        nameByChain[cid] ??
        (net.name && net.name !== "unknown" ? net.name : `Chain #${cid}`);
      setChainName(resolvedName);
      setNativeSymbol(symbolByChain[cid] ?? "ETH");
      const targetAddr = addr ?? address;
      if (targetAddr) {
        const bal = await provider.getBalance(targetAddr);
        const formatted = ethers.formatEther(bal);
        // Limit to 5 decimal places for display
        const [intPart, decPartRaw] = formatted.split(".");
        const decPart = (decPartRaw ?? "0").slice(0, 5);
        setBalance(`${intPart}.${decPart}`);
      } else {
        setBalance(null);
      }
    } catch {
      // Ignore errors in info refresh
    } finally {
      setInfoLoading(false);
    }
  };

  // Refresh network and balance whenever connection/address state becomes available
  useEffect(() => {
    if (connected && address) {
      // slight defer to ensure MetaMask provider is initialized
      const t = setTimeout(() => {
        refreshWalletInfo(address).catch(() => {});
      }, 0);
      return () => clearTimeout(t);
    } else {
      // clear displayed info when disconnected
      setBalance(null);
      setChainId(null);
      setChainName(null);
    }
  }, [connected, address]);

  const handleConnect = async () => {
    const ethereum =
      currentProvider ??
      (typeof window !== "undefined" ? (window as any).ethereum : null);
    // Only proceed if MetaMask is installed and available
    if (
      !ethereum ||
      typeof ethereum.request !== "function" ||
      !ethereum.isMetaMask
    ) {
      toast.error("MetaMask wallet not found. Please install MetaMask.");
      return;
    }
    try {
      setLoading(true);
      // Ask for permissions so user can pick an account explicitly
      try {
        await ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {}
      const accs = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const addr = accs?.[0] ?? null;
      if (addr) {
        setAddress(addr);
        setConnected(true);
        localStorage.setItem("walletAddress", addr);
        localStorage.setItem("walletConnected", "true");
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        document.cookie = `walletAddress=${addr}; path=/; max-age=${maxAge}`;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("wallet:connected", { detail: { address: addr } })
            );
          }
        } catch {}
        toast.success("Wallet connected", {
          description: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
        });
        // Load network and balance
        await refreshWalletInfo(addr);
      } else {
        toast.error("Connection failed", {
          description: "No account returned by provider.",
        });
      }
    } catch (e: any) {
      const msg = e?.message || String(e) || "Connection error";
      toast.error("Connection error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    // MetaMask does not support programmatic disconnect; clear local state and storage
    setAddress(null);
    setConnected(false);
    try {
      localStorage.removeItem("walletAddress");
      localStorage.setItem("walletConnected", "false");
      document.cookie = "walletAddress=; path=/; max-age=0";
      // Attempt to revoke permissions so user can re-select account next time
      const ethereum =
        currentProvider ??
        (typeof window !== "undefined" ? (window as any).ethereum : null);
      try {
        if (ethereum && typeof ethereum.request === "function") {
          await ethereum.request({
            method: "wallet_revokePermissions",
            params: [{ eth_accounts: {} }],
          });
        }
      } catch {}
      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("wallet:disconnected"));
        }
      } catch {}
    } catch {}
    toast.info("Disconnected locally", {
      description: "To fully disconnect, manage connections in MetaMask.",
    });
  };

  const handleSwitch = async () => {
    const ethereum =
      currentProvider ??
      (typeof window !== "undefined" ? (window as any).ethereum : null);
    if (!ethereum || typeof ethereum.request !== "function") {
      toast.error("MetaMask not detected.");
      return;
    }
    try {
      setLoading(true);
      try {
        await ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }],
        });
      } catch {}
      const accs = (await ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      const addr = accs?.[0] ?? null;
      if (addr) {
        setAddress(addr);
        setConnected(true);
        localStorage.setItem("walletAddress", addr);
        localStorage.setItem("walletConnected", "true");
        const maxAge = 60 * 60 * 24 * 30; // 30 days
        document.cookie = `walletAddress=${addr}; path=/; max-age=${maxAge}`;
        try {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("wallet:connected", { detail: { address: addr } })
            );
          }
        } catch {}
        toast.success("Account switched", {
          description: `${addr.slice(0, 6)}...${addr.slice(-4)}`,
        });
        await refreshWalletInfo(addr);
      } else {
        toast.error("Switch failed", { description: "No account selected." });
      }
    } catch (e: any) {
      const msg = e?.message || String(e) || "Switch error";
      toast.error("Switch error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  const switchNetwork = async (targetChainId: number) => {
    const ethereum =
      currentProvider ??
      (typeof window !== "undefined" ? (window as any).ethereum : null);
    if (!ethereum || typeof ethereum.request !== "function") {
      toast.error("MetaMask not detected.");
      return;
    }
    try {
      setLoading(true);
      const targetHex =
        chainParams[targetChainId]?.chainId ??
        `0x${targetChainId.toString(16)}`;
      try {
        await ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: targetHex }],
        });
      } catch (err: any) {
        if (err?.code === 4902 && chainParams[targetChainId]) {
          // Chain not added; attempt to add
          await ethereum.request({
            method: "wallet_addEthereumChain",
            params: [chainParams[targetChainId]],
          });
        } else {
          throw err;
        }
      }
      // Update local info after switching
      await refreshWalletInfo(address ?? undefined);
      toast.success("Network switched", {
        description: nameByChain[targetChainId] ?? String(targetChainId),
      });
    } catch (e: any) {
      const msg = e?.message || String(e) || "Switch network error";
      toast.error("Switch network error", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  // Switch the injected provider and prompt user to connect
  const selectProvider = async (id: string) => {
    if (id === selectedProviderId) return;
    const next = providers.find((p) => p.id === id);
    if (!next) return;
    try {
      setSelectedProviderId(next.id);
      setCurrentProvider(next.provider);
      if (typeof window !== "undefined") {
        (window as any).ethereum = next.provider;
        localStorage.setItem("walletProvider", next.id);
      }
      // Clear address until the user connects on the new provider
      setAddress(null);
      setConnected(false);
      setBalance(null);
      setChainId(null);
      setChainName(null);
      // Prompt connect flow on the new provider
      await handleConnect();
    } catch {}
  };

  // Detect MetaMask availability among injected providers
  const metamaskAvailable = useMemo(() => {
    try {
      return providers.some(
        (p) =>
          p.id === "metamask" &&
          typeof (p as any)?.provider?.request === "function"
      );
    } catch {
      return false;
    }
  }, [providers]);

  return (
    <div
      style={style}
      className={connected ? "flex items-center gap-2" : undefined}
    >
      {connected && address ? (
        <>
          {/* Wallet dropdown */}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="flex items-center gap-2 px-3 py-1 rounded-md bg-[#fff1] hover:bg-[#fff2] font-mono text-sm border border-[#fff3] outline-none focus:outline-none">
                {selectedProviderId === "metamask" ? (
                  <img
                    src="/metamask-icon.webp"
                    alt="MetaMask"
                    className="w-4 h-4"
                  />
                ) : (
                  <img
                    src="/metamask-icon.webp"
                    alt="MetaMask"
                    className="w-4 h-4"
                  />
                )}
                {shortAddr}
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content
              side="bottom"
              align="start"
              className="min-w-[220px] rounded-md border border-[#fff2] bg-black/70 backdrop-blur p-2 shadow-xl outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0"
            >
              <div className="px-2 py-1 text-xs text-foreground/70">Wallet</div>
              <DropdownMenu.Separator className="my-1 h-px bg-[#fff1]" />
              <DropdownMenu.Item
                className="px-2 py-1 rounded-md text-sm text-foreground/90 cursor-default outline-none focus:outline-none focus-visible:outline-none"
                disabled
              >
                Provider:{" "}
                {providers.find((p) => p.id === selectedProviderId)?.name ??
                  "Unknown"}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="px-2 py-1 rounded-md text-sm text-foreground/90 cursor-default outline-none focus:outline-none focus-visible:outline-none"
                disabled
              >
                Network:{" "}
                {chainName ?? (chainId ? `Chain #${chainId}` : "Network")}{" "}
                {chainId ? `(#${chainId})` : ""}
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="px-2 py-1 rounded-md text-sm text-foreground/90 cursor-default outline-none focus:outline-none focus-visible:outline-none"
                disabled
              >
                Balance: {infoLoading ? "…" : balance ?? "—"} {nativeSymbol}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-[#fff1]" />
              {/* Provider switcher */}
              {providers.length > 1 && (
                <DropdownMenu.Sub>
                  <DropdownMenu.SubTrigger className="px-2 py-1 rounded-md text-sm text-foreground/90 hover:bg-[#fff1] cursor-pointer outline-none focus:outline-none focus-visible:outline-none">
                    Switch provider…
                  </DropdownMenu.SubTrigger>
                  <DropdownMenu.SubContent
                    sideOffset={4}
                    className="min-w-[220px] rounded-md border border-[#fff2] bg-black/70 backdrop-blur p-2 shadow-xl"
                  >
                    {providers.map((p) => (
                      <DropdownMenu.Item
                        key={p.id}
                        onSelect={(e) => {
                          e.preventDefault();
                          selectProvider(p.id);
                        }}
                        className="px-2 py-1 rounded-md text-sm text-foreground/90 hover:bg-[#fff1] cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
                      >
                        {p.name} {p.id === selectedProviderId ? "✓" : ""}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Sub>
              )}
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  handleSwitch();
                }}
                className="px-2 py-1 rounded-md text-sm text-foreground/90 hover:bg-[#fff1] cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
              >
                Switch wallet…
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  handleDisconnect();
                }}
                className="px-2 py-1 rounded-md text-sm text-red-400 hover:bg-red-500/10 cursor-pointer outline-none focus:outline-none focus-visible:outline-none"
              >
                Disconnect
              </DropdownMenu.Item>
          </DropdownMenu.Content>
          </DropdownMenu.Root>

          {/* Passive network badge reflecting MetaMask’s active network */}
          {/* <span
            aria-label="Active Network"
            className="px-2 py-[6px] border border-[#fff3] rounded-md bg-[#fff1] font-mono text-xs text-foreground/80"
          >
            {chainName ?? (chainId ? `Chain #${chainId}` : "Network")} {chainId ? `(#${chainId})` : ""}
          </span> */}
        </>
      ) : metamaskAvailable ? (
        <button
          aria-label="Connect Wallet"
          className={
            className ??
            "px-3 py-[6px] border border-[#fff9] flex gap-2 items-center cursor-pointer  rounded-md bg-[#fff1] hover:bg-[#fff2] font-mono text-sm outline-none focus:outline-none"
          }
          onClick={handleConnect}
          disabled={loading}
        >
          <img src="/metamask-icon.webp" alt="MetaMask" className="w-4 h-4" />
          {loading ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <div
          aria-label="MetaMask required"
          className={
            className ??
            "px-3 py-[6px] border cursor-pointer border-[#fff9] flex gap-2 items-center rounded-md bg-[#fff1] font-mono text-sm text-foreground/80"
          }
          onClick={() =>
            toast.error("MetaMask wallet not found. Please install MetaMask.")
          }
        >
          <img src="/metamask-icon.webp" alt="MetaMask" className="w-4 h-4" />
          Connect Wallet
        </div>
      )}
    </div>
  );
}

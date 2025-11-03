import { NextResponse } from "next/server";

export const revalidate = 3600; // cache for 1 hour

function normalizeReleaseFile(file: string): string {
  // example: soljson-v0.8.30+commit.73712a01.js -> 0.8.30+commit.73712a01
  return file
    .replace(/^soljson-v?/, "")
    .replace(/\.js$/, "");
}

export async function GET() {
  try {
    const res = await fetch("https://binaries.soliditylang.org/bin/list.json", {
      // avoid stale results
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch Solidity releases (${res.status})`);
    }
    const data = await res.json();
    const releases: Record<string, string> = data?.releases || {};
    // releases is a map: { "0.8.30": "soljson-v0.8.30+commit.73712a01.js", ... }
    const versions = Object.values(releases)
      .map((f) => normalizeReleaseFile(String(f || "")))
      // keep only valid-looking versions
      .filter((v) => /^(0|1)\.\d+\.\d+(?:[^\s]*)$/.test(v));

    // prefer descending semver order if possible
    const semverSort = (a: string, b: string) => {
      const ax = a.split("+commit")[0];
      const bx = b.split("+commit")[0];
      const pa = ax.split(".").map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
      const pb = bx.split(".").map((x) => parseInt(x.replace(/\D/g, ""), 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const da = pa[i] || 0;
        const db = pb[i] || 0;
        if (da !== db) return db - da; // descending
      }
      return 0;
    };

    versions.sort(semverSort);

    // include local/latest head option
    const final = ["latest local version", ...versions];
    return NextResponse.json({ versions: final });
  } catch (e: any) {
    // fall back to a minimal safe list if remote fails
    const fallback = [
      "latest local version",
      "0.8.30+commit.73712a01",
      "0.8.29+commit.ab55807c",
      "0.8.28+commit.7893614a",
      "0.8.27+commit.40a35a09",
      "0.8.26+commit.8a97fa7a",
      "0.8.25+commit.b61c2a91",
      "0.8.24+commit.e11b9ed9",
      "0.8.23+commit.f704f362",
      "0.8.22+commit.4fc1097e",
    ];
    return NextResponse.json(
      { versions: fallback, error: e?.message || "Failed to load versions" },
      { status: 200 }
    );
  }
}
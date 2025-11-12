"use client";
import Link from "next/link";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import dynamic from "next/dynamic";
// Wallet connect button is lazy-loaded to minimize initial JS cost
const WalletButton = dynamic(() => import("./tw-connect-button"), {
  ssr: false,
});

export const Header = () => {
  // Wallet address is mirrored by the wallet button component
  return (
    <div className="fixed bg-black z-50 py-5 md:py-5  top-0 left-0 w-full">
      <header className="flex items-center justify-between container">
        <Link href="/" className="flex items-center">
          {/* <Logo className="w-[100px] md:w-[120px]" /> */}
          <span className="text-foreground font-mono text-lg">
            third.codes
         
          </span>
          <p
            style={{
              backgroundImage:
                "linear-gradient(-225deg, #FF057C 0%, #8D0B93 50%, #321575 100%);",
            }}
            className=" ml-1 font-mono text-[10px] text-white px-1 rounded-[2px]"
          >
            beta
          </p>
        </Link>
        <nav className="flex max-lg:hidden absolute left-1/2 -translate-x-1/2 items-center justify-center gap-x-10">
          {["Enterprise", "Pricing", "FAQ"].map(
            (item) => (
              <Link
                className=" inline-block text-sm font-mono text-foreground/60 hover:text-foreground/100 duration-150 transition-colors ease-out outline-none focus:outline-none"
                href={`#${item.toLowerCase()}`}
                key={item}
              >
                {item}
              </Link>
            )
          )}
          <a
            className=" inline-block text-sm font-mono text-foreground/60 hover:text-foreground/100 duration-150 transition-colors ease-out outline-none focus:outline-none"
            href="mailto:feedback@third.codes"
          >
            Feedback
          </a>
          <a
            className=" inline-block text-sm font-mono text-foreground/60 hover:text-foreground/100 duration-150 transition-colors ease-out outline-none focus:outline-none"
            href="mailto:support@third.codes"
          >
            Support
          </a>
        </nav>
        <div>
          <WalletButton />
        </div>
        <MobileMenu />
      </header>
    </div>
  );
};

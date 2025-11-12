import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "rc-tree/assets/index.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { Toaster } from "sonner";
import ChatFloat from "@/components/chat-float";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["100","200","300","400","500","600","700","800"],
  style: ["normal","italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Third Codes",
    template: "%s · Third Codes",
  },
  description: "Build and launch Web3 smart contracts with AI.",
  applicationName: "Third Codes",
  generator: "v0.app",
  keywords: [
    "Web3",
    "Solidity",
    "Smart Contracts",
    "AI",
    "Deploy",
    "MetaMask",
    "Third Codes",
  ],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    url: "/",
    title: "Third Codes",
    description: "Build and launch Web3 smart contracts with AI.",
    siteName: "Third Codes",
    images: [
      { url: "/thirdcodes.png", width: 1200, height: 630, alt: "Third Codes" },
      { url: "/third.png", width: 1200, height: 630, alt: "Third Codes" },
    ],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Third Codes",
    description: "Build and launch Web3 smart contracts with AI.",
    site: "@thirdcodes",
    images: ["/thirdcodes.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  themeColor: "#000000",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${jetbrainsMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Header />
        {children}
        <Footer />
        <ChatFloat />
        <Toaster richColors position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}

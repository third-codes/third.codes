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
  title: "Third Codes",
  description: "Build and launch Web3 smart contracts with AI",
  generator: "v0.app",
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

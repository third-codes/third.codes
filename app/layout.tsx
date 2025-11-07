import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "rc-tree/assets/index.css";
import { Header } from "@/components/header";
import QueryProvider from "@/components/query-provider";
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
  title: "Skal Ventures",
  description: "Investment strategies that outperform the market",
    generator: 'v0.app'
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
        <QueryProvider>
          {children}
          <ChatFloat />
        </QueryProvider>
        <Toaster richColors position="bottom-right" theme="dark" />
      </body>
    </html>
  );
}

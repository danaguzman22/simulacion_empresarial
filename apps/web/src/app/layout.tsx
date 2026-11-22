import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { currentSessionKey } from "@/features/session/application/session-key";
import { SessionWatch } from "@/features/session/components/SessionWatch";
import { StaleAppNotice } from "@/features/app-version/components/StaleAppNotice";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXUS",
  description: "Plataforma educativa de simulación empresarial.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const sessionKey = await currentSessionKey();
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}<StaleAppNotice /><SessionWatch sessionKey={sessionKey} /></body>
    </html>
  );
}

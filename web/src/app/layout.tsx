import type { Metadata } from "next";
import type React from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeToggle } from "../components/ui/theme-toggle";
import { AuthProvider } from "../components/auth/auth-provider";
import { ApplicationShell } from "../components/auth/application-shell";
import { THEME_BOOTSTRAP_SCRIPT } from "../lib/client/theme-preference";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXUS | Financial stability",
  description: "Secure borrower, investor, and administrator services.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script
          id="nexus-theme-bootstrap"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
        />
        <AuthProvider>
          <ThemeToggle />
          <ApplicationShell demoMode={process.env.NEXUS_DEMO_MODE === "true"}>{children}</ApplicationShell>
        </AuthProvider>
      </body>
    </html>
  );
}

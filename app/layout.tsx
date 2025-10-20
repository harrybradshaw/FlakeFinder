import React, { Suspense } from "react";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FlakeFinder",
  description: "Monitor your Playwright test results and trends over time",
  generator: "Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <Suspense fallback={null}>
      <ClerkProvider>
        <html lang="en">
          <body className={`font-sans antialiased`}>
            <AppHeader />
            {children}
          </body>
        </html>
      </ClerkProvider>
    </Suspense>
  );
}

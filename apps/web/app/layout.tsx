import type { Metadata } from "next";
import { Instrument_Serif, Onest } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { loadAllPlugins } from "@library/shared-server";

import "@library/tailwind-config/globals.css";

import type { Viewport } from "next";
import React from "react";
import Providers from "@/lib/providers";
import { getUserLocalSettings } from "@/lib/userLocalSettings/userLocalSettings";
import { getServerAuthSession } from "@/server/auth";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "sonner";

import { clientConfig } from "@library/shared/config";

await loadAllPlugins();

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: "italic",
  display: "swap",
  variable: "--font-display",
  fallback: ["serif"],
});

const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-body",
  fallback: ["sans-serif"],
});

export const metadata: Metadata = {
  title: "Library",
  applicationName: "Library",
  description:
    "The Bookmark Everything app. Hoard links, notes, and images and they will get automatically tagged AI.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Library",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerAuthSession();
  const userSettings = await getUserLocalSettings();
  const isRTL = userSettings.lang === "ar";
  return (
    <html
      lang={userSettings.lang}
      dir={isRTL ? "rtl" : "ltr"}
      suppressHydrationWarning
      className={`${instrumentSerif.variable} ${onest.variable}`}
    >
      <body className={`${onest.variable} ${instrumentSerif.variable} font-body`}>
        <NuqsAdapter>
          <Providers
            session={session}
            clientConfig={clientConfig}
            userLocalSettings={await getUserLocalSettings()}
          >
            {children}
            <ReactQueryDevtools initialIsOpen={false} />
          </Providers>
          <Toaster />
        </NuqsAdapter>
      </body>
    </html>
  );
}

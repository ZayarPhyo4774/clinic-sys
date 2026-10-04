import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ClinicSys",
    template: "%s · ClinicSys",
  },
  description: "Premium clinic management workspace for modern healthcare teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

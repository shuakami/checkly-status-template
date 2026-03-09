import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { siteConfig } from "@/lib/site-config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: siteConfig.brand.siteName,
  description: siteConfig.brand.description,
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "64x64" }],
    shortcut: [{ url: "/icon", type: "image/png", sizes: "64x64" }],
    apple: [{ url: "/icon", type: "image/png", sizes: "64x64" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={siteConfig.locale} className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}

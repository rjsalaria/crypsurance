import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ClickRipple from "@/components/ClickRipple";
import FrameGuard from "@/components/FrameGuard";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://crypsurance.io"),
  title: {
    default: "CrypSurance — Decentralized Cover for the On-Chain World",
    template: "%s | CrypSurance",
  },
  description:
    "Smart-contract powered cover with instant, trustless claim settlement. Join the protocol closing the $1T crypto protection gap, powered by the SURETY token.",
  openGraph: {
    title: "CrypSurance — Decentralized Cover for the On-Chain World",
    description:
      "Instant, trustless cover built on smart contracts. Parametric protection, community underwriting pools, and the SURETY token.",
    url: "https://crypsurance.io",
    siteName: "CrypSurance",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CrypSurance — Decentralized Cover for the On-Chain World",
    description:
      "Instant, trustless cover built on smart contracts. Powered by SURETY.",
  },
  // Invisible marker to confirm the push → GitHub Action → Hostinger deploy
  // pipeline is live. Check via view-source on crypsurance.io.
  other: {
    "deploy-check": "pipeline-verified-2026-07-22",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <FrameGuard />
        <ClickRipple />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

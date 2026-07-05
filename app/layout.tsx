import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

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
    default: "CrypSurance — Decentralized Insurance for the On-Chain World",
    template: "%s | CrypSurance",
  },
  description:
    "Smart-contract powered life and non-life insurance with instant, trustless claim settlement. Join the protocol closing the $1T crypto protection gap, powered by the SURE token.",
  openGraph: {
    title: "CrypSurance — Decentralized Insurance for the On-Chain World",
    description:
      "Instant, trustless insurance built on smart contracts. Life & non-life coverage, community underwriting pools, and the SURE token.",
    url: "https://crypsurance.io",
    siteName: "CrypSurance",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CrypSurance — Decentralized Insurance for the On-Chain World",
    description:
      "Instant, trustless insurance built on smart contracts. Powered by SURE.",
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
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

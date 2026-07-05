import type { Metadata } from "next";
import Blobs from "@/components/Blobs";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "App — Testnet Preview",
  description:
    "Price a policy with the coverage calculator, explore staking pools and preview the CrypSurance protocol on testnet.",
};

export default function AppPage() {
  return (
    <>
      <Blobs />
      <section className="pt-32 pb-16 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <AppShell />
        </div>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import { OperationsConsole } from "./operations-console";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Northstar Fintech Operations Console",
  description: "A unified internal console for KYC decisions, refund operations, and safe feature releases.",
};

export default function Home() {
  return (
    <OperationsConsole
      initialUser={{
        displayName: "Gandharv",
        email: "gandharv@northstar.internal",
      }}
    />
  );
}

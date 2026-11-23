import type { Metadata } from "next";
import type { ReactNode } from "react";

// The live page is a client component, so its title lives in this route-group layout.
export const metadata: Metadata = { title: "Live timing | F1 Companion" };

export default function LiveLayout({ children }: { children: ReactNode }) {
  return children;
}

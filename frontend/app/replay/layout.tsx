import type { Metadata } from "next";
import type { ReactNode } from "react";

// /replay is a client page, so its title lives in this route layout.
export const metadata: Metadata = { title: "Replay | F1 Companion" };

export default function ReplayLayout({ children }: { children: ReactNode }) {
  return children;
}

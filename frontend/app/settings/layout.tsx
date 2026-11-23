import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: "Status | F1 Companion" };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return children;
}

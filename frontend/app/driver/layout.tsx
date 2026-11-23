import type { Metadata } from "next";
import type { ReactNode } from "react";

// /driver is a client page; /driver/[code] overrides this with the driver's code.
export const metadata: Metadata = { title: "Drivers | F1 Companion" };

export default function DriverLayout({ children }: { children: ReactNode }) {
  return children;
}

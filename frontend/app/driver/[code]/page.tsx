import type { Metadata } from "next";
import { DriverDetail } from "@/components/driver/DriverDetail";

/**
 * Driver codes come from the live feed, so they can't be listed at build time.
 * The shell's nav reads the pathname, which is unknown for an unlisted param:
 * render this route on request instead of prerendering it.
 */
export const instant = false;

type Params = Promise<{ code: string }>;

/** Each driver page gets its own title, so tabs, history and the route announcer tell them apart. */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code: raw } = await params;
  let code = raw;
  try {
    code = decodeURIComponent(raw);
  } catch {
    // Malformed escape: show the raw segment.
  }
  // Codes are three letters; cap whatever was typed into the URL so the title stays short.
  const label = code.trim().slice(0, 12).toUpperCase() || "Driver";
  return { title: `${label} – Drivers | F1 Companion` };
}

export default function DriverPage({ params }: { params: Params }) {
  return <DriverDetail params={params} />;
}

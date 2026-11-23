import { DriverDetail } from "@/components/driver/DriverDetail";

/**
 * Driver codes come from the live feed, so they can't be listed at build time.
 * The shell's nav reads the pathname, which is unknown for an unlisted param:
 * render this route on request instead of prerendering it.
 */
export const instant = false;

export default function DriverPage({ params }: { params: Promise<{ code: string }> }) {
  return <DriverDetail params={params} />;
}

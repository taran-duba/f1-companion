"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUi } from "@/lib/ui";

/** Old address: replays now live in the source panel on the main screen. */
export default function ReplayRedirect() {
  const router = useRouter();
  const { openSources } = useUi();
  useEffect(() => {
    openSources("replay");
    router.replace("/");
  }, [openSources, router]);
  return <p className="pt-6 text-small text-muted">Opening the replay library…</p>;
}

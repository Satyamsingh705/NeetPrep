"use client";

import { useEffect, useState } from "react";
import { LiveUpdateListener } from "@/components/live-update-listener";
import { SiteHeader } from "@/components/site-header";

export function AppChrome() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <>
      <LiveUpdateListener />
      <SiteHeader />
    </>
  );
}
"use client";

import { useEffect } from "react";
import { cleanupStaleServiceWorkers } from "@/lib/sw-cleanup";

/**
 * App-startup service-worker hygiene. Renders nothing.
 * Removes provably-orphaned same-origin workers left behind by earlier
 * deployments on this origin (see sw-cleanup.ts). NoDue itself registers
 * no service worker, in development or production.
 */
export default function SwCleanup() {
  useEffect(() => {
    cleanupStaleServiceWorkers();
  }, []);

  return null;
}

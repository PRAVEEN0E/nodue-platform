import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NoDue Platform - Academic Clearance Portal",
    short_name: "NoDue",
    description: "NoDue Platform (NDCP) — One Portal. Zero Pending. Automated student clearance workflows and digital sign-offs.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
  };
}

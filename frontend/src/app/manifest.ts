import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NDCP - No Due Clearance Portal",
    short_name: "NDCP",
    description: "NDCP — One Portal. Zero Pending. Automated student clearance workflows and digital sign-offs.",
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

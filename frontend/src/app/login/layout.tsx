import type { Metadata } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nodue-platform.vercel.app";

export const metadata: Metadata = {
  title: "Sign In | NoDue Platform — Academic Clearance Portal",
  description:
    "Sign in to NoDue Platform (NDCP) — One Portal. Zero Pending. Secure clearance access for students, staff, advisors, and HODs.",
  alternates: {
    canonical: `${APP_URL}/login`,
  },
  openGraph: {
    title: "Sign In | NoDue Platform — Academic Clearance Portal",
    description:
      "NoDue Platform (NDCP) — One Portal. Zero Pending. Secure sign-in for students, faculty advisors, department heads, and academic staff.",
    url: `${APP_URL}/login`,
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

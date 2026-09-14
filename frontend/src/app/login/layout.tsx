import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | NDCP - No Due Clearance Portal",
  description:
    "Sign in to NDCP (No Due Clearance Portal) — One Portal. Zero Pending. Secure access for students, staff, advisors, and HODs.",
  alternates: {
    canonical: "https://nodue-platform.vercel.app/login",
  },
  openGraph: {
    title: "Sign In | NDCP - No Due Clearance Portal",
    description:
      "NDCP — One Portal. Zero Pending. Secure sign-in for students, faculty advisors, department heads, and academic staff.",
    url: "https://nodue-platform.vercel.app/login",
  },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

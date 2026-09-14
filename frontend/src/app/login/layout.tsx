import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Academic Clearance Portal",
  description:
    "Secure sign-in for students, faculty advisors, department heads, and academic staff on the NoDue platform.",
  alternates: {
    canonical: "https://nodue-platform.vercel.app/login",
  },
  openGraph: {
    title: "Sign In | NoDue Academic Clearance Portal",
    description:
      "Secure sign-in for students, faculty advisors, department heads, and academic staff.",
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

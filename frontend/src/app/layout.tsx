import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "../context/auth-context";
import SwCleanup from "../components/SwCleanup";
import { SW_CLEANUP_INLINE_SCRIPT } from "../lib/sw-cleanup";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://nodue-platform.vercel.app";

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "NoDue | Academic Clearance & University Management Platform",
    template: "%s | NoDue",
  },
  description:
    "Next-generation university academic clearance and administration platform. Streamline student clearance workflows, departmental approvals, digital no-due certificates, and institutional governance.",
  applicationName: "NoDue Academic Platform",
  keywords: [
    "NoDue",
    "academic clearance system",
    "student no due certificate",
    "university clearance portal",
    "college administration software",
    "online clearance portal",
    "departmental sign-off system",
    "hall ticket clearance",
    "university management platform",
  ],
  authors: [{ name: "NoDue Team" }],
  creator: "NoDue Academic Platform",
  publisher: "NoDue",
  verification: {
    google: "7mRLU3RClqs7gIZx9zoQL6DrMrjfo__SR5zfr_-5Om8",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "NoDue Academic Platform",
    title: "NoDue | Academic Clearance & University Management Platform",
    description:
      "Automate student clearances, track departmental approvals, and streamline academic administrative workflows with instant verification.",
  },
  twitter: {
    card: "summary_large_image",
    title: "NoDue | Academic Clearance & University Management Platform",
    description:
      "Automate student clearances, track departmental approvals, and streamline academic administrative workflows.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: APP_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "NoDue",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: APP_URL,
  description:
    "Next-generation academic clearance and management platform for colleges and universities to automate student sign-offs and approvals.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="google-site-verification"
          content="7mRLU3RClqs7gIZx9zoQL6DrMrjfo__SR5zfr_-5Om8"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
        {/* Parse-time stale-SW cleanup: runs before Next.js chunks so a broken
            worker cannot prevent this very cleanup from booting. */}
        <script dangerouslySetInnerHTML={{ __html: SW_CLEANUP_INLINE_SCRIPT }} />
        <AuthProvider>
          <SwCleanup />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

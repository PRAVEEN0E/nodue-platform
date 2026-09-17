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
    default: "NoDue Platform — Online Student No Due Clearance Portal (NDCP)",
    template: "%s | NoDue Platform",
  },
  description:
    "NoDue Platform (NDCP) — Official academic no due clearance portal for colleges and universities. Automate student clearances, departmental sign-offs, and hall ticket approvals online.",
  applicationName: "NoDue Platform",
  keywords: [
    "NoDue",
    "NoDue Platform",
    "NoDue portal",
    "NoDue clearance",
    "NDCP No Due",
    "No Due Clearance Portal",
    "online student no due clearance",
    "college no due certificate online",
    "academic clearance system",
    "university clearance portal",
    "departmental sign-off system",
    "hall ticket clearance portal",
    "One Portal Zero Pending",
  ],
  authors: [{ name: "NoDue Team" }],
  creator: "NoDue Academic Platform",
  publisher: "NoDue Platform",
  verification: {
    google: "7mRLU3RClqs7gIZx9zoQL6DrMrjfo__SR5zfr_-5Om8",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: APP_URL,
    siteName: "NoDue Platform — Academic Clearance Portal",
    title: "NoDue Platform — Online Student No Due Clearance Portal (NDCP)",
    description:
      "NoDue Platform (NDCP) — Automate student clearances, departmental sign-offs, and academic administrative workflows online. One Portal. Zero Pending.",
  },
  twitter: {
    card: "summary_large_image",
    title: "NoDue Platform — Online Student No Due Clearance Portal (NDCP)",
    description:
      "NoDue Platform (NDCP) — Automate student clearances, departmental sign-offs, and academic administrative workflows online.",
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
  name: "NoDue Platform - Academic Clearance Portal (NDCP)",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: APP_URL,
  description:
    "NoDue Platform (NDCP) — One Portal. Zero Pending. Next-generation academic clearance and management platform for colleges and universities to automate student sign-offs and approvals.",
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

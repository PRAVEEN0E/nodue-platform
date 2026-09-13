import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../context/auth-context";
import SwCleanup from "../components/SwCleanup";
import { SW_CLEANUP_INLINE_SCRIPT } from "../lib/sw-cleanup";

export const metadata: Metadata = {
  title: "NoDue | Academic Management",
  description: "University administration platform for departments, classrooms, and clearances",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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

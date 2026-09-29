import type { Metadata } from "next";

// Staff-only pages: name the operator and keep them out of search results.
export const metadata: Metadata = {
  title: "Staff sign in · La Gloire",
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

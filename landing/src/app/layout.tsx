import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flow AI Studio",
  description: "A dark, minimalist SaaS landing page for an AI video and image generation service.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

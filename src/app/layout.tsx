import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The World Is For Sale",
  description: "Claim a spot. Hold it. Anyone can take it for 1.5× your bid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

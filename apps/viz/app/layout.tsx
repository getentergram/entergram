import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Brain OS — entergram",
  description: "Explore an engineering memory as a living knowledge graph.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full bg-[var(--surface-0)] text-[var(--ink-primary)] antialiased">
        {children}
      </body>
    </html>
  );
}

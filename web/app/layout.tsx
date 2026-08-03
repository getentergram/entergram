import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Engram — Persistent memory for your AI coding agent",
  description:
    "Give Claude Code, Cursor, and Windsurf a persistent engineering memory — the decisions, rationale, and architecture of your codebase, on tap. In 5 minutes.",
  openGraph: {
    title: "Engram — Persistent memory for your AI coding agent",
    description:
      "The why behind your codebase, on tap for any AI agent. Learns from your git history. Local-first. Works with Claude Code, Cursor, and Windsurf.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}

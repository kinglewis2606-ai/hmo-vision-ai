import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "CoachHub — Football Team Management", description: "Simple football team management for coaches, players and parents." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body className="min-h-screen">{children}</body></html>; }

import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"CoachHub — Football Team Management",description:"Football team management for coaches, players and parents."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body className="min-h-screen">{children}</body></html>}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PanelPreferencesProvider } from "@/components/panel-preferences";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WooOps — Store Operations",
  icons: { icon: { url: "/wo.svg", type: "image/svg+xml" }, shortcut: "/wo.svg" },
  description: "Your store operations workspace.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={geistSans.variable + " " + geistMono.variable + " h-full antialiased"}>
      <body className="min-h-full"><PanelPreferencesProvider>{children}</PanelPreferencesProvider></body>
    </html>
  );
}

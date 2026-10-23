import type { Metadata } from "next";
import { publicPath } from "@/lib/public-path";
import "./globals.css";

const icon = publicPath("/favicon.svg");

export const metadata: Metadata = {
  title: "Fusion Table — Global inspiration. Local ingredients.",
  description: "Explore authored fusion recipes, smoking, grilling and BBQ. Choose a classic or build around a main ingredient, adapt the flavours and find ingredients at nearby shops.",
  icons: {
    icon,
    shortcut: icon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

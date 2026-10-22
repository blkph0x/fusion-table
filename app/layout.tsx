import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fusion Table — Global inspiration. Local ingredients.",
  description: "Explore authored fusion recipes, smoking, grilling and BBQ. Choose a classic or build around a main ingredient, adapt the flavours and find ingredients at nearby shops.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
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

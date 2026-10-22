import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fusion Table — Global inspiration. Local ingredients.",
  description: "Bring classic dishes together with regional flavours. Create your fusion recipe, find ingredients at nearby shops, and make it your own.",
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

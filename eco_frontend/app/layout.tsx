import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
export const metadata: Metadata = {
  title: "EcoFleet AI | Green Fleet Management",
  description:
    "Intelligent maritime fleet management, fuel analytics and green voyage optimization.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

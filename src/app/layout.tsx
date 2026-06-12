import type { Metadata } from "next";
import { Chivo_Mono, Saira } from "next/font/google";
import "./globals.css";

const saira = Saira({ subsets: ["latin"], variable: "--font-saira" });
const chivoMono = Chivo_Mono({ subsets: ["latin"], variable: "--font-chivo" });

export const metadata: Metadata = {
  title: "KloudArch Studio — Cloud Architecture Designer",
  description:
    "Open-source studio to design cloud architectures on a visual canvas, refine them with an AI copilot, and export Terraform.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${saira.variable} ${chivoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

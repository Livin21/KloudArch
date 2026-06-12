import type { Metadata } from "next";
import { Chivo_Mono, Saira } from "next/font/google";
import "./globals.css";

const saira = Saira({ subsets: ["latin"], variable: "--font-saira" });
const chivoMono = Chivo_Mono({ subsets: ["latin"], variable: "--font-chivo" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "KloudArch — Open-source cloud architecture studio",
    template: "%s",
  },
  description:
    "Design cloud architectures on a blueprint canvas, refine them with an AI copilot, and ship them — reviewable CloudFormation deploys or portable Terraform export. Open source, MIT licensed, bring your own keys.",
  openGraph: {
    title: "KloudArch — Open-source cloud architecture studio",
    description:
      "Design cloud architectures on a blueprint canvas, refine them with an AI copilot, and ship them — reviewable CloudFormation deploys or portable Terraform export.",
    images: ["/og.jpg"],
    type: "website",
  },
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

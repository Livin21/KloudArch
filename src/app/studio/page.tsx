import type { Metadata } from "next";
import Studio from "@/components/studio/Studio";

export const metadata: Metadata = {
  title: "Studio — KloudArch",
  description:
    "Draft cloud architectures on a blueprint canvas, refine them with an AI copilot, and export working Terraform.",
};

export default function StudioPage() {
  return <Studio />;
}

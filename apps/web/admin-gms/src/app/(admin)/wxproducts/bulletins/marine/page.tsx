import type { Metadata } from "next";
import { MarineBulletinEditor } from "@/components/wxproducts/marine-bulletin-editor";

export const metadata: Metadata = {
  title: "Marine Bulletin",
  description: "Marine weather bulletin — edit and preview",
};

export default function MarineBulletinPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          Marine Weather Bulletin
        </h1>
        <p className="text-muted-foreground text-sm">
          Fill in the form to preview the bulletin, then print or export.
        </p>
      </div>
      <MarineBulletinEditor />
    </div>
  );
}

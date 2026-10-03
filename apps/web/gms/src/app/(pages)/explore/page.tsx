import { SectionIndex } from "@/components/pages/section-index";
import { NAV_SECTIONS } from "@/lib/nav-sections";

const HREF = "/explore";

export const metadata = {
  title: NAV_SECTIONS.find((section) => section.href === HREF)?.label,
};

export default function Page() {
  return <SectionIndex href={HREF} />;
}

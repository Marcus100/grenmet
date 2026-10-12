import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";
import { ProductDesk } from "@/components/wxproducts/product-desk";

export const metadata = { title: "Alerts" };
type BulletinKind = keyof typeof BULLETIN_CATEGORIES;
const ALERT_KINDS: ["outlook", ...BulletinKind[]] = [
  "outlook",
  ...(Object.keys(BULLETIN_CATEGORIES) as BulletinKind[]),
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialKind =
    ALERT_KINDS.find((kind) => kind === params.kind) ?? "marine";
  const sourceEditionIds =
    typeof params.sources === "string"
      ? params.sources.split(",").filter(Boolean).slice(0, 30)
      : [];
  return (
    <ProductDesk
      initialKind={initialKind}
      kinds={ALERT_KINDS}
      sourceEditionIds={sourceEditionIds}
      title="Alerts"
    />
  );
}

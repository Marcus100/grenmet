import config from "@payload-config";
import { generatePageMetadata, RootPage } from "@payloadcms/next/views";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPayload } from "payload";
import { importMap } from "../importMap";

interface Args {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<Record<string, string | string[]>>;
}
export const generateMetadata = ({ params, searchParams }: Args) =>
  generatePageMetadata({ config, params, searchParams });
export default async function Page({ params, searchParams }: Args) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) redirect("/signin");
  return RootPage({ config, params, searchParams, importMap });
}

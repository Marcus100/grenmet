import { redirect } from "next/navigation";
import { formatDateForUrl, getTodayUTC } from "@/lib/wxwatch/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  // Redirect to today's date
  const today = getTodayUTC();
  const url = formatDateForUrl(today);
  redirect(url);
}

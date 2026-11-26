import { isAuthApiError } from "@barrelsgd/auth";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  AccessDenied,
  ListingList,
  ListingNotice,
  QueueTabs,
} from "@/components/bookings-listing-panels";
import { ConsolePager } from "@/components/console-pager";
import { StaffOnly } from "@/components/staff-only";
import { listListingReviews } from "@/lib/bookings-listing-api";
import {
  LISTING_PAGE_SIZE,
  parseListingQueue,
} from "@/lib/bookings-listing-form";
import { env } from "@/lib/env";
import { requireGate } from "@/lib/staff-gate";
import { approveListingAction, withdrawListingAction } from "./actions";

export const metadata: Metadata = { title: "Bookings listings" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

function pageNumber(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

export default async function BookingsListingsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const gate = await requireGate("/bookings/listings");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;

  const params = await searchParams;
  const queue = parseListingQueue(one(params.queue));
  const page = pageNumber(one(params.page));
  const notice = one(params.notice);

  let list: Awaited<ReturnType<typeof listListingReviews>>;
  try {
    list = await listListingReviews(gate.accessToken, queue, page);
  } catch (error) {
    if (!isAuthApiError(error)) throw error;
    if (error.status === 401) redirect("/signin?sign_in=expired");
    // The API decides who may review; a 403 shows a plain refusal, not a crash.
    if (error.status !== 403) throw error;
    return (
      <>
        <PageIntro />
        <AccessDenied />
      </>
    );
  }

  const lastPage = Math.max(1, Math.ceil(list.count / LISTING_PAGE_SIZE));
  if (page > lastPage) {
    redirect(`/bookings/listings?queue=${queue}&page=${lastPage}`);
  }
  const linkTo = (target: number) =>
    `/bookings/listings?queue=${queue}&page=${target}` as const;

  return (
    <>
      <PageIntro />
      <ListingNotice code={notice} />
      <QueueTabs current={queue} />
      <ListingList
        approve={approveListingAction}
        publicOrigin={env.BOOKINGS_APP_URL}
        queue={queue}
        rows={list.data}
        withdraw={withdrawListingAction}
      />
      {list.count > 0 ? (
        <ConsolePager
          count={list.count}
          label="Listing pages"
          lastPage={lastPage}
          nextHref={page < lastPage ? linkTo(page + 1) : undefined}
          page={page}
          previousHref={page > 1 ? linkTo(page - 1) : undefined}
        />
      ) : null}
    </>
  );
}

function PageIntro() {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">
        Bookings home page listings
      </h1>
      <p className="text-muted-foreground">
        Businesses that ask to appear on the Bookings home page, oldest first.
        Approval only puts a business on the home page; its own booking page
        works by its link either way.
      </p>
    </div>
  );
}

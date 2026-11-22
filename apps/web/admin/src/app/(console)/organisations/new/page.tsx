import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import type { Metadata } from "next";
import Link from "next/link";
import { StaffOnly } from "@/components/staff-only";
import { KINDS, noticeFor } from "@/lib/organisation-form";
import { requireGate } from "@/lib/staff-gate";
import { createOrganisationAction } from "../actions";

export const metadata: Metadata = { title: "New organisation" };
export const dynamic = "force-dynamic";

export default async function NewOrganisationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireGate("/organisations/new");
  if (gate.status !== "staff") return <StaffOnly email={gate.email} />;
  const { notice: rawNotice } = await searchParams;
  const notice = noticeFor(Array.isArray(rawNotice) ? rawNotice[0] : rawNotice);

  return (
    <>
      <Link className="text-sm underline" href="/organisations">
        All organisations
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        New organisation
      </h1>
      {notice ? (
        <p className="rounded-md border px-3 py-2 text-sm" role="alert">
          Problem: {notice.text}
        </p>
      ) : null}
      <form action={createOrganisationAction} className="grid max-w-md gap-3">
        <label className="grid gap-1 text-sm">
          Name
          <Input maxLength={255} name="name" required type="text" />
        </label>
        <label className="grid gap-1 text-sm">
          Kind
          <NativeSelect defaultValue="business" name="kind">
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="grid gap-1 text-sm">
          Slug (optional)
          <Input
            className="font-mono"
            maxLength={100}
            name="slug"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            type="text"
          />
          <span className="text-muted-foreground text-xs">
            Lowercase letters, digits and hyphens. Derived from the name when
            empty.
          </span>
        </label>
        <div>
          <Button type="submit">Create organisation</Button>
        </div>
      </form>
    </>
  );
}

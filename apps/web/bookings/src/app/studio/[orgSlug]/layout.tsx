import { StudioNav } from "@/components/studio/studio-nav";

export default async function OrganisationLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}>) {
  const { orgSlug } = await params;
  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[12rem_1fr] md:items-start">
      <StudioNav orgSlug={orgSlug} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

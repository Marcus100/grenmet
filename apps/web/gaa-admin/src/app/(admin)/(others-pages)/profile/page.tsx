import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { StaffDigitalCard } from "@/components/user-profile/StaffDigitalCard";
import UserProfileContent from "@/components/user-profile/UserProfileContent";

export const metadata: Metadata = {
  title: "Employee Profile | GAA",
  description:
    "GAA employee profile, Digital ID and verified employment details.",
};

export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return (
    <div className="@container flex flex-col gap-6">
      <PageHeader
        description="Your GMS digital ID, verified employment record and personal details."
        title="Employee profile"
      />

      <StaffDigitalCard />
      <UserProfileContent
        initialTab={
          tab === "signature" || tab === "notifications" ? tab : "overview"
        }
      />
    </div>
  );
}

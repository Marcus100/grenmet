import type { Metadata } from "next";
import { StaffDigitalCard } from "@/components/user-profile/StaffDigitalCard";
import UserProfileContent from "@/components/user-profile/UserProfileContent";

export const metadata: Metadata = {
  title: "Employee Profile | GAA",
  description:
    "GAA employee profile, Digital ID and verified employment details.",
};

export default function Profile() {
  return (
    <div className="@container flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium text-3xl leading-none tracking-tight">
          Employee profile
        </h1>
        <p className="text-muted-foreground text-sm">
          Your GMS digital ID, verified employment record and personal details.
        </p>
      </div>

      <StaffDigitalCard />
      <UserProfileContent />
    </div>
  );
}

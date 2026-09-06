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
    <div>
      <div className="rounded-2xl border border-border bg-background p-5 lg:p-6">
        <h3 className="mb-5 font-semibold text-foreground text-lg lg:mb-7">
          Employee profile
        </h3>
        <StaffDigitalCard />
        <UserProfileContent />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import UserProfileContent from "@/components/user-profile/UserProfileContent";

export const metadata: Metadata = {
  title: "Profile | Grenmet Admin",
  description: "User profile page for Grenmet Admin",
};

export default function Profile() {
  return (
    <div>
      <div className="rounded-2xl border border-border bg-background p-5 lg:p-6">
        <h3 className="mb-5 font-semibold text-foreground text-lg lg:mb-7">
          Profile
        </h3>
        <UserProfileContent />
      </div>
    </div>
  );
}

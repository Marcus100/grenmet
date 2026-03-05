import type { Metadata } from "next";
import UserProfileContent from "@/components/user-profile/UserProfileContent";

export const metadata: Metadata = {
  title: "Next.js Profile | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Profile page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

export default function Profile() {
  return (
    <div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 lg:p-6 dark:border-gray-800 dark:bg-white/3">
        <h3 className="mb-5 font-semibold text-gray-800 text-lg lg:mb-7 dark:text-white/90">
          Profile
        </h3>
        <UserProfileContent />
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import ComponentCard from "@/components/common/ComponentCard";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const metadata: Metadata = {
  title: "Next.js Avatars | TailAdmin - Next.js Dashboard Template",
  description:
    "This is Next.js Avatars page for TailAdmin - Next.js Tailwind CSS Admin Dashboard Template",
};

// Avatar wrapper component with status indicator
function AvatarWithStatus({
  src,
  size,
  status,
}: {
  src: string;
  size: "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge";
  status?: "online" | "offline" | "busy" | "none";
}) {
  const sizeClasses = {
    xsmall: "size-6",
    small: "size-8",
    medium: "size-10",
    large: "size-12",
    xlarge: "size-14",
    xxlarge: "size-16",
  };

  const statusSizeClasses = {
    xsmall: "size-1.5",
    small: "size-2",
    medium: "size-2.5",
    large: "size-3",
    xlarge: "size-3.5",
    xxlarge: "size-4",
  };

  const statusColorClasses = {
    online: "bg-success-500",
    offline: "bg-error-400",
    busy: "bg-warning-500",
    none: "",
  };

  return (
    <div className="relative">
      <Avatar className={sizeClasses[size]}>
        <AvatarImage alt="User Avatar" src={src} />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>
      {status && status !== "none" && (
        <span
          className={`absolute right-0 bottom-0 rounded-full border-[1.5px] border-white dark:border-gray-900 ${statusSizeClasses[size]} ${statusColorClasses[status]}`}
        />
      )}
    </div>
  );
}

export default function AvatarPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="Avatar" />
      <div className="space-y-5 sm:space-y-6">
        <ComponentCard title="Default Avatar">
          {/* Default Avatar (No Status) */}
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <AvatarWithStatus size="xsmall" src="/images/user/user-01.jpg" />
            <AvatarWithStatus size="small" src="/images/user/user-01.jpg" />
            <AvatarWithStatus size="medium" src="/images/user/user-01.jpg" />
            <AvatarWithStatus size="large" src="/images/user/user-01.jpg" />
            <AvatarWithStatus size="xlarge" src="/images/user/user-01.jpg" />
            <AvatarWithStatus size="xxlarge" src="/images/user/user-01.jpg" />
          </div>
        </ComponentCard>
        <ComponentCard title="Avatar with online indicator">
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <AvatarWithStatus
              size="xsmall"
              src="/images/user/user-01.jpg"
              status="online"
            />
            <AvatarWithStatus
              size="small"
              src="/images/user/user-01.jpg"
              status="online"
            />
            <AvatarWithStatus
              size="medium"
              src="/images/user/user-01.jpg"
              status="online"
            />
            <AvatarWithStatus
              size="large"
              src="/images/user/user-01.jpg"
              status="online"
            />
            <AvatarWithStatus
              size="xlarge"
              src="/images/user/user-01.jpg"
              status="online"
            />
            <AvatarWithStatus
              size="xxlarge"
              src="/images/user/user-01.jpg"
              status="online"
            />
          </div>
        </ComponentCard>
        <ComponentCard title="Avatar with Offline indicator">
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <AvatarWithStatus
              size="xsmall"
              src="/images/user/user-01.jpg"
              status="offline"
            />
            <AvatarWithStatus
              size="small"
              src="/images/user/user-01.jpg"
              status="offline"
            />
            <AvatarWithStatus
              size="medium"
              src="/images/user/user-01.jpg"
              status="offline"
            />
            <AvatarWithStatus
              size="large"
              src="/images/user/user-01.jpg"
              status="offline"
            />
            <AvatarWithStatus
              size="xlarge"
              src="/images/user/user-01.jpg"
              status="offline"
            />
            <AvatarWithStatus
              size="xxlarge"
              src="/images/user/user-01.jpg"
              status="offline"
            />
          </div>
        </ComponentCard>{" "}
        <ComponentCard title="Avatar with busy indicator">
          <div className="flex flex-col items-center justify-center gap-5 sm:flex-row">
            <AvatarWithStatus
              size="xsmall"
              src="/images/user/user-01.jpg"
              status="busy"
            />
            <AvatarWithStatus
              size="small"
              src="/images/user/user-01.jpg"
              status="busy"
            />
            <AvatarWithStatus
              size="medium"
              src="/images/user/user-01.jpg"
              status="busy"
            />
            <AvatarWithStatus
              size="large"
              src="/images/user/user-01.jpg"
              status="busy"
            />
            <AvatarWithStatus
              size="xlarge"
              src="/images/user/user-01.jpg"
              status="busy"
            />
            <AvatarWithStatus
              size="xxlarge"
              src="/images/user/user-01.jpg"
              status="busy"
            />
          </div>
        </ComponentCard>
      </div>
    </div>
  );
}

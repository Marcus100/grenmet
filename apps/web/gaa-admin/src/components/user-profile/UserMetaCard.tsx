"use client";

import type { UserProfilePublic } from "@barrelsgd/api-client";
import Image from "next/image";

interface UserMetaCardProps {
  profile: UserProfilePublic;
}

export default function UserMetaCard({ profile }: UserMetaCardProps) {
  const fullName =
    profile.profile.display_name?.trim() ||
    `${profile.profile.first_name} ${profile.profile.last_name}`;

  const avatarUrl = profile.identity.avatar_url;
  const avatarSrc = avatarUrl?.startsWith("/") ? avatarUrl : null;
  const position =
    profile.employment.grade?.label ||
    profile.employment.position ||
    "Grade not assigned";
  const department =
    profile.employment.department?.name || "Department not assigned";
  const location = profile.employment.work_location || "Location not recorded";

  return (
    <div className="border-border rounded-xl border p-5 lg:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full flex-col items-center gap-6 xl:flex-row">
          <div className="border-border h-20 w-20 overflow-hidden rounded-full border">
            {avatarSrc ? (
              <Image
                alt={`${fullName} avatar`}
                className="h-full w-full object-cover"
                height={80}
                src={avatarSrc}
                width={80}
              />
            ) : (
              <span className="bg-muted flex h-full items-center justify-center text-xl font-semibold">
                {fullName
                  .split(" ")
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            )}
          </div>
          <div className="order-3 xl:order-2">
            <h4 className="text-foreground mb-2 text-center text-lg font-semibold xl:text-left">
              {fullName}
            </h4>
            <div className="flex flex-col items-center gap-1 text-center xl:flex-row xl:gap-3 xl:text-left">
              <p className="text-muted-foreground text-sm">{position}</p>
              <div className="bg-border hidden h-3.5 w-px xl:block" />
              <p className="text-muted-foreground text-sm">{department}</p>
              <div className="bg-border hidden h-3.5 w-px xl:block" />
              <p className="text-muted-foreground text-sm">{location}</p>
            </div>
          </div>
        </div>
        <div className="rounded-full border border-green-200 bg-green-50 px-4 py-2 text-xs tracking-wide text-green-700 uppercase">
          {profile.identity.status}
        </div>
      </div>
    </div>
  );
}

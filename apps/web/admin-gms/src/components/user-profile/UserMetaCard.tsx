"use client";

import type { UserProfilePublic } from "@grenmet/api-client";
import Image from "next/image";

interface UserMetaCardProps {
  profile: UserProfilePublic;
}

export default function UserMetaCard({ profile }: UserMetaCardProps) {
  const fullName =
    profile.profile.display_name?.trim() ||
    `${profile.profile.first_name} ${profile.profile.last_name}`;

  const avatarUrl = profile.identity.avatar_url;
  const avatarSrc = avatarUrl?.startsWith("/")
    ? avatarUrl
    : "/images/user/owner.jpg";
  const position = profile.employment.position || "Meteorological Officer";
  const department =
    profile.employment.department?.name || "Meteorological Service";
  const location = profile.employment.work_location || "Grenada";

  return (
    <div className="rounded-2xl border border-gray-200 p-5 lg:p-6 dark:border-gray-800">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full flex-col items-center gap-6 xl:flex-row">
          <div className="h-20 w-20 overflow-hidden rounded-full border border-gray-200 dark:border-gray-800">
            <Image
              alt={`${fullName} avatar`}
              className="h-full w-full object-cover"
              height={80}
              src={avatarSrc}
              width={80}
            />
          </div>
          <div className="order-3 xl:order-2">
            <h4 className="mb-2 text-center font-semibold text-gray-800 text-lg xl:text-left dark:text-white/90">
              {fullName}
            </h4>
            <div className="flex flex-col items-center gap-1 text-center xl:flex-row xl:gap-3 xl:text-left">
              <p className="text-gray-500 text-sm dark:text-gray-400">
                {position}
              </p>
              <div className="hidden h-3.5 w-px bg-gray-300 xl:block dark:bg-gray-700" />
              <p className="text-gray-500 text-sm dark:text-gray-400">
                {department}
              </p>
              <div className="hidden h-3.5 w-px bg-gray-300 xl:block dark:bg-gray-700" />
              <p className="text-gray-500 text-sm dark:text-gray-400">
                {location}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-full border border-green-200 bg-green-50 px-4 py-2 text-green-700 text-xs uppercase tracking-wide dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          {profile.identity.status}
        </div>
      </div>
    </div>
  );
}

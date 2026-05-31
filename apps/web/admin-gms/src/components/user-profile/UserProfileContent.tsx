"use client";

import {
  readHrProfileMeApiV1HrProfileMeGetQueryKey,
  type UserProfileUpdateMe,
  useReadHrProfileMeApiV1HrProfileMeGet,
  useUpdateHrProfileMeApiV1HrProfileMePatch,
} from "@grenmet/api-client";
import { useQueryClient } from "@tanstack/react-query";
import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";

export default function UserProfileContent() {
  const queryClient = useQueryClient();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const updateProfileMutation = useUpdateHrProfileMeApiV1HrProfileMePatch({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: readHrProfileMeApiV1HrProfileMeGetQueryKey(),
        });
      },
    },
  });

  const handleSave = async (payload: UserProfileUpdateMe) => {
    await updateProfileMutation.mutateAsync({ data: payload });
  };

  if (profileQuery.isLoading) {
    return (
      <div className="rounded-2xl border border-border p-6 text-muted-foreground text-sm">
        Loading profile...
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700 text-sm">
        Unable to load profile data. Please refresh and try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <UserMetaCard profile={profileQuery.data} />
      <UserInfoCard
        isSaving={updateProfileMutation.isPending}
        onSave={handleSave}
        profile={profileQuery.data}
      />
      <UserAddressCard
        isSaving={updateProfileMutation.isPending}
        onSave={handleSave}
        profile={profileQuery.data}
      />
    </div>
  );
}

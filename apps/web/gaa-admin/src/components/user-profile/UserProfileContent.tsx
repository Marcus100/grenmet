"use client";

import {
  readHrProfileMeApiV1HrProfileMeGetQueryKey,
  readStaffCardApiV1HrStaffCardMeGetQueryKey,
  type UserProfileUpdateMe,
  useReadHrProfileMeApiV1HrProfileMeGet,
  useUpdateHrProfileMeApiV1HrProfileMePatch,
} from "@barrelsgd/api-client";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { EmployeeDocuments } from "@/components/hr/documents/employee-documents";
import { SignatureSettings } from "@/components/hr/signatures/signature-settings";
import { EmployeeDetailsCard } from "@/components/user-profile/EmployeeDetailsCard";
import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";

export default function UserProfileContent({
  initialTab = "overview",
}: {
  initialTab?: "overview" | "signature";
}) {
  const queryClient = useQueryClient();
  const profileQuery = useReadHrProfileMeApiV1HrProfileMeGet();
  const updateProfileMutation = useUpdateHrProfileMeApiV1HrProfileMePatch({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: readHrProfileMeApiV1HrProfileMeGetQueryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: readStaffCardApiV1HrStaffCardMeGetQueryKey(),
          }),
        ]);
      },
    },
  });

  const handleSave = async (payload: UserProfileUpdateMe) => {
    await updateProfileMutation.mutateAsync({ body: payload });
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
    <Tabs className="gap-4" defaultValue={initialTab}>
      <TabsList className="w-full">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="personal">Personal</TabsTrigger>
        <TabsTrigger value="employment">Employment</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="signature">Signature</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <UserMetaCard profile={profileQuery.data} />
      </TabsContent>

      <TabsContent value="personal">
        <div className="flex flex-col gap-6">
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
      </TabsContent>

      <TabsContent value="signature">
        <SignatureSettings />
      </TabsContent>
      <TabsContent value="documents">
        <EmployeeDocuments
          organisationId={
            profileQuery.data.employment.organisation_id ?? undefined
          }
          userId={profileQuery.data.id}
        />
      </TabsContent>

      <TabsContent value="employment">
        <EmployeeDetailsCard employment={profileQuery.data.employment} />
      </TabsContent>
    </Tabs>
  );
}

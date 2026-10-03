"use client";

import {
  hrGetHrProfileMeQueryKey,
  hrGetStaffCardQueryKey,
  type UserProfileUpdateMe,
  useHrGetHrProfileMe,
  useHrUpdateHrProfileMe,
} from "@barrelsgd/api-client";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { RecordHistory } from "@/components/audit/record-history";
import { EmployeeDocuments } from "@/components/hr/documents/employee-documents";
import { SignatureSettings } from "@/components/hr/signatures/signature-settings";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { EmployeeDetailsCard } from "@/components/user-profile/EmployeeDetailsCard";
import UserAddressCard from "@/components/user-profile/UserAddressCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import UserMetaCard from "@/components/user-profile/UserMetaCard";

export default function UserProfileContent({
  initialTab = "overview",
}: {
  initialTab?: "overview" | "signature" | "notifications";
}) {
  const queryClient = useQueryClient();
  const profileQuery = useHrGetHrProfileMe();
  const updateProfileMutation = useHrUpdateHrProfileMe({
    mutation: {
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: hrGetHrProfileMeQueryKey(),
          }),
          queryClient.invalidateQueries({
            queryKey: hrGetStaffCardQueryKey(),
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
      <TabsList className="w-full max-w-full shrink-0 justify-start overflow-x-auto">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="personal">Personal</TabsTrigger>
        <TabsTrigger value="employment">Employment</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="signature">Signature</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="history">History</TabsTrigger>
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

      <TabsContent value="notifications">
        <NotificationPreferences />
      </TabsContent>

      <TabsContent value="history">
        <div className="rounded-2xl border border-border p-6">
          <RecordHistory
            entityId={profileQuery.data.id}
            entityType="employee"
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

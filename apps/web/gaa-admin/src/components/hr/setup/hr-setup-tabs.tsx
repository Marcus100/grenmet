"use client";

import {
  useAuthGetEffectiveAccess,
  useHrGetOrganisations,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@barrelsgd/ui/components/ui/tabs";
import { useEffect, useState } from "react";
import { reportError } from "@/lib/report-error";
import { DepartmentsManager } from "./departments-manager";
import { NotificationSettings } from "./notification-settings";
import { OrganisationIdentity } from "./organisation-identity";
import { ShiftTypesManager } from "./shift-types-manager";
import { StaffSetupManager } from "./staff-setup";

export function HrSetupTabs() {
  const actor = useSessionUser();
  const accessQuery = useAuthGetEffectiveAccess({
    query: { enabled: !actor.is_superuser },
  });
  const allScopeKeys = accessQuery.data?.all_scope_permission_keys ?? [];
  const globalKeys = accessQuery.data?.global_permission_keys ?? [];
  const canManageSharedShifts =
    actor.is_superuser || globalKeys.includes("roster.manage");
  const canManageNotifications =
    actor.is_superuser || allScopeKeys.includes("notifications.manage");
  const organisationsQuery = useHrGetOrganisations();
  const organisations = organisationsQuery.data ?? [];
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (accessQuery.error) reportError(accessQuery.error, "hr-setup-access");
  }, [accessQuery.error]);
  useEffect(() => {
    if (organisationsQuery.error)
      reportError(organisationsQuery.error, "hr-setup-organisations");
  }, [organisationsQuery.error]);
  const organisationId =
    selected || (organisations.length === 1 ? organisations[0]?.id : "");
  const validOrganisation = organisations.some(
    (organisation) => organisation.id === organisationId
  );
  if (organisationsQuery.isPending)
    return <p role="status">Loading organisations…</p>;
  if (organisationsQuery.isError)
    return <p role="alert">Unable to load organisations. Refresh to retry.</p>;
  return (
    <div className="space-y-4">
      <OrganisationIdentity
        onChange={setSelected}
        organisations={organisations}
        value={organisationId ?? ""}
      />
      {validOrganisation ? (
        <Tabs
          className="w-full flex-col gap-4"
          defaultValue={actor.is_superuser ? "staff" : "departments"}
          key={organisationId}
        >
          <TabsList className="max-w-full shrink-0 justify-start overflow-x-auto">
            {actor.is_superuser && (
              <TabsTrigger value="staff">Staff baseline</TabsTrigger>
            )}
            <TabsTrigger value="shifts">Shift types</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            {canManageNotifications && (
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
            )}
          </TabsList>
          {actor.is_superuser && (
            <TabsContent className="w-full min-w-0" value="staff">
              <StaffSetupManager organisationId={organisationId} />
            </TabsContent>
          )}
          <TabsContent className="w-full min-w-0" value="shifts">
            <p className="mb-3 text-sm">
              Shared shift definitions. Department rosters determine where each
              shift is used.
            </p>
            <ShiftTypesManager canManage={canManageSharedShifts} />
          </TabsContent>
          <TabsContent className="w-full min-w-0" value="departments">
            <DepartmentsManager organisationId={organisationId} />
          </TabsContent>
          {canManageNotifications && (
            <TabsContent className="w-full min-w-0" value="notifications">
              <NotificationSettings organisationId={organisationId} />
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <p>Select an organisation to open HR setup.</p>
      )}
    </div>
  );
}

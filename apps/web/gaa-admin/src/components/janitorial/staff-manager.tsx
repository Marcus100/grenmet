"use client";

import type {
  JanitorialBuilding,
  JanitorialContractor,
  JanitorialGrant,
  JanitorialStaffMember,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Checkbox } from "@barrelsgd/ui/components/ui/checkbox";
import { Field, FieldLabel } from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@barrelsgd/ui/components/ui/table";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Panel, PanelEmpty } from "@/app/(admin)/_components/panel";
import {
  errorMessage,
  grantBuildings,
  revokeGrant,
  saveContractor,
  saveStaff,
} from "./api";
import { InactiveBadge } from "./portal";
import { ActiveCheckbox, SaveDialog } from "./save-dialog";

type Role = JanitorialStaffMember["role"];

const ROLE_LABELS: Record<Role, string> = {
  cleaner: "Cleaner",
  contractor_supervisor: "Contractor supervisor",
};

export interface GrantHolder {
  email: string | null;
  grants: JanitorialGrant[];
  name: string | null;
  userId: string;
}

/** Active grants grouped per person, people sorted by name. */
export function groupGrants(grants: JanitorialGrant[]): GrantHolder[] {
  const holders = new Map<string, GrantHolder>();
  for (const grant of grants) {
    const holder = holders.get(grant.userId) ?? {
      email: grant.email ?? null,
      grants: [],
      name: grant.name ?? null,
      userId: grant.userId,
    };
    holder.grants.push(grant);
    holders.set(grant.userId, holder);
  }
  return [...holders.values()].sort((a, b) =>
    (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "")
  );
}

function StaffStatus({ member }: { member: JanitorialStaffMember }) {
  if (!member.active) return <InactiveBadge active={false} />;
  if (!member.accountActive) {
    return <Badge variant="light-warning">Login disabled</Badge>;
  }
  return <Badge variant="light-success">Active</Badge>;
}

type Editing =
  | { type: "contractor"; contractor: JanitorialContractor | null }
  | { type: "staff"; member: JanitorialStaffMember | null }
  | { type: "grant" };

export function StaffManager({
  buildings,
  canManageScope,
  canManageStaff,
  contractors,
  grants,
  staff,
}: {
  buildings: JanitorialBuilding[];
  canManageScope: boolean;
  canManageStaff: boolean;
  contractors: JanitorialContractor[];
  grants: JanitorialGrant[] | null;
  staff: JanitorialStaffMember[];
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const close = () => setEditing(null);
  const contractorName = (id: string) =>
    contractors.find((contractor) => contractor.id === id)?.name ?? "—";

  return (
    <div className="space-y-4">
      <Panel
        description="The company that supplies cleaning staff."
        title="Contractor"
      >
        {contractors.length === 0 ? (
          <PanelEmpty>No contractor registered yet.</PanelEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {contractors.map((contractor) => (
              <li
                className="flex items-center justify-between gap-2 py-2 text-sm"
                key={contractor.id}
              >
                <span className="flex items-center gap-2 font-medium">
                  {contractor.name}
                  <InactiveBadge active={contractor.active} />
                </span>
                {canManageStaff ? (
                  <Button
                    aria-label={`Edit ${contractor.name}`}
                    onClick={() =>
                      setEditing({ type: "contractor", contractor })
                    }
                    size="icon-sm"
                    variant="ghost"
                  >
                    <Pencil />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canManageStaff ? (
          <Button
            className="mt-3"
            onClick={() => setEditing({ type: "contractor", contractor: null })}
            size="sm"
            variant="outline"
          >
            <Plus data-icon="inline-start" />
            Add contractor
          </Button>
        ) : null}
      </Panel>

      <Panel
        description="Cleaners and contractor supervisors. Each needs a Barrels Login account and the janitorial-cleaner (or janitorial-contractor-supervisor) role, assigned under Roles."
        title="Cleaning staff"
      >
        {canManageStaff ? (
          <div className="mb-3 flex justify-end">
            <Button
              disabled={contractors.every((contractor) => !contractor.active)}
              onClick={() => setEditing({ type: "staff", member: null })}
              size="sm"
              variant="outline"
            >
              <Plus data-icon="inline-start" />
              Add staff member
            </Button>
          </div>
        ) : null}
        {staff.length === 0 ? (
          <PanelEmpty>No staff added yet.</PanelEmpty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-28">Badge</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Contractor
                </TableHead>
                <TableHead className="w-32">Status</TableHead>
                {canManageStaff ? (
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <span className="block font-medium">
                      {member.name ?? "Unknown account"}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {member.email}
                    </span>
                  </TableCell>
                  <TableCell>{ROLE_LABELS[member.role]}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {member.badgeNo ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {contractorName(member.contractorId)}
                  </TableCell>
                  <TableCell>
                    <StaffStatus member={member} />
                  </TableCell>
                  {canManageStaff ? (
                    <TableCell>
                      <Button
                        aria-label={`Edit ${member.name ?? member.email ?? "staff member"}`}
                        onClick={() => setEditing({ type: "staff", member })}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      {canManageScope && grants ? (
        <GrantsPanel
          buildings={buildings}
          grants={grants}
          onGrant={() => setEditing({ type: "grant" })}
        />
      ) : null}

      {editing?.type === "contractor" ? (
        <ContractorDialog contractor={editing.contractor} onClose={close} />
      ) : null}
      {editing?.type === "staff" ? (
        <StaffDialog
          contractors={contractors}
          member={editing.member}
          onClose={close}
        />
      ) : null}
      {editing?.type === "grant" ? (
        <GrantDialog buildings={buildings} onClose={close} />
      ) : null}
    </div>
  );
}

function GrantsPanel({
  buildings,
  grants,
  onGrant,
}: {
  buildings: JanitorialBuilding[];
  grants: JanitorialGrant[];
  onGrant: () => void;
}) {
  const router = useRouter();
  const revoke = useMutation({ mutationFn: revokeGrant });
  const buildingName = (id: number) =>
    buildings.find((building) => building.id === id)?.name ?? `Building ${id}`;

  async function onRevoke(grant: JanitorialGrant) {
    try {
      await revoke.mutateAsync(grant.id);
      toast.success(`${buildingName(grant.buildingId)} access removed`);
      router.refresh();
    } catch (caught) {
      toast.error(errorMessage(caught, "Could not remove access"));
    }
  }

  return (
    <Panel
      description="GAA supervisors and managers see and manage only the buildings granted here. Janitorial managers see every building."
      title="Building access"
    >
      <div className="mb-3 flex justify-end">
        <Button onClick={onGrant} size="sm" variant="outline">
          <Plus data-icon="inline-start" />
          Grant buildings
        </Button>
      </div>
      {grants.length === 0 ? (
        <PanelEmpty>No building grants yet.</PanelEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {groupGrants(grants).map((holder) => (
            <li className="space-y-2 py-3" key={holder.userId}>
              <p className="text-sm">
                <span className="font-medium">
                  {holder.name ?? "Unknown account"}
                </span>{" "}
                <span className="text-muted-foreground text-xs">
                  {holder.email}
                </span>
              </p>
              <ul className="flex flex-wrap gap-2">
                {holder.grants.map((grant) => (
                  <li key={grant.id}>
                    <Badge className="gap-1 pr-0.5" variant="light-light">
                      {buildingName(grant.buildingId)}
                      <button
                        aria-label={`Remove ${buildingName(grant.buildingId)} from ${holder.name ?? holder.email}`}
                        className="rounded-full p-0.5 outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                        disabled={revoke.isPending}
                        onClick={() => onRevoke(grant)}
                        type="button"
                      >
                        <X aria-hidden="true" className="size-3" />
                      </button>
                    </Badge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ContractorDialog({
  contractor,
  onClose,
}: {
  contractor: JanitorialContractor | null;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(contractor?.name ?? "");
  const [active, setActive] = useState(contractor?.active ?? true);
  const save = () =>
    contractor
      ? saveContractor(contractor.id, {
          name: name.trim(),
          active,
          expectedRevision: contractor.revision,
        })
      : saveContractor(null, { name: name.trim() });

  return (
    <SaveDialog
      onClose={onClose}
      save={save}
      submitLabel="Save contractor"
      success="Contractor saved"
      title={contractor ? "Edit contractor" : "Add contractor"}
    >
      <Field>
        <FieldLabel htmlFor={`${id}-name`}>Company name</FieldLabel>
        <Input
          id={`${id}-name`}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          required
          value={name}
        />
      </Field>
      {contractor ? (
        <ActiveCheckbox
          checked={active}
          id={`${id}-active`}
          onChange={setActive}
        />
      ) : null}
    </SaveDialog>
  );
}

function StaffDialog({
  contractors,
  member,
  onClose,
}: {
  contractors: JanitorialContractor[];
  member: JanitorialStaffMember | null;
  onClose: () => void;
}) {
  const id = useId();
  const choices = contractors.filter(
    (contractor) => contractor.active || contractor.id === member?.contractorId
  );
  const [form, setForm] = useState({
    email: "",
    contractorId: member?.contractorId ?? choices[0]?.id ?? "",
    role: member?.role ?? ("cleaner" as Role),
    badgeNo: member?.badgeNo ?? "",
    active: member?.active ?? true,
  });
  const badgeNo = form.badgeNo.trim() || null;
  const save = () =>
    member
      ? saveStaff(member.id, {
          contractorId: form.contractorId,
          role: form.role,
          badgeNo,
          active: form.active,
          expectedRevision: member.revision,
        })
      : saveStaff(null, {
          email: form.email.trim(),
          contractorId: form.contractorId,
          role: form.role,
          badgeNo,
        });

  return (
    <SaveDialog
      description={
        member
          ? `${member.name ?? "Staff member"} · ${member.email ?? ""}`
          : "Enter the email of their Barrels Login account. Create the account under Staff first if they don't have one."
      }
      onClose={onClose}
      save={save}
      submitLabel="Save"
      success="Staff member saved"
      title={member ? "Edit staff member" : "Add staff member"}
    >
      {member ? null : (
        <Field>
          <FieldLabel htmlFor={`${id}-email`}>Barrels Login email</FieldLabel>
          <Input
            autoComplete="off"
            id={`${id}-email`}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            type="email"
            value={form.email}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-3">
        <Field className="w-56">
          <FieldLabel htmlFor={`${id}-role`}>Role</FieldLabel>
          <NativeSelect
            id={`${id}-role`}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            value={form.role}
          >
            {Object.entries(ROLE_LABELS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="w-32">
          <FieldLabel htmlFor={`${id}-badge`}>Badge no.</FieldLabel>
          <Input
            id={`${id}-badge`}
            maxLength={40}
            onChange={(e) => setForm({ ...form, badgeNo: e.target.value })}
            value={form.badgeNo}
          />
        </Field>
      </div>
      {choices.length > 1 ? (
        <Field className="w-72">
          <FieldLabel htmlFor={`${id}-contractor`}>Contractor</FieldLabel>
          <NativeSelect
            id={`${id}-contractor`}
            onChange={(e) => setForm({ ...form, contractorId: e.target.value })}
            value={form.contractorId}
          >
            {choices.map((contractor) => (
              <NativeSelectOption key={contractor.id} value={contractor.id}>
                {contractor.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {member ? (
        <ActiveCheckbox
          checked={form.active}
          id={`${id}-active`}
          onChange={(active) => setForm({ ...form, active })}
        />
      ) : null}
    </SaveDialog>
  );
}

function GrantDialog({
  buildings,
  onClose,
}: {
  buildings: JanitorialBuilding[];
  onClose: () => void;
}) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (buildingId: number, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(buildingId);
    else next.delete(buildingId);
    setSelected(next);
  };

  return (
    <SaveDialog
      description="Supervisors see and manage only granted buildings. Buildings they already hold are skipped."
      onClose={onClose}
      save={() =>
        grantBuildings({ email: email.trim(), buildingIds: [...selected] })
      }
      submitLabel="Grant access"
      success="Access granted"
      title="Grant buildings"
    >
      <Field>
        <FieldLabel htmlFor={`${id}-email`}>Barrels Login email</FieldLabel>
        <Input
          autoComplete="off"
          id={`${id}-email`}
          onChange={(e) => setEmail(e.target.value)}
          required
          type="email"
          value={email}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="font-medium text-sm">Buildings</legend>
        <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
          {buildings
            .filter((building) => building.active)
            .map((building) => (
              <label
                className="flex items-center gap-2 text-sm"
                htmlFor={`${id}-b${building.id}`}
                key={building.id}
              >
                <Checkbox
                  checked={selected.has(building.id)}
                  id={`${id}-b${building.id}`}
                  onCheckedChange={(value) =>
                    toggle(building.id, Boolean(value))
                  }
                />
                {building.name}
              </label>
            ))}
        </div>
      </fieldset>
    </SaveDialog>
  );
}

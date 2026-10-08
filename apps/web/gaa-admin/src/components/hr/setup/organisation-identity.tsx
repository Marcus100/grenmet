"use client";

import {
  hrCreateOrganisation,
  hrGetOrganisationsQueryKey,
  hrRenameOrganisation,
  type OrganisationPublic,
} from "@barrelsgd/api-client";
import { useSessionUser } from "@barrelsgd/auth";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@barrelsgd/ui/components/ui/dialog";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { NativeSelect } from "@barrelsgd/ui/components/ui/native-select";
import { useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { hrApiErrorMessage } from "@/components/hr/api-error";
import { reportError } from "@/lib/report-error";

function OrganisationDialog({
  existing,
  onSaved,
}: {
  existing?: OrganisationPublic;
  onSaved: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [id, setId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState(existing?.name ?? "");
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        {existing ? "Rename organisation" : "Register organisation"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {existing ? "Rename organisation" : "Register organisation"}
          </DialogTitle>
          <DialogDescription>
            Identify the employer. Staff assignments and access are configured
            separately.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const saved = existing
                ? await hrRenameOrganisation({
                    path: { organisation_id: existing.id },
                    body: { name: name.trim() },
                  }).unwrap()
                : await hrCreateOrganisation({
                    body: {
                      id: id.trim(),
                      code: code.trim(),
                      name: name.trim(),
                    },
                  }).unwrap();
              await queryClient.invalidateQueries({
                queryKey: hrGetOrganisationsQueryKey(),
              });
              onSaved(saved.id);
              setOpen(false);
            } catch (error) {
              reportError(error, "hr-organisations");
              setMessage(hrApiErrorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-1" htmlFor={`${labelId}-name`}>
            Organisation name
            <Input
              id={`${labelId}-name`}
              maxLength={255}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          {!existing && (
            <>
              <label className="block space-y-1" htmlFor={`${labelId}-id`}>
                Permanent ID
                <Input
                  id={`${labelId}-id`}
                  maxLength={100}
                  onChange={(event) => setId(event.target.value)}
                  pattern="[a-z][a-z0-9_-]*"
                  required
                  value={id}
                />
              </label>
              <label className="block space-y-1" htmlFor={`${labelId}-code`}>
                Organisation code
                <Input
                  id={`${labelId}-code`}
                  maxLength={100}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                  pattern="[A-Z][A-Z0-9_-]*"
                  required
                  value={code}
                />
              </label>
            </>
          )}
          {existing && (
            <p>
              ID: {existing.id} · Code: {existing.code}
            </p>
          )}
          <Button disabled={busy || !name.trim()} type="submit">
            {busy ? "Saving…" : "Save organisation"}
          </Button>
          {message && <p role="alert">{message}</p>}
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrganisationIdentity({
  organisations,
  value,
  onChange,
}: {
  organisations: OrganisationPublic[];
  value: string;
  onChange: (id: string) => void;
}) {
  const actor = useSessionUser();
  const id = useId();
  const current = organisations.find(
    (organisation) => organisation.id === value
  );
  return (
    <section
      aria-label="HR organisation"
      className="space-y-3 rounded-lg border border-border p-4"
    >
      <h2 className="font-semibold">Organisation</h2>
      <p className="text-muted-foreground text-sm">
        Choose the employer before configuring departments and staff. Work and
        personal accounts remain separate.
      </p>
      <label className="block space-y-1" htmlFor={id}>
        Employer organisation
        <NativeSelect
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          <option value="">Choose an organisation</option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.name} ({organisation.code})
            </option>
          ))}
        </NativeSelect>
      </label>
      {current && <p className="text-sm">Organisation ID: {current.id}</p>}
      {actor?.is_superuser && (
        <div className="flex flex-wrap gap-2">
          <OrganisationDialog onSaved={onChange} />
          {current && (
            <OrganisationDialog
              existing={current}
              key={current.id}
              onSaved={onChange}
            />
          )}
        </div>
      )}
    </section>
  );
}

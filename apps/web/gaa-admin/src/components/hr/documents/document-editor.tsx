"use client";

import {
  type EmployeeDocumentPublic,
  patchDocumentApiV1HrDocumentsDocumentIdPatch,
  uploadDocumentApiV1HrDocumentsPost,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { type FormEvent, useId, useState } from "react";
import {
  documentCategories,
  documentCategory,
  documentError,
} from "@/components/hr/documents/document-fields";

export function DocumentEditor({
  userId,
  organisationId,
  document,
  onSaved,
  onCancel,
}: {
  userId: string;
  organisationId?: string;
  document?: EmployeeDocumentPublic;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const title = value("title");
    if (!title) {
      setError("Enter a document title.");
      return;
    }
    const issued = value("issued_date");
    const expiry = value("expiry_date");
    if (issued && expiry && expiry < issued) {
      setError("Expiry must be on or after the issue date.");
      return;
    }
    const metadata = {
      title,
      description: value("description") || null,
      issued_date: issued || null,
      expiry_date: expiry || null,
      issuing_authority: value("issuing_authority") || null,
      reference_number: value("reference_number") || null,
    };
    setBusy(true);
    setError("");
    try {
      if (document) {
        await patchDocumentApiV1HrDocumentsDocumentIdPatch({
          path: { document_id: document.id },
          body: metadata,
        }).unwrap();
      } else {
        const file = selectedFile;
        const category = documentCategory(value("category"));
        if (
          !(file instanceof File && file.size) ||
          file.size > 25 * 1024 * 1024
        ) {
          setError("Choose a non-empty file of 25 MB or less.");
          return;
        }
        if (!category) {
          setError("Choose a document category.");
          return;
        }
        await uploadDocumentApiV1HrDocumentsPost({
          body: {
            ...metadata,
            category,
            file,
            user_id: userId,
            organisation_id: organisationId,
          },
        }).unwrap();
      }
      await onSaved();
    } catch (failure) {
      setError(documentError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label={document ? "Edit document" : "Upload document"}
      className="space-y-4 rounded-lg border border-border p-4"
      onSubmit={submit}
    >
      <h3 className="font-medium">
        {document ? "Edit document details" : "Upload a document"}
      </h3>
      <fieldset className="space-y-4" disabled={busy}>
        <div className="space-y-2">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input
            defaultValue={document?.title}
            id={`${id}-title`}
            maxLength={255}
            name="title"
            required
          />
        </div>
        {!document && (
          <>
            <div className="space-y-2">
              <Label htmlFor={`${id}-category`}>Category</Label>
              <select
                className="w-full rounded-md border border-input bg-background p-2 text-sm"
                defaultValue="CERTIFICATION"
                id={`${id}-category`}
                name="category"
              >
                {documentCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-file`}>File</Label>
              <Input
                accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.doc,.docx,.xls,.xlsx"
                id={`${id}-file`}
                name="file"
                onChange={(event) =>
                  setSelectedFile(event.target.files?.[0] ?? null)
                }
                required
                type="file"
              />
              <p className="text-muted-foreground text-sm">
                PDF, image, Word or Excel file, up to 25 MB. Upload only
                personal records; confidential case files are not supported
                here.
              </p>
            </div>
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${id}-issued`}>Issue date</Label>
            <Input
              defaultValue={document?.issued_date ?? ""}
              id={`${id}-issued`}
              name="issued_date"
              type="date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-expiry`}>Expiry date</Label>
            <Input
              defaultValue={document?.expiry_date ?? ""}
              id={`${id}-expiry`}
              name="expiry_date"
              type="date"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-authority`}>Issuing authority</Label>
            <Input
              defaultValue={document?.issuing_authority ?? ""}
              id={`${id}-authority`}
              maxLength={255}
              name="issuing_authority"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-reference`}>Reference number</Label>
            <Input
              defaultValue={document?.reference_number ?? ""}
              id={`${id}-reference`}
              maxLength={120}
              name="reference_number"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-description`}>Description</Label>
          <Textarea
            defaultValue={document?.description ?? ""}
            id={`${id}-description`}
            maxLength={2000}
            name="description"
          />
        </div>
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button disabled={busy} type="submit">
            {busy ? "Saving…" : "Save document"}
          </Button>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

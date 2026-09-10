"use client";

import {
  archiveDocumentApiV1HrDocumentsDocumentIdArchivePost,
  type EmployeeDocumentPublic,
  readDocumentsApiV1HrDocumentsGet,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { DocumentEditor } from "@/components/hr/documents/document-editor";
import {
  documentCategories,
  documentCategory,
  documentError,
  expiryLabel,
} from "@/components/hr/documents/document-fields";
import {
  ExpiryBadge,
  ExpiryFilter,
  expiryState,
  grenadaToday,
} from "@/components/hr/expiry";

export function EmployeeDocuments({
  userId,
  organisationId,
}: {
  userId: string;
  organisationId?: string;
}) {
  const id = useId();
  const client = useQueryClient();
  const [expiry, setExpiry] = useState("all");
  const [category, setCategory] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<EmployeeDocumentPublic | "new" | null>(
    null
  );
  const [archive, setArchive] = useState<EmployeeDocumentPublic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: [
      "employee-documents",
      userId,
      organisationId,
      category,
      includeArchived,
      page,
    ],
    queryFn: () =>
      readDocumentsApiV1HrDocumentsGet({
        query: {
          user_id: userId,
          organisation_id: organisationId,
          category: documentCategory(category),
          include_archived: includeArchived,
          page,
          size: 20,
        },
      }).unwrap(),
  });
  async function refresh() {
    await client.invalidateQueries({
      queryKey: ["employee-documents", userId],
    });
    setEditor(null);
    setArchive(null);
  }
  async function confirmArchive() {
    if (!archive) return;
    setBusy(true);
    setError("");
    try {
      await archiveDocumentApiV1HrDocumentsDocumentIdArchivePost({
        path: { document_id: archive.id },
      }).unwrap();
      if (page > 1 && query.data?.data.length === 1) setPage(page - 1);
      await refresh();
    } catch (failure) {
      setError(documentError(failure));
    } finally {
      setBusy(false);
    }
  }
  const today = grenadaToday();
  const visibleDocuments =
    query.data?.data.filter(
      (document) =>
        expiry === "all" ||
        (!document.archived_at &&
          expiryState(document.expiry_date, today) === expiry)
    ) ?? [];

  return (
    <section aria-label="Employee documents" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-xl">Documents</h2>
          <p className="text-muted-foreground text-sm">
            Personal records and credentials. Uploading does not verify a
            credential.
          </p>
        </div>
        {query.data?.can_upload && (
          <Button disabled={editor !== null} onClick={() => setEditor("new")}>
            Upload document
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${id}-filter`}>Category filter</Label>
          <select
            className="rounded-md border border-input bg-background p-2 text-sm"
            id={`${id}-filter`}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            value={category}
          >
            <option value="">All categories</option>
            {documentCategories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <ExpiryFilter onChange={setExpiry} value={expiry} />
        <Label className="flex items-center gap-2">
          <input
            checked={includeArchived}
            onChange={(event) => {
              setIncludeArchived(event.target.checked);
              setPage(1);
            }}
            type="checkbox"
          />
          Include archived
        </Label>
      </div>
      {editor && (
        <DocumentEditor
          document={editor === "new" ? undefined : editor}
          key={editor === "new" ? "new" : editor.id}
          onCancel={() => setEditor(null)}
          onSaved={refresh}
          organisationId={organisationId}
          userId={userId}
        />
      )}
      {query.isPending && <p role="status">Loading documents…</p>}
      {query.isError && (
        <div role="alert">
          <p>Unable to load documents. Your access may have changed.</p>
          <Button onClick={() => query.refetch()} variant="outline">
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && !visibleDocuments.length && (
        <p className="rounded-lg border border-border border-dashed p-6 text-muted-foreground">
          No documents match these filters.
        </p>
      )}
      {query.isSuccess && (
        <ul className="space-y-3">
          {visibleDocuments.map((document) => (
            <li
              className="rounded-lg border border-border p-4"
              key={document.id}
            >
              <div className="flex flex-wrap justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-medium">{document.title}</h3>
                  <ExpiryBadge
                    archived={Boolean(document.archived_at)}
                    date={document.expiry_date}
                    today={today}
                  />
                  <p className="text-muted-foreground text-sm">
                    {
                      documentCategories.find(
                        (item) => item.value === document.category
                      )?.label
                    }{" "}
                    · {document.original_filename} ·{" "}
                    {Math.ceil(document.size_bytes / 1024)} KB
                  </p>
                  <p className="text-sm">
                    {expiryLabel(document.expiry_date, today)}
                  </p>
                  {document.description && (
                    <p className="text-sm">{document.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    aria-label={`Download ${document.title} (opens a new tab)`}
                    className="text-sm underline underline-offset-4"
                    href={`/api/v1/hr/documents/${encodeURIComponent(document.id)}/download`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Download
                    <span className="sr-only">
                      {" "}
                      {document.title} (opens a new tab)
                    </span>
                  </a>
                  {document.can_manage && !document.archived_at && (
                    <>
                      <Button
                        aria-label={`Edit ${document.title}`}
                        disabled={editor !== null || busy}
                        onClick={() => setEditor(document)}
                        variant="outline"
                      >
                        Edit<span className="sr-only"> {document.title}</span>
                      </Button>
                      <Button
                        aria-label={`Archive ${document.title}`}
                        disabled={busy}
                        onClick={() => {
                          setArchive(document);
                          setError("");
                        }}
                        variant="outline"
                      >
                        Archive
                        <span className="sr-only"> {document.title}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {archive && (
        <fieldset
          aria-label="Confirm archive"
          className="space-y-3 rounded-lg border border-border p-4"
        >
          <p>
            Archive “{archive.title}”? The file will be retained and hidden from
            the default list.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="flex gap-2">
            <Button disabled={busy} onClick={confirmArchive}>
              {busy ? "Archiving…" : "Confirm archive"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => setArchive(null)}
              variant="outline"
            >
              Cancel archive
            </Button>
          </div>
        </fieldset>
      )}
      {query.isSuccess && (
        <div className="flex items-center gap-3">
          <Button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            variant="outline"
          >
            Previous
          </Button>
          <p className="text-sm">
            Page {page} of {Math.max(1, Math.ceil(query.data.count / 20))} ·{" "}
            {query.data.count} documents
          </p>
          <Button
            disabled={page * 20 >= query.data.count}
            onClick={() => setPage(page + 1)}
            variant="outline"
          >
            Next
          </Button>
        </div>
      )}
    </section>
  );
}

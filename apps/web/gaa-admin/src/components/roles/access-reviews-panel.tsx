"use client";
import {
  type ReviewAssignment,
  readAccessReviewsApiV1AuthAccessReviewsGet,
  recordAccessReviewApiV1AuthAccessReviewsAssignmentIdPost,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function ReviewRow({ assignment }: { assignment: ReviewAssignment }) {
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: (decision: "RETAIN" | "REVOKE") =>
      recordAccessReviewApiV1AuthAccessReviewsAssignmentIdPost({
        path: { assignment_id: assignment.id },
        body: { decision, reason },
      }).unwrap(),
    onSuccess: () => client.invalidateQueries({ queryKey: ["access-reviews"] }),
  });
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        {assignment.name} · {assignment.role} · {assignment.scope}
        {assignment.department_id ? ` / ${assignment.department_id}` : ""}
      </summary>
      <p className="py-2 text-sm">
        Effective from {assignment.effective_from}; ends{" "}
        {assignment.effective_to ?? "without expiry"}.
      </p>
      {assignment.is_superuser && (
        <p>
          This person also has unrestricted administrator access; revoking this
          role does not remove that access.
        </p>
      )}
      <ul className="my-2 list-disc ps-5 text-sm">
        {assignment.permissions.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
      <Input
        aria-label={`Review reason for ${assignment.name} ${assignment.role}`}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason for retaining or revoking access"
        value={reason}
      />
      <div className="mt-3 flex gap-2">
        <Button
          disabled={save.isPending || reason.trim().length < 5}
          onClick={() => save.mutate("RETAIN")}
        >
          Retain
        </Button>
        <Button
          disabled={save.isPending || reason.trim().length < 5}
          onClick={() => save.mutate("REVOKE")}
          variant="destructive"
        >
          Revoke
        </Button>
      </div>
      {save.isSuccess && <p role="status">Review recorded.</p>}
      {save.isError && (
        <p role="alert">
          Review failed. Another administrator must review your own access;
          refresh if the assignment changed.
        </p>
      )}
    </details>
  );
}
export function AccessReviewsPanel() {
  const query = useQuery({
    queryKey: ["access-reviews"],
    queryFn: () => readAccessReviewsApiV1AuthAccessReviewsGet({}).unwrap(),
  });
  if (query.isPending) return <p>Loading access reviews…</p>;
  if (query.isError)
    return (
      <p role="alert">
        Unable to load access reviews. Administrator access is required.
      </p>
    );
  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-xl">Access reviews</h2>
      <p>
        Review the person, permission bundle, scope and expiry. Changes require
        a reason and are recorded.
      </p>
      <p>
        Unrestricted administrators:{" "}
        {query.data.superusers.join(", ") || "None"}. Their administrator flag
        is reviewed separately from role assignments.
      </p>
      {query.data.assignments.map((assignment) => (
        <ReviewRow assignment={assignment} key={assignment.id} />
      ))}
      <details>
        <summary>Review history ({query.data.reviews.length})</summary>
        <ul className="space-y-2">
          {query.data.reviews.map((review) => (
            <li key={review.id}>
              {review.created_at} · {review.decision} · {review.reason} ·
              reviewer {review.reviewer_id} · assignment {review.assignment_id}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

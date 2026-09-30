import {
  APIError,
  type CollectionBeforeChangeHook,
  type CollectionBeforeValidateHook,
  type Field,
} from "payload";
import { canPublish, staffField } from "../access";

/**
 * Review before publication: authors submit ("Ready for review") and only a
 * holder of `publishKey` publishes. Shared by every editorial collection.
 */
export function enforceReview(publishKey: string): CollectionBeforeChangeHook {
  return ({ data, originalDoc, req }) => {
    if (!req.user) throw new APIError("Sign in to edit content.", 403);
    if (data.status === "published") {
      if (!canPublish(req.user, publishKey))
        throw new APIError(
          "You do not have permission to publish in this section.",
          403
        );
      if (
        originalDoc?.status !== "review" &&
        originalDoc?.status !== "published"
      )
        throw new APIError(
          "Submit the content for review before publishing.",
          400
        );
    }
    return data;
  };
}

export const stampPublication: CollectionBeforeValidateHook = ({
  data,
  operation,
  originalDoc,
  req,
}) => {
  if (!data) return data;
  if (!data.publishedAt && data.status === "published")
    data.publishedAt = new Date().toISOString();
  data.author = operation === "create" ? req.user?.id : originalDoc?.author;
  return data;
};

export const workflowFields: Field[] = [
  {
    name: "status",
    type: "select",
    required: true,
    defaultValue: "draft",
    index: true,
    options: [
      { label: "Draft", value: "draft" },
      { label: "Ready for review", value: "review" },
      { label: "Published", value: "published" },
    ],
    admin: {
      position: "sidebar",
      description:
        "Save as Ready for review. An editor with this section's permission publishes.",
    },
  },
  {
    name: "publishedAt",
    type: "date",
    index: true,
    admin: {
      position: "sidebar",
      description: "Set when first published; used for ordering and the URL.",
    },
  },
  {
    name: "author",
    type: "relationship",
    relationTo: "users",
    required: true,
    admin: { readOnly: true, position: "sidebar" },
    access: { read: staffField },
  },
];

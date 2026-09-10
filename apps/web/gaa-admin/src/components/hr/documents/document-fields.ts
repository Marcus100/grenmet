import type { DocumentCategory } from "@barrelsgd/api-client";

export const documentCategories = [
  { value: "CONTRACT", label: "Contract" },
  { value: "IDENTIFICATION", label: "Identification" },
  { value: "CERTIFICATION", label: "Certificate" },
  { value: "LICENCE", label: "Licence" },
  { value: "QUALIFICATION", label: "Qualification" },
  { value: "SIGNED_FORM", label: "Signed form" },
] satisfies { value: DocumentCategory; label: string }[];

export function documentCategory(value: string): DocumentCategory | undefined {
  return documentCategories.find((category) => category.value === value)?.value;
}

export function expiryLabel(expiry: string | null | undefined, today: string) {
  if (!expiry) return "No expiry date";
  if (expiry < today) return `Expired ${expiry}`;
  if (expiry === today) return "Expires today";
  return `Expires ${expiry}`;
}

export function documentError(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "detail" in error &&
    typeof error.detail === "string"
  ) {
    return error.detail;
  }
  return "Unable to save the document. Check your access and file details, then try again.";
}

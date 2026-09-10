import reference from "@/data/wxproducts/wmo-reference.json";

export const wmoReference = reference;
const COMPACT_DESCRIPTOR = /^[0-3]\d{5}$/;
const SEPARATED_DESCRIPTOR = /^([0-3])[-\s]+(\d{1,2})[-\s]+(\d{1,3})$/;

/** Accept compact, space-separated and padded/unpadded F-X-Y notation. */
export function normalizeDescriptor(value: string): string | undefined {
  const text = value.trim();
  if (COMPACT_DESCRIPTOR.test(text)) return text;
  const parts = SEPARATED_DESCRIPTOR.exec(text);
  if (!parts) return undefined;
  return `${parts[1]}${parts[2].padStart(2, "0")}${parts[3].padStart(3, "0")}`;
}

export function searchWmoFields(query: string) {
  const normalized = normalizeDescriptor(query);
  const term = query.trim().toLowerCase();
  return reference.fields.filter((field) => {
    if (normalized) return field.id === normalized;
    return [
      field.id,
      field.name,
      field.unit,
      ...field.codes.map((code) => code.meaning),
    ].some((value) => value.toLowerCase().includes(term));
  });
}

export function displayDescriptor(id: string) {
  return `${id.slice(0, 1)}-${id.slice(1, 3)}-${id.slice(3)}`;
}

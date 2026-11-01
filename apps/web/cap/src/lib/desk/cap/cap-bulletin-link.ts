import type {
  CapNameValue,
  PublicPublishedProduct,
} from "@barrelsgd/api-client";
import { BULLETIN_CATEGORIES } from "@barrelsgd/gms/products";

const KIND = "GMS:source-bulletin-kind";
const ID = "GMS:source-bulletin-id";
const REVISION = "GMS:source-bulletin-revision";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

export interface SourceBulletinLink {
  id: string;
  kind: string;
  revision: number;
}

export function sourceBulletinParameters(
  product: PublicPublishedProduct
): CapNameValue[] {
  if (!Object.hasOwn(BULLETIN_CATEGORIES, product.kind)) {
    throw new Error(
      "Only a hazard bulletin can be linked as a source bulletin."
    );
  }
  return [
    { value_name: KIND, value: product.kind },
    { value_name: ID, value: product.id },
    { value_name: REVISION, value: String(product.revision) },
  ];
}

export function readSourceBulletinLink(
  parameters: CapNameValue[] | null | undefined
): SourceBulletinLink | null {
  const matches = (parameters ?? []).filter((parameter) =>
    [KIND, ID, REVISION].includes(parameter.value_name)
  );
  if (matches.length !== 3) {
    return null;
  }
  const values = new Map(matches.map((item) => [item.value_name, item.value]));
  if (values.size !== 3) {
    return null;
  }
  const kind = values.get(KIND);
  const id = values.get(ID);
  const revisionText = values.get(REVISION);
  const revision = Number(revisionText);
  if (
    !(
      kind &&
      Object.hasOwn(BULLETIN_CATEGORIES, kind) &&
      id &&
      UUID.test(id) &&
      revisionText &&
      POSITIVE_INTEGER.test(revisionText) &&
      Number.isSafeInteger(revision)
    ) ||
    revision <= 0
  ) {
    return null;
  }
  return { kind, id, revision };
}

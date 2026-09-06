import type { Access, FieldAccess, Where } from "payload";

type StaffUser =
  | { id: number | string; role?: string; isSuperuser?: boolean | null }
  | null
  | undefined;
export function isEditor(user: StaffUser): boolean {
  return user?.isSuperuser === true || user?.role === "editor";
}
export const editorsOnly: Access = ({ req }) => isEditor(req.user);
export const editorField: FieldAccess = ({ req }) => isEditor(req.user);
export const staffField: FieldAccess = ({ req }) => Boolean(req.user);
export const staffOnly: Access = ({ req }) => Boolean(req.user);
export const readContent: Access = ({ req }) =>
  req.user ? true : { status: { equals: "published" } };
export const editContent: Access = ({ req }) => {
  if (isEditor(req.user)) return true;
  if (!req.user) return false;
  const filter: Where = {
    and: [
      { author: { equals: req.user.id } },
      { status: { not_equals: "published" } },
    ],
  };
  return filter;
};

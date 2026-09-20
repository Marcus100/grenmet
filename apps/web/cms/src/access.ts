import type { Access, FieldAccess, Where } from "payload";

export type ArticleSection =
  | "latest-from-us"
  | "weather-news"
  | "latest-publications";
const hasPermission = (user: StaffUser, key: string): boolean =>
  user?.isSuperuser === true ||
  (Array.isArray(user?.permissionKeys) && user.permissionKeys.includes(key));
export const canPublishSection = (
  user: StaffUser,
  section?: ArticleSection
): boolean =>
  Boolean(section && hasPermission(user, `cms.article.publish.${section}`));

type StaffUser =
  | {
      id: number | string;
      role?: string;
      isSuperuser?: boolean | null;
      permissionKeys?: unknown;
    }
  | null
  | undefined;
export function isEditor(user: StaffUser): boolean {
  return (
    user?.isSuperuser === true ||
    hasPermission(user, "cms.article.edit.all") ||
    hasPermission(user, "cms.article.manage")
  );
}
export const editorsOnly: Access = ({ req }) =>
  hasPermission(req.user, "cms.article.manage");
export const editorField: FieldAccess = ({ req }) =>
  hasPermission(req.user, "cms.article.manage");
export const staffField: FieldAccess = ({ req }) => Boolean(req.user);
export const staffOnly: Access = ({ req }) =>
  hasPermission(req.user, "cms.article.create");
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

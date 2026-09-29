import type { Access, FieldAccess, Where } from "payload";

/** FastAPI permission keys that let a holder publish in each collection. */
export const PUBLISH_KEYS = {
  "desk-updates": "cms.publish.desk-updates",
  stories: "cms.publish.stories",
  questions: "cms.publish.questions",
  discover: "cms.publish.discover",
} as const;
export const WEATHER_NOW_NOTE_KEY = "cms.weather-now.note";
export const HOMEPAGE_KEY = "cms.homepage.manage";

export const hasPermission = (user: StaffUser, key: string): boolean =>
  user?.isSuperuser === true ||
  (Array.isArray(user?.permissionKeys) && user.permissionKeys.includes(key));
export const canPublish = (user: StaffUser, key: string): boolean =>
  hasPermission(user, key);

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

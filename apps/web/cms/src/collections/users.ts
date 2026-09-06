import type { CollectionConfig } from "payload";
import { editorField, editorsOnly, isEditor } from "../access";
import { fastApiStrategy } from "../lib/fastapi-strategy";

const identityAccess = { create: () => false, update: () => false };
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "Staff member", plural: "Staff" },
  auth: { disableLocalStrategy: true, strategies: [fastApiStrategy] },
  admin: {
    useAsTitle: "username",
    description:
      "Identity comes from FastAPI. Only the CMS editorial role is managed here.",
  },
  access: {
    create: () => false,
    delete: () => false,
    update: editorsOnly,
    read: ({ req }) => {
      if (isEditor(req.user)) return true;
      return req.user ? { id: { equals: req.user.id } } : false;
    },
  },
  fields: [
    {
      name: "fastapiUserId",
      type: "text",
      required: true,
      unique: true,
      index: true,
      access: identityAccess,
      admin: { readOnly: true },
    },
    {
      name: "username",
      type: "text",
      required: true,
      access: identityAccess,
      admin: { readOnly: true },
    },
    {
      name: "email",
      type: "email",
      required: true,
      access: identityAccess,
      admin: { readOnly: true },
    },
    {
      name: "isSuperuser",
      type: "checkbox",
      defaultValue: false,
      access: identityAccess,
      admin: { hidden: true },
    },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "author",
      options: [
        { label: "Author", value: "author" },
        { label: "Editor", value: "editor" },
      ],
      access: { create: editorField, update: editorField },
    },
  ],
};

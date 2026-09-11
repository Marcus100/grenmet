import type { AuthStrategy } from "payload";
import { getEnv } from "../env";
import { getAuthConfig } from "./auth-config";
import { readFastApiIdentity } from "./fastapi-identity";
export const fastApiStrategy: AuthStrategy = {
  name: "fastapi-session",
  authenticate: async ({ headers, payload }) => {
    const env = getEnv();
    const origin = headers.get("origin");
    if (
      (origin && origin !== new URL(env.CMS_URL).origin) ||
      headers.get("sec-fetch-site") === "cross-site"
    )
      return { user: null };
    const identity = await readFastApiIdentity(
      headers,
      getAuthConfig(),
      env.CMS_DEPARTMENT_ID
    );
    if (!identity) return { user: null };
    const existing = await payload.find({
      collection: "users",
      where: { fastapiUserId: { equals: identity.fastapiUserId } },
      limit: 1,
      overrideAccess: true,
    });
    let user = existing.docs[0];
    if (!user) {
      // Unique FastAPI ID prevents duplicate identities on concurrent first requests.
      try {
        user = await payload.create({
          collection: "users",
          data: { ...identity, role: "author" },
          overrideAccess: true,
        });
      } catch (error) {
        const raced = await payload.find({
          collection: "users",
          where: { fastapiUserId: { equals: identity.fastapiUserId } },
          limit: 1,
          overrideAccess: true,
        });
        if (!raced.docs[0]) throw error;
        user = raced.docs[0];
      }
    }
    if (
      user.email !== identity.email ||
      user.username !== identity.username ||
      user.isSuperuser !== identity.isSuperuser
    ) {
      user = await payload.update({
        collection: "users",
        id: user.id,
        data: identity,
        overrideAccess: true,
      });
    }
    return { user: { ...user, collection: "users" } };
  },
};

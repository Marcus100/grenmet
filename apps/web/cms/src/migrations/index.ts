import {
  down as down_20260906_203710_initial,
  up as up_20260906_203710_initial,
} from "./20260906_203710_initial";
import {
  down as down_20260910_184226,
  up as up_20260910_184226,
} from "./20260910_184226";
import {
  down as down_20260910_224049_content_placement,
  up as up_20260910_224049_content_placement,
} from "./20260910_224049_content_placement";
import {
  down as down_20260919_000000_content_section,
  up as up_20260919_000000_content_section,
} from "./20260919_000000_content_section";
import {
  down as down_20260919_010000_cms_permissions,
  up as up_20260919_010000_cms_permissions,
} from "./20260919_010000_cms_permissions";

import {
  down as down_20260919_020000_social_enabled_platforms,
  up as up_20260919_020000_social_enabled_platforms,
} from "./20260919_020000_social_enabled_platforms";
import {
  down as down_20260919_030000_content_published_at,
  up as up_20260919_030000_content_published_at,
} from "./20260919_030000_content_published_at";
import {
  down as down_20260919_040000_fix_version_social_platforms,
  up as up_20260919_040000_fix_version_social_platforms,
} from "./20260919_040000_fix_version_social_platforms";
import {
  down as downEditorialLinks,
  up as upEditorialLinks,
} from "./20260923_170000_editorial_links";
export const migrations = [
  {
    up: up_20260906_203710_initial,
    down: down_20260906_203710_initial,
    name: "20260906_203710_initial",
  },
  {
    up: up_20260910_184226,
    down: down_20260910_184226,
    name: "20260910_184226",
  },
  {
    up: up_20260910_224049_content_placement,
    down: down_20260910_224049_content_placement,
    name: "20260910_224049_content_placement",
  },
  {
    up: up_20260919_000000_content_section,
    down: down_20260919_000000_content_section,
    name: "20260919_000000_content_section",
  },
  {
    up: up_20260919_010000_cms_permissions,
    down: down_20260919_010000_cms_permissions,
    name: "20260919_010000_cms_permissions",
  },
  {
    up: up_20260919_020000_social_enabled_platforms,
    down: down_20260919_020000_social_enabled_platforms,
    name: "20260919_020000_social_enabled_platforms",
  },
  {
    up: up_20260919_030000_content_published_at,
    down: down_20260919_030000_content_published_at,
    name: "20260919_030000_content_published_at",
  },
  {
    up: up_20260919_040000_fix_version_social_platforms,
    down: down_20260919_040000_fix_version_social_platforms,
    name: "20260919_040000_fix_version_social_platforms",
  },
  {
    up: upEditorialLinks,
    down: downEditorialLinks,
    name: "20260923_170000_editorial_links",
  },
];

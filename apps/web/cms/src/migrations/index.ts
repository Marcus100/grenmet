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
];

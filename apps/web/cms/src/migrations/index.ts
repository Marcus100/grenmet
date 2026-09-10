// Payload regenerates this file with namespace imports; Biome's
// noNamespaceImport rule requires named ones, so the aliased form below is
// reapplied after each `payload migrate:create`.
import {
  down as down_20260906_203710_initial,
  up as up_20260906_203710_initial,
} from "./20260906_203710_initial";
import {
  down as down_20260910_184226,
  up as up_20260910_184226,
} from "./20260910_184226";

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
];

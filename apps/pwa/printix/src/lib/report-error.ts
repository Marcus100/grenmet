/**
 * This app's error reporter (the root AGENTS.md rule: catch, show a fallback,
 * call `reportError`). The shared phone-app kit owns it; see its tests there.
 */
export {
  ERROR_REPORT_EVENT,
  reportError,
} from "@barrelsgd/pwa-kit/lib/report-error";

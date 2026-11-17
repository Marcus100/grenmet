import { useRegisterSW } from "virtual:pwa-register/react";
import { UpdateBanner } from "@/components/update-banner";

/** How often an open scanner asks whether a new version was deployed. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker that keeps the app on the phone, and offers a
 * reload when a new version is ready.
 */
export function ServiceWorker() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) {
        setInterval(() => {
          registration.update().catch(() => undefined);
        }, UPDATE_CHECK_MS);
      }
    },
  });
  if (!needRefresh) {
    return null;
  }
  return (
    <UpdateBanner
      onReload={() => {
        updateServiceWorker(true).catch(() => undefined);
      }}
    />
  );
}

// Minimal service worker for weather alert notifications.
// It only shows a notification for a push and opens its link on click.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Weather alert";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "gms-alert",
      data: { url: data.url || "/alerts" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/alerts",
    self.location.origin
  );
  // Only open pages on this site.
  const target = url.origin === self.location.origin ? url.href : "/alerts";
  event.waitUntil(self.clients.openWindow(target));
});

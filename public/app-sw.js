// Lets browsers install the admin screen as an app.
// Requests are left to the network so the Cloudflare Access login keeps working.
// The admin screen keeps its last numbers in localStorage to show them at once.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

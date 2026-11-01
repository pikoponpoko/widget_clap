// Lets browsers install the admin screen as an app.
// Requests are left to the network so the Cloudflare Access login keeps working
// and no admin data is stored on the device.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

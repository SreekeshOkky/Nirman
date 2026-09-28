/* Service worker: offline precache + Web Share Target receiver. */
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";

self.skipWaiting();
cleanupOutdatedCaches();

// Precache the built app shell.
precacheAndRoute(self.__WB_MANIFEST || []);

// SPA navigation fallback so deep links like /scan resolve to index.html.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/rest\//, /^\/auth\//, /^\/_vercel\//],
  }),
);

// Web Share Target: the OS posts the shared screenshot here. Stash the file in
// the Cache API, then redirect to a GET route the app can read.
registerRoute(
  ({ url, request }) => request.method === "POST" && url.pathname === "/scan",
  async ({ request }) => {
    try {
      const formData = await request.formData();
      const file =
        formData.get("screenshot") ||
        formData.get("files") ||
        [...formData.values()].find((value) => value instanceof File);
      if (file && file.size) {
        const cache = await caches.open("share-target");
        const headers = new Headers({
          "Content-Type": file.type || "image/png",
          "X-Filename": encodeURIComponent(file.name || "shared-screenshot.png"),
        });
        await cache.put("/__shared-file", new Response(file, { headers }));
      }
    } catch {
      /* fall through to the redirect */
    }
    return Response.redirect(
      new URL("scan?shared=1", self.registration.scope).href,
      303,
    );
  },
  "POST",
);

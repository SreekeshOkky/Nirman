// Hand-off for screenshots received via the Web Share Target API. The service
// worker stores the shared file in the Cache API; the app reads it here.

const CACHE = "share-target";
const KEY = "/__shared-file";

let pending = null;

export function takePendingShare() {
  const file = pending;
  pending = null;
  return file;
}

export async function takeSharedFile() {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE);
    const response = await cache.match(KEY);
    if (!response) return null;
    const blob = await response.blob();
    const name = decodeURIComponent(
      response.headers.get("x-filename") || "shared-screenshot.png",
    );
    const type = blob.type || response.headers.get("content-type") || "image/png";
    await cache.delete(KEY);
    pending = new File([blob], name, { type });
    return pending;
  } catch {
    return null;
  }
}

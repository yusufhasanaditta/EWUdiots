/* Tiny IndexedDB key → data-URL store for images that are too big for localStorage (floor plans, ID card scans).
   Device-only: never synced to the cloud. Falls back to memory if IndexedDB is blocked. */
const mem = new Map();
let dbp = null;
const db = () => (dbp = dbp || new Promise((res) => {
  try { const r = indexedDB.open("ewudiots-blobs", 1); r.onupgradeneeded = () => r.result.createObjectStore("b"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); }
}));
const tx = async (mode, fn) => { const d = await db(); if (!d) return null; return new Promise((res) => { const t = d.transaction("b", mode), q = fn(t.objectStore("b")); t.oncomplete = () => res(q?.result ?? null); t.onerror = t.onabort = () => res(null); }); };
export const getBlob = async (k) => (mem.has(k) ? mem.get(k) : (await tx("readonly", (s) => s.get(k))) ?? null);
export const setBlob = async (k, v) => { mem.set(k, v); await tx("readwrite", (s) => s.put(v, k)); };
export const delBlob = async (k) => { mem.delete(k); await tx("readwrite", (s) => s.delete(k)); };
export const clearBlobs = async (prefix) => { for (const k of await keysBlob(prefix)) await delBlob(k); };
export const keysBlob = async (prefix = "") => ((await tx("readonly", (s) => s.getAllKeys())) || [...mem.keys()]).filter((k) => String(k).startsWith(prefix));
/* Read a picked File as a (downscaled) JPEG data URL. */
export function fileToDataURL(file, max = 1800, quality = 0.86) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", quality)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("That file isn't an image we can read.")); };
    img.src = url;
  });
}

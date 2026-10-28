/* Merging one account's data between devices (phone app, web, desktop).
   Every top-level part of the state (profile, routine, grades, tasks…) carries the time it was last edited on a
   device, in state._t. When two copies meet, each part comes from whichever side edited it last, so a stale device
   can no longer overwrite a newer edit made elsewhere just because it saved something unrelated. Pure: unit-tested. */
export const META = new Set(["updatedAt", "syncedAt", "lastSync", "theme", "_t"]);
const json = (v) => JSON.stringify(v === undefined ? null : v);

/* What each part looked like when last saved or synced (to spot real edits). */
export function snapshot(state) {
  const snap = {};
  for (const k of Object.keys(state)) if (!META.has(k)) snap[k] = json(state[k]);
  return snap;
}

/* Record edit times for the parts that changed since `snap` (updated in place). Returns the changed part names. */
export function stamp(state, snap, now = Date.now()) {
  const changed = [];
  state._t = state._t || {};
  for (const k of Object.keys(state)) {
    if (META.has(k)) continue;
    const j = json(state[k]);
    if (snap[k] !== j) { snap[k] = j; state._t[k] = now; changed.push(k); }
  }
  return changed;
}

/* Combine this device's copy with the account's copy. On a tie (parts never edited since this sync format existed),
   the account's copy wins. fromRemote: something came from the account; keepLocal: the account needs our parts. */
export function merge(local, remote) {
  const lt = local._t || {}, rt = remote._t || {}, out = { ...local }, t = { ...lt };
  let fromRemote = false, keepLocal = false;
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)].filter((k) => !META.has(k)));
  for (const k of keys) {
    const a = lt[k] || 0, b = rt[k] || 0, same = json(local[k]) === json(remote[k]);
    const useRemote = !(k in remote) ? false : !(k in local) ? true : b >= a;
    if (useRemote) { if (!same) { out[k] = remote[k]; fromRemote = true; } if (b) t[k] = b; else delete t[k]; }
    else if (!same) keepLocal = true;
  }
  out._t = t;
  return { state: out, fromRemote, keepLocal };
}

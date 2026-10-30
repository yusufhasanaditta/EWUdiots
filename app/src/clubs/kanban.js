/* EWUdiots Club: project task board (pure). Columns follow club_tasks.status; position orders cards in a column. */

export const COLUMNS = [["todo", "To do", "red"], ["doing", "In progress", "blue"], ["done", "Completed", "green"]];
export const PRIORITY = { high: ["High", "red"], medium: ["Medium", "amber"], low: ["Low", "gray"] };

/** Cards of one column in board order. */
export const column = (tasks, status) => tasks.filter((t) => t.status === status).sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || String(a.created_at).localeCompare(String(b.created_at)));

/**
 * Move a card to a column (before another card, or to the end). Returns only the rows that change: [{ id, status, position }].
 * Positions are re-numbered 0,1,2… in the target column so they never collide.
 */
export function move(tasks, id, status, beforeId = null) {
  const card = tasks.find((t) => t.id === id);
  if (!card) return [];
  const target = column(tasks, status).filter((t) => t.id !== id);
  const at = beforeId ? Math.max(0, target.findIndex((t) => t.id === beforeId)) : target.length;
  target.splice(at === -1 ? target.length : at, 0, { ...card, status });
  return target.map((t, i) => ({ id: t.id, status, position: i })).filter((u) => { const t = tasks.find((x) => x.id === u.id); return t.status !== u.status || (t.position ?? 0) !== u.position; });
}

/** Board numbers: total, per column, % done. */
export function stats(tasks) {
  const n = (s) => tasks.filter((t) => t.status === s).length;
  const done = n("done");
  return { total: tasks.length, todo: n("todo"), doing: n("doing"), done, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}
/** Checklist "2/4". */
export const checklist = (t) => { const c = Array.isArray(t.checklist) ? t.checklist : []; return c.length ? `${c.filter((x) => x.done).length}/${c.length}` : ""; };

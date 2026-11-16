/* Touch feel for phones (Emil's gestures + mobile-native skills):
   - Sheet drag: grab a bottom sheet by its top (grabber or header) and it follows the finger 1:1; past 30% of its
     height or on a quick flick (> 0.5 px/ms) it closes, otherwise it springs back on the iOS drawer curve. Dragging
     up meets increasing resistance instead of a hard stop.
   - Haptics: a short tick for decisions (a box ticked, a success), never on every tap. Silent where unsupported. */

const DRAWER = "cubic-bezier(.32, .72, 0, 1)";
const GRAB = ".grabber, .modal-head, .sheet-head";

/** Decide whether a released drag closes the sheet (pure, tested). */
export function shouldClose(dy: number, ms: number, height: number): boolean {
  const v = ms > 0 ? dy / ms : 0;
  return dy > Math.max(80, height * 0.3) || (dy > 24 && v > 0.5);
}
/** Upward pull past the top: the further you pull, the less it moves. */
export const resist = (dy: number): number => (dy >= 0 ? dy : -Math.sqrt(-dy) * 3);

export function haptic(kind: "tick" | "success" = "tick"): void {
  try { navigator.vibrate?.(kind === "success" ? [8, 40, 12] : 8); } catch { /* not allowed here */ }
}

export function sheetDrag(scrim: HTMLElement, close: () => void): void {
  const phone = matchMedia("(max-width: 720px)");
  let modal: HTMLElement | null = null, y0 = 0, t0 = 0, dy = 0, id = -1;
  scrim.addEventListener("pointerdown", (e) => {
    const m = (e.target as Element).closest<HTMLElement>(".modal");
    if (!phone.matches || !m || m.classList.contains("center-modal") || !(e.target as Element).closest(GRAB)) return;
    if ((e.target as Element).closest("button, a, input, select, textarea") || id !== -1) return; // ignore a second finger
    modal = m; y0 = e.clientY; t0 = performance.now(); dy = 0; id = e.pointerId;
    m.setPointerCapture(e.pointerId); m.style.transition = "none"; m.style.animation = "none";
  });
  scrim.addEventListener("pointermove", (e) => {
    if (!modal || e.pointerId !== id) return;
    dy = e.clientY - y0;
    modal.style.transform = `translateY(${resist(dy)}px)`;
  });
  const end = (e: PointerEvent): void => {
    if (!modal || e.pointerId !== id) return;
    const m = modal; modal = null; id = -1;
    if (shouldClose(dy, performance.now() - t0, m.offsetHeight)) {
      m.style.transition = `transform 200ms ${DRAWER}`; m.style.transform = "translateY(100%)";
      haptic();
      setTimeout(() => { close(); m.style.transform = ""; m.style.transition = ""; m.style.animation = ""; }, 200);
    } else {
      m.style.transition = `transform 320ms ${DRAWER}`; m.style.transform = "";
      setTimeout(() => { m.style.transition = ""; m.style.animation = ""; }, 320);
    }
  };
  scrim.addEventListener("pointerup", end);
  scrim.addEventListener("pointercancel", end);
}

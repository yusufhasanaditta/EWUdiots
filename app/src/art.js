/* Brand art + delight: the winking-graduate mascot and a tiny confetti burst. */

/* mood: "wink" (default) | "happy" | "focus" (eyes closed) | "sleepy" */
export function mascot(size = 96, mood = "wink", cls = "") {
  const eyes = {
    wink: '<circle cx="420" cy="602" r="32" fill="#15122E"/><path d="M560 604 Q604 566 648 604" fill="none" stroke="#15122E" stroke-width="30" stroke-linecap="round"/>',
    happy: '<path d="M376 610 Q420 566 464 610" fill="none" stroke="#15122E" stroke-width="30" stroke-linecap="round"/><path d="M560 610 Q604 566 648 610" fill="none" stroke="#15122E" stroke-width="30" stroke-linecap="round"/>',
    focus: '<path d="M376 600 Q420 636 464 600" fill="none" stroke="#15122E" stroke-width="28" stroke-linecap="round"/><path d="M560 600 Q604 636 648 600" fill="none" stroke="#15122E" stroke-width="28" stroke-linecap="round"/>',
    sleepy: '<path d="M380 606 H460" stroke="#15122E" stroke-width="28" stroke-linecap="round"/><path d="M564 606 H644" stroke="#15122E" stroke-width="28" stroke-linecap="round"/>'
  }[mood] || "";
  const mouth = mood === "sleepy" ? '<ellipse cx="512" cy="716" rx="34" ry="26" fill="#15122E"/>' : '<path d="M410 694 Q512 790 614 694" fill="none" stroke="#15122E" stroke-width="32" stroke-linecap="round"/>';
  return `<svg class="mascot ${cls}" width="${size}" height="${size}" viewBox="150 200 724 680" aria-hidden="true">
    <circle cx="512" cy="600" r="258" fill="#C8F04A"/>${eyes}${mouth}
    <circle cx="372" cy="680" r="26" fill="#ff8fa3" opacity=".55"/><circle cx="652" cy="680" r="26" fill="#ff8fa3" opacity=".55"/>
    <g transform="rotate(-9 512 380)">
      <path d="M362 392 L362 470 Q512 540 662 470 L662 392 Z" fill="#15122E"/>
      <path d="M512 232 L846 362 L512 492 L178 362 Z" fill="#15122E"/>
      <path d="M512 362 L770 392 L770 520" fill="none" stroke="#C8F04A" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="770" cy="540" r="28" fill="#C8F04A"/><circle cx="512" cy="362" r="22" fill="#C8F04A"/>
    </g></svg>`;
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function confetti(n = 90) {
  if (reduced()) return;
  const c = document.createElement("canvas");
  c.className = "confetti"; c.width = innerWidth * devicePixelRatio; c.height = innerHeight * devicePixelRatio;
  document.body.appendChild(c);
  const ctx = c.getContext("2d"), d = devicePixelRatio;
  const colors = ["#5B3DF5", "#C8F04A", "#ff8fa3", "#3fd0bb", "#ffd166", "#a493ff"];
  const parts = Array.from({ length: n }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 160, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 12 - 4,
    r: Math.random() * 6 + 4, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0]
  }));
  const t0 = performance.now();
  (function frame(t) {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      ctx.save(); ctx.translate(p.x * d, p.y * d); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r * d / 2, -p.r * d / 4, p.r * d, p.r * d / 2); ctx.restore();
    }
    if (t - t0 < 2200) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

/* Soft chime with Web Audio (no audio files). */
export function chime() {
  try {
    const A = new (window.AudioContext || window.webkitAudioContext)();
    [659.25, 830.6, 987.8].forEach((f, i) => {
      const o = A.createOscillator(), g = A.createGain();
      o.type = "sine"; o.frequency.value = f; o.connect(g); g.connect(A.destination);
      const t = A.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.start(t); o.stop(t + 1);
    });
    setTimeout(() => A.close(), 1800);
  } catch { /* audio unavailable */ }
}

/* Ambient focus sounds generated on the fly: rain (high-passed white noise),
   library (soft low-passed pink noise), cafe (band-passed murmur that swells) and brown noise. */
let amb = null;
export function ambient(kind) {
  if (amb) { try { amb.ctx.close(); } catch { /* already closed */ } amb = null; }
  if (!kind || kind === "off") return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    const deep = kind === "brown" || kind === "library";
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (deep) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w * 0.5;
      }
    }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter();
    const F = { rain: ["highpass", 900, 0.16], library: ["lowpass", 420, 0.28], cafe: ["bandpass", 650, 0.22], brown: ["lowpass", 700, 0.5] }[kind] || ["lowpass", 700, 0.5];
    filter.type = F[0]; filter.frequency.value = F[1];
    const gain = ctx.createGain(); gain.gain.value = F[2];
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination); src.start();
    if (kind === "cafe") { // slow swell, like conversation rising and falling
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 0.18; depth.gain.value = 0.08; lfo.connect(depth); depth.connect(gain.gain); lfo.start();
    }
    amb = { ctx, kind };
  } catch { amb = null; }
}
export const ambientOn = () => amb?.kind || "off";

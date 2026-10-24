/* 3D campus (three.js, lazy-loaded): red-brick blocks floor by floor, courtyard, roads, route ribbon,
   orbit / walk / guided-tour cameras and a floor cut-away that shows an uploaded floor plan. */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { BLOCKS, COURTYARD, FLOOR_H, floorsOf, floorShort } from "./campus-data.js";

const EYE = 1.6;

function facadeTexture(color, dark) {
  // One tile = 6 m of wall × one storey: red brick, a white concrete slab band and two framed windows (EWU's look).
  const c = document.createElement("canvas"); c.width = 192; c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = color; g.fillRect(0, 0, 192, 96);
  g.fillStyle = "rgba(0,0,0,.06)"; for (let y = 14; y < 96; y += 5) g.fillRect(0, y, 192, 1); // brick courses
  g.fillStyle = dark ? "#7d7f8f" : "#ece6dc"; g.fillRect(0, 0, 192, 12); // concrete slab band
  for (const x of [26, 114]) {
    g.fillStyle = dark ? "#cfd2dc" : "#f4f1ea"; g.fillRect(x - 3, 27, 58, 52); // frame
    g.fillStyle = dark ? "#ffcf6e" : "#6f8aa6"; g.fillRect(x, 30, 52, 46); // glass
    g.fillStyle = dark ? "rgba(255,245,210,.55)" : "rgba(255,255,255,.35)"; g.fillRect(x, 30, 52, 12);
    g.fillStyle = dark ? "#cfd2dc" : "#f4f1ea"; g.fillRect(x + 25, 30, 3, 46);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function tileTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"); g.fillStyle = "#d9c7b4"; g.fillRect(0, 0, 64, 64); g.strokeStyle = "#b9a48d"; g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function mountCampus3D(host, { dark = false, onPick = () => {}, planFor = () => null } = {}) {
  const W = () => host.clientWidth || 600, H = () => host.clientHeight || 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.setSize(W(), H()); labels.domElement.className = "c3-labels"; host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, W() / H(), 0.3, 2000);
  // Narrow (phone) viewports need the camera further back to fit the whole campus.
  const far = () => Math.max(1, 1 / Math.min(1, W() / H())) ** 0.85;
  const HOME_T = new THREE.Vector3(0, 6, 12), homePos = () => new THREE.Vector3(70, 95, 135).sub(HOME_T).multiplyScalar(far()).add(HOME_T);
  camera.position.copy(homePos());
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME_T); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 15; controls.maxDistance = 420;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556b2f, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.6); sun.position.set(-80, 140, 60); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, far: 500 }); scene.add(sun);

  /* Ground, site, courtyard, roads */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x8fb36b, transparent: true }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
  const flat = (w, d, x, z, mat, y = 0.01) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, y, z + d / 2); m.receiveShadow = true; scene.add(m); return m; };
  const paving = new THREE.MeshStandardMaterial({ color: 0xcfc6bb, transparent: true });
  const site = flat(150, 140, -75, -50, paving, 0.005);
  const tiles = tileTexture(); tiles.repeat.set(COURTYARD.w / 4, COURTYARD.d / 4);
  const yard = flat(COURTYARD.w, COURTYARD.d, COURTYARD.x, COURTYARD.z, new THREE.MeshStandardMaterial({ map: tiles, transparent: true }), 0.02);
  const road = new THREE.MeshStandardMaterial({ color: 0x5b6170, transparent: true });
  const roads = [flat(420, 14, -200, 76, road), flat(12, 330, 64, -170, road), flat(12, 240, -120, -40, road), flat(130, 9, 64, 118, road)];
  const outdoor = [ground, site, yard, ...roads];

  /* Blocks: one mesh per floor so a floor can be cut away and highlighted. */
  const blocks = new Map(); const pickables = [];
  for (const b of BLOCKS) {
    const grp = new THREE.Group(); grp.userData.block = b.id; scene.add(grp);
    const floors = new Map();
    const tex = facadeTexture(b.color, dark);
    for (const f of floorsOf(b)) {
      const h = FLOOR_H - 0.15;
      const geo = b.hex ? new THREE.CylinderGeometry(b.foot.w / 1.85, b.foot.w / 1.85, h, 6) : new THREE.BoxGeometry(b.foot.w, h, b.foot.d);
      if (b.hex) geo.scale(1, 1, b.foot.d / b.foot.w);
      const t = tex.clone(); t.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(Math.max(b.foot.w, b.foot.d) / 6)), 1);
      const side = new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, roughness: 0.85, transparent: true });
      const cap = new THREE.MeshStandardMaterial({ color: f === b.top ? 0xe7ddd2 : 0xb8aca0, roughness: 0.9, transparent: true });
      const mesh = new THREE.Mesh(geo, b.hex ? side : [side, side, cap, cap, side, side]);
      mesh.position.set(b.foot.x + b.foot.w / 2, f * FLOOR_H + h / 2, b.foot.z + b.foot.d / 2);
      mesh.castShadow = mesh.receiveShadow = true; mesh.userData = { block: b.id, floor: f };
      mesh.visible = f >= 0; grp.add(mesh); pickables.push(mesh); floors.set(f, { mesh, side, cap });
    }
    const tag = document.createElement("div"); tag.className = "c3-tag" + (b.off ? " off" : ""); tag.textContent = b.short;
    tag.addEventListener("click", () => onPick(b.id, null));
    const lab = new CSS2DObject(tag); lab.position.set(b.foot.x + b.foot.w / 2, (b.top + 1) * FLOOR_H + 3, b.foot.z + b.foot.d / 2); grp.add(lab);
    blocks.set(b.id, { b, grp, floors, lab });
  }

  /* Route ribbon + markers */
  const routeGrp = new THREE.Group(); scene.add(routeGrp);
  const pin = (color) => { const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.4, 20, 14), m); head.position.y = 4.2; const tip = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.6, 16), m); tip.rotation.x = Math.PI; tip.position.y = 1.9; g.add(head, tip); return g; };
  const goal = pin(0x7c3aed), start = pin(0x22c55e); goal.visible = start.visible = false; scene.add(goal, start);
  const runner = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 12), new THREE.MeshStandardMaterial({ color: 0xa3e635, emissive: 0xa3e635, emissiveIntensity: 0.8 })); runner.visible = false; scene.add(runner);
  let curve = null, curveLen = 1;

  /* Focus / cut-away state */
  let focus = null, xray = false;
  function paint() {
    for (const { b, floors, lab } of blocks.values()) {
      const inFocus = focus && focus.block === b.id;
      for (const [f, fl] of floors) {
        const hideAbove = inFocus && focus.floor != null && f > focus.floor;
        const below = f < 0;
        fl.mesh.visible = !hideAbove && (!below || xray || (inFocus && focus.floor < 0 && f >= focus.floor));
        const sel = inFocus && focus.floor === f;
        const op = focus && !inFocus ? 0.18 : xray ? 0.35 : 1;
        fl.side.opacity = fl.cap.opacity = sel ? 1 : op;
        fl.side.depthWrite = fl.cap.depthWrite = op === 1;
        fl.side.emissive = new THREE.Color(sel ? 0x6d28d9 : 0x000000); fl.side.emissiveIntensity = sel ? 0.35 : 0;
        const plan = sel ? planFor(b.id, f) : null;
        if (plan && fl.planTex !== plan) {
          fl.planTex = plan;
          new THREE.TextureLoader().load(plan, (t) => {
            if (fl.planTex !== plan) return t.dispose(); // floor changed while the image loaded
            t.colorSpace = THREE.SRGBColorSpace; fl.cap.map?.dispose(); fl.cap.map = t; fl.cap.color.set(0xffffff); fl.cap.needsUpdate = true;
          });
        }
        if (!plan && fl.planTex) { fl.cap.map?.dispose(); fl.cap.map = null; fl.cap.needsUpdate = true; fl.planTex = null; }
        if (!sel) fl.cap.color.set(f === b.top ? 0xe7ddd2 : 0xb8aca0); else if (!plan) fl.cap.color.set(0xddd6fe);
      }
      lab.element.classList.toggle("dim", Boolean(focus && !inFocus));
    }
    const groundOp = xray || (focus && focus.floor < 0) ? 0.25 : 1;
    outdoor.forEach((m) => { m.material.opacity = groundOp; m.material.depthWrite = groundOp === 1; });
  }

  function focusOn(blockId, floor = null, { fly = true } = {}) {
    focus = blockId ? { block: blockId, floor } : null; paint();
    if (!fly) return;
    if (!blockId) return flyTo(homePos(), HOME_T.clone());
    const { b } = blocks.get(blockId), cx = b.foot.x + b.foot.w / 2, cz = b.foot.z + b.foot.d / 2, y = ((floor ?? b.top) + 1) * FLOOR_H;
    const r = (Math.max(b.foot.w, b.foot.d) * 1.6 + 25) * far();
    flyTo(new THREE.Vector3(cx + r * 0.6, y + r * 0.75, cz + r * 0.8), new THREE.Vector3(cx, y - 2, cz));
  }

  let fly = null;
  function flyTo(pos, target, ms = 900) { if (mode !== "orbit") return; fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms }; }

  function showRoute(points, { startAt = true } = {}) {
    routeGrp.clear(); goal.visible = start.visible = runner.visible = false; curve = null;
    if (!points || points.length < 2) return;
    const v = points.map((p) => new THREE.Vector3(p.x, p.f * FLOOR_H + 0.5, p.z));
    const path = new THREE.CurvePath();
    for (let i = 1; i < v.length; i++) if (v[i].distanceTo(v[i - 1]) > 0.01) path.add(new THREE.LineCurve3(v[i - 1], v[i]));
    curve = path; curveLen = Math.max(1, path.getLength());
    const tube = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(40, Math.round(curveLen)), 0.45, 8, false), new THREE.MeshStandardMaterial({ color: 0x7c3aed, emissive: 0x7c3aed, emissiveIntensity: 0.6, depthTest: false, transparent: true, opacity: 0.95 }));
    tube.renderOrder = 10; routeGrp.add(tube);
    goal.position.copy(v[v.length - 1]); goal.visible = true;
    start.position.copy(v[0]); start.visible = startAt; runner.visible = true;
    const last = points[points.length - 1], blk = BLOCKS.find((b) => last.x >= b.foot.x - 1 && last.x <= b.foot.x + b.foot.w + 1 && last.z >= b.foot.z - 1 && last.z <= b.foot.z + b.foot.d + 1);
    if (blk) focusOn(blk.id, last.f, { fly: mode === "orbit" });
  }

  /* Cameras: orbit (default), walk (first person on the ground), tour (follow the route) */
  let mode = "orbit", yaw = 0, pitch = 0, tourT = 0, tourPlaying = false, onTour = null;
  const tourDir = new THREE.Vector3(0, 0, -1);
  const keys = new Set(), joy = { x: 0, y: 0 };
  const solid = BLOCKS.map((b) => b.foot);
  function setMode(m) {
    mode = m; controls.enabled = m === "orbit";
    if (m === "walk") { focus = null; xray = false; paint(); camera.position.set(WALK0.x, EYE, WALK0.z); yaw = 0; pitch = 0; }
    start.visible = m !== "tour" && Boolean(curve);
    if (m === "tour") { tourT = 0; tourPlaying = true; xray = true; paint(); if (curve) { const p = curve.getPointAt(0); camera.position.set(p.x + 20, p.y + 24, p.z + 26); } }
    if (m === "orbit") { xray = false; paint(); camera.up.set(0, 1, 0); focusOn(focus?.block || null, focus?.floor ?? null); }
  }
  const WALK0 = { x: 22, z: 62 }; // just inside Entry 1
  const onKey = (e) => { if (mode !== "walk" || /input|textarea|select/i.test(e.target.tagName)) return; const k = e.key.toLowerCase(); if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { e.preventDefault(); e.type === "keydown" ? keys.add(k) : keys.delete(k); } };
  addEventListener("keydown", onKey); addEventListener("keyup", onKey);
  let drag = null;
  const el = renderer.domElement;
  const down = (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; };
  const move = (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY;
    if (mode === "walk") { yaw -= dx * 0.005; pitch = Math.max(-1.2, Math.min(1.2, pitch - dy * 0.004)); } };
  const up = (e) => { if (drag && drag.moved < 6) pick(e); drag = null; };
  el.addEventListener("pointerdown", down); addEventListener("pointermove", move); addEventListener("pointerup", up);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e) {
    if (mode === "tour") return;
    const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables.filter((m) => m.visible && m.material[0]?.opacity !== 0.18 && m.material.opacity !== 0.18), false)[0];
    if (hit) onPick(hit.object.userData.block, hit.object.userData.floor);
  }
  const blocked = (x, z) => solid.some((f) => x > f.x - 0.4 && x < f.x + f.w + 0.4 && z > f.z - 0.4 && z < f.z + f.d + 0.4);

  const clock = new THREE.Clock();
  let raf = 0, alive = true;
  function frame() {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta()), now = performance.now();
    if (fly) { const k = Math.min(1, (now - fly.start) / fly.ms), e = 1 - Math.pow(1 - k, 3); camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (k >= 1) fly = null; }
    if (mode === "orbit") controls.update();
    if (mode === "walk") {
      const f = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0) - joy.y;
      const s = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + joy.x;
      yaw -= ((keys.has("arrowright") ? 1 : 0) - (keys.has("arrowleft") ? 1 : 0)) * dt * 1.8;
      const sp = 5 * dt, dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp, dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp;
      if (!blocked(camera.position.x + dx, camera.position.z)) camera.position.x += dx;
      if (!blocked(camera.position.x, camera.position.z + dz)) camera.position.z += dz;
      camera.position.y = EYE;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    }
    if (curve && mode !== "tour") {
      const k = (now / 4000) % 1; runner.position.copy(curve.getPointAt(k));
      goal.position.y += Math.sin(now / 300) * 0.02;
    }
    if (mode === "tour" && curve) {
      if (tourPlaying) tourT = Math.min(1, tourT + (dt * 7) / curveLen);
      // Chase camera: behind and above the walker, so you see where you are among the blocks.
      const p = curve.getPointAt(tourT), back = curve.getPointAt(Math.max(0, tourT - 14 / curveLen));
      const dir = new THREE.Vector3(p.x - back.x, 0, p.z - back.z); if (dir.lengthSq() < 0.5) dir.copy(tourDir); else tourDir.copy(dir.normalize());
      const want = new THREE.Vector3(p.x - tourDir.x * 22, p.y + 15, p.z - tourDir.z * 22);
      camera.position.lerp(want, Math.min(1, dt * 3)); camera.lookAt(p.x, p.y + 1, p.z);
      runner.position.copy(p);
      onTour && onTour(tourT, Math.round((p.y - 0.5) / FLOOR_H));
      if (tourT >= 1 && tourPlaying) { tourPlaying = false; }
    }
    renderer.render(scene, camera); labels.render(scene, camera);
  }
  frame();
  const ro = new ResizeObserver(() => { camera.aspect = W() / H(); camera.updateProjectionMatrix(); renderer.setSize(W(), H()); labels.setSize(W(), H()); });
  ro.observe(host);

  let isDark = null;
  function setDark(d) {
    if (d === isDark) return; // rebuilding the facades is costly; only on a real theme change
    isDark = d;
    scene.background = new THREE.Color(d ? 0x0b1124 : 0xcfe6f7); scene.fog = new THREE.Fog(d ? 0x0b1124 : 0xcfe6f7, 260, 900);
    hemi.intensity = d ? 0.45 : 0.9; sun.intensity = d ? 0.5 : 1.6; sun.color.set(d ? 0x9fb4ff : 0xfff1dc);
    for (const { b, floors } of blocks.values()) { const t = facadeTexture(b.color, d); for (const fl of floors.values()) { const m = t.clone(); m.needsUpdate = true; m.repeat.copy(fl.side.map.repeat); fl.side.map.dispose(); fl.side.map = m; fl.side.needsUpdate = true; } t.dispose(); }
  }
  setDark(dark);

  return {
    focusOn, showRoute, setMode, setDark, refreshPlans: () => { for (const { floors } of blocks.values()) for (const fl of floors.values()) fl.planTex = fl.planTex && "stale"; paint(); },
    setXray: (on) => { xray = on; paint(); }, joystick: (x, y) => { joy.x = x; joy.y = y; },
    tour: { play: () => { if (tourT >= 1) tourT = 0; tourPlaying = true; }, pause: () => { tourPlaying = false; }, get playing() { return tourPlaying; }, onProgress: (fn) => { onTour = fn; } },
    get mode() { return mode; },
    floorTag: floorShort,
    snapshot: () => renderer.domElement.toDataURL("image/png"),
    dispose() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("keydown", onKey); removeEventListener("keyup", onKey); removeEventListener("pointermove", move); removeEventListener("pointerup", up); controls.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); [].concat(o.material || []).forEach((m) => { m.map?.dispose(); m.dispose(); }); });
      renderer.dispose(); renderer.forceContextLoss(); host.innerHTML = ""; }
  };
}

export const webglOK = () => { try { const c = document.createElement("canvas"); return Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); } catch { return false; } };

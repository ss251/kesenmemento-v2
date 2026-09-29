// Vessel name labels: DOM, projected every frame, serif name over a thin leader line (船名 / 漁法 · 魚種 / time).
// Decluttered (nearer labels win, overlapping ones fade out) and distance-faded; hidden with the UI (H, ui=0).
import * as THREE from "three";
import { t, getLang } from "../../lib/i18n.js";

export function createLabels(root = document.getElementById("boat-labels")) {
  if (!root) { root = document.createElement("div"); root.id = "boat-labels"; document.body.appendChild(root); }
  root.setAttribute("aria-hidden", "true");
  const pool = new Map();                                        // id -> { el, name, meta, shown }
  const v = new THREE.Vector3();
  let enabled = true;

  function el(id) {
    let p = pool.get(id);
    if (!p) {
      const e = document.createElement("div"); e.className = "boat-label";
      e.innerHTML = `<div class="bl-card"><b class="bl-name"></b><span class="bl-meta"></span></div><i class="bl-stem"></i>`;
      root.appendChild(e);
      p = { el: e, name: e.querySelector(".bl-name"), meta: e.querySelector(".bl-meta"), key: "" };
      pool.set(id, p);
    }
    return p;
  }

  /**
   * items: [{ id, anchor: Vector3 (world), name, kindLabel, catch, time, state }]; camera; size {w, h} (CSS px)
   */
  function update(items, camera, size, on = true) {
    const show = enabled && on && camera && size.w > 0;
    root.classList.toggle("off", !show);
    if (!show) return;
    const placed = [], seen = new Set();
    const sorted = items.map((it) => ({ it, dist: camera.position.distanceTo(it.anchor) })).sort((a, b) => a.dist - b.dist);
    for (const { it, dist } of sorted) {
      const p = el(it.id); seen.add(it.id);
      v.copy(it.anchor).project(camera);
      const behind = v.z > 1 || v.z < -1, x = (v.x * 0.5 + 0.5) * size.w, y = (-v.y * 0.5 + 0.5) * size.h;
      // stem length: the label floats ~34 px above the mast top, shorter when far
      const fade = 1 - THREE.MathUtils.smoothstep(dist, 2200, 3600);
      let vis = !behind && x > -80 && x < size.w + 80 && y > 20 && y < size.h - 40 && fade > 0.02;
      const w = 150, h = 40, stem = 18 + 22 * (1 - THREE.MathUtils.smoothstep(dist, 300, 2000));
      const box = { x0: x - w / 2, x1: x + w / 2, y0: y - stem - h, y1: y - stem };
      if (vis && placed.some((b) => !(box.x1 < b.x0 || box.x0 > b.x1 || box.y1 < b.y0 || box.y0 > b.y1))) vis = false;
      if (vis) placed.push(box);
      const key = `${getLang()}|${it.name}|${it.kindLabel}|${it.catch}|${it.time}|${it.state}`;
      if (key !== p.key) {
        p.key = key; p.name.textContent = it.name;
        const st = it.state === "under-way" ? t("boats.inbound") : t("boats.moored");
        p.meta.textContent = [it.kindLabel, it.catch, `${st} ${it.time}`].filter(Boolean).join(" · ");
        p.el.dataset.state = it.state;
      }
      p.el.style.opacity = vis ? String(Math.min(1, fade * 1.2)) : "0";
      if (vis) p.el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y - stem).toFixed(1)}px, 0)`;
      p.el.style.setProperty("--stem", `${stem.toFixed(0)}px`);
    }
    for (const [id, p] of pool) if (!seen.has(id)) { p.el.remove(); pool.delete(id); }
  }
  return { update, root, setEnabled(on) { enabled = on; root.classList.toggle("off", !on); }, get enabled() { return enabled; } };
}

/** label text parts for an arrival record (JA/EN) */
export function labelParts(a, kind) {
  const en = getLang() === "en";
  const kinds = { pole: t("boats.kind.pole"), longline: t("boats.kind.longline"), saury: t("boats.kind.saury"), seine: t("boats.kind.seine") };
  return {
    name: a.vessel ?? "—",
    kindLabel: kinds[kind] ?? kinds.pole,
    catch: en ? cap(a.catchEn ?? a.catch ?? "") : a.catch ?? "",
    time: a.eta?.estimated ? t("boats.auction") : a.time ?? "",
  };
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

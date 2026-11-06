import { useEffect, useRef, type RefObject } from "react";
import { seeded, wordBitmap } from "./pixels.js";

/**
 * The hero canvas. A field of faint squares, dense at the edges and calm behind the text, and
 * the LIFEBOAT wordmark etched in by signals running across a grid, the way a signature is
 * built up one key at a time. After the intro, signals keep crossing it now and then, and the
 * pointer breaks the letters up wherever it passes.
 *
 * `slot` is an empty element in the layout that reserves the wordmark's place; `calm` is the
 * text column, where the field stays nearly empty so copy stays readable.
 */

type Shade = 0 | 1 | 2 | 3; // empty, light, accent, ink
const MARGIN = 5; // region cells around the word where signals may run
const SUB = 2; // letter pixels split into SUB × SUB cells where there is room
const INTRO = 2.6; // seconds until every letter cell has locked in

interface Walker {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  acc: number;
  turn: number;
  shade: Shade;
}

export function PixelHero({ slot, calm }: { slot: RefObject<HTMLElement | null>; calm: RefObject<HTMLElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current!;
    const host = cv.parentElement!;
    const ctx = cv.getContext("2d")!;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const base = wordBitmap();
    // Each letter pixel becomes sub × sub smaller cells on wide screens; phones keep them whole.
    const expand = (sub: number) => ({
      cols: base.cols * sub,
      rows: base.rows * sub,
      cells: base.cells.flatMap(([c, r]) => {
        const out: [number, number, number][] = [];
        for (let dy = 0; dy < sub; dy++) for (let dx = 0; dx < sub; dx++) out.push([c * sub + dx, r * sub + dy, r * 1000 + c]);
        return out;
      }),
    });
    let bitmap = expand(SUB);
    const rnd = Math.random;

    let colors = { ink: "#000", accent: "#000", light: "#ccc", field: "#ddd", field2: "#ccc" };
    const readColors = () => {
      const s = getComputedStyle(cv);
      const v = (n: string) => s.getPropertyValue(n).trim();
      colors = { ink: v("--px-ink"), accent: v("--px-accent"), light: v("--px-light"), field: v("--px-field"), field2: v("--px-field-2") };
    };

    // Layout, rebuilt on resize.
    let W = 0, H = 0, cell = 8, size = 7, rx = 0, ry = 0, RC = 0, RR = 0;
    let target = new Uint8Array(0); // final shade per region cell
    let lockAt = new Float32Array(0);
    let heat = new Float32Array(0);
    let heatShade = new Uint8Array(0);
    let knock = new Float32Array(0); // letter hidden until this time (pointer)
    let field: { x: number; y: number; s: number; tone: number; a: number; on: boolean }[] = [];
    let fsize = 8;

    function layout() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const box = host.getBoundingClientRect();
      W = box.width;
      H = box.height;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      cv.style.width = `${W}px`;
      cv.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sl = slot.current?.getBoundingClientRect();
      const sx = sl ? sl.left - box.left : W * 0.1;
      const sy = sl ? sl.top - box.top : H * 0.35;
      const sw = sl ? sl.width : W * 0.8;
      bitmap = expand(sw >= 640 ? SUB : 1);
      const sh = sl ? sl.height : H * 0.2;
      cell = Math.max(3, Math.floor(Math.min(sw / bitmap.cols, sh / bitmap.rows)));
      size = cell - Math.max(1, Math.round(cell * 0.12));
      const ox = Math.round(sx + (sw - cell * bitmap.cols) / 2);
      const oy = Math.round(sy + (sh - cell * bitmap.rows) / 2);
      RC = bitmap.cols + MARGIN * 2;
      RR = bitmap.rows + MARGIN * 2;
      rx = ox - MARGIN * cell;
      ry = oy - MARGIN * cell;

      const n = RC * RR;
      target = new Uint8Array(n);
      lockAt = new Float32Array(n);
      heat = new Float32Array(n);
      heatShade = new Uint8Array(n);
      knock = new Float32Array(n);
      const r = seeded(8141);
      // Shade comes in clusters: each letter pixel picks a tone, and its small cells mostly keep it.
      const tone = new Map<number, Shade>();
      for (const [c, rw, id] of bitmap.cells) {
        if (!tone.has(id)) {
          const v = r();
          tone.set(id, v < 0.72 ? 3 : v < 0.93 ? 2 : 1);
        }
        const i = (rw + MARGIN) * RC + (c + MARGIN);
        const v = r();
        target[i] = v < 0.9 ? tone.get(id)! : v < 0.96 ? 2 : 1;
        lockAt[i] = 0.35 + (c / bitmap.cols) * 1.5 + r() * 0.6;
      }

      // The field shares the word's grid at twice the pitch, so everything lines up.
      const pitch = cell * 3;
      fsize = Math.round(pitch * 0.58);
      const fx0 = ((ox % pitch) + pitch) % pitch;
      const fy0 = ((oy % pitch) + pitch) % pitch;
      const cb = calm.current?.getBoundingClientRect();
      const calmBox = cb && { l: cb.left - box.left - pitch, t: cb.top - box.top - pitch, r: cb.right - box.left + pitch, b: cb.bottom - box.top + pitch };
      const fr = seeded(1337);
      field = [];
      for (let y = fy0; y < H; y += pitch) {
        for (let x = fx0; x < W; x += pitch) {
          const nx = x / W, ny = y / H;
          const ex = Math.max(0, 1 - Math.min(nx, 1 - nx) / 0.24);
          const ey = Math.max(0, (ny - 0.68) / 0.32);
          let p = 0.02 + 0.55 * ex * ex + 0.42 * ey * ey;
          const inWord = x + fsize > rx && x < rx + RC * cell && y + fsize > ry && y < ry + RR * cell;
          if (inWord) p = 0;
          else if (calmBox && x + fsize > calmBox.l && x < calmBox.r && y + fsize > calmBox.t && y < calmBox.b) p *= 0.08;
          const on = fr() < p;
          if (p > 0) field.push({ x, y, s: p, tone: fr() < 0.2 ? 2 : 1, a: on ? 1 : 0, on });
        }
      }
    }

    // Signals that run along the grid, mostly sideways, now and then dropping a row or two.
    const walkers: Walker[] = [];
    function spawn(x?: number, y?: number, dir?: number) {
      const d = dir ?? (rnd() < 0.72 ? 1 : -1);
      walkers.push({
        x: x ?? (d > 0 ? 0 : RC - 1),
        y: y ?? Math.floor(rnd() * RR),
        dx: d,
        dy: 0,
        speed: 28 + rnd() * 40,
        acc: 0,
        turn: 0,
        shade: (rnd() < 0.55 ? 1 : rnd() < 0.8 ? 2 : 3) as Shade,
      });
    }

    function stepWalkers(dt: number) {
      for (let k = walkers.length - 1; k >= 0; k--) {
        const w = walkers[k]!;
        w.acc += w.speed * dt;
        while (w.acc >= 1) {
          w.acc -= 1;
          if (w.turn > 0) {
            w.turn--;
            if (w.turn === 0) w.dy = 0;
          } else if (rnd() < 0.06) {
            w.dy = rnd() < 0.5 ? 1 : -1;
            w.turn = 1 + Math.floor(rnd() * 4);
          }
          if (w.dy) w.y += w.dy;
          else w.x += w.dx;
          if (w.x < 0 || w.x >= RC || w.y < 0 || w.y >= RR) {
            walkers.splice(k, 1);
            break;
          }
          const i = w.y * RC + w.x;
          heat[i] = 1;
          heatShade[i] = w.shade;
        }
      }
    }

    // The pointer, in region cells.
    let px = -99, py = -99, pointerAt = -1;
    const onMove = (e: PointerEvent) => {
      const b = host.getBoundingClientRect();
      px = (e.clientX - b.left - rx) / cell;
      py = (e.clientY - b.top - ry) / cell;
      pointerAt = t;
    };
    const onLeave = () => {
      px = py = -99;
    };

    function disturb() {
      if (px < -2 || py < -2 || px > RC + 2 || py > RR + 2 || t - pointerAt > 0.6) return;
      const R = 2.6;
      for (let y = Math.floor(py - R); y <= py + R; y++) {
        for (let x = Math.floor(px - R); x <= px + R; x++) {
          if (x < 0 || y < 0 || x >= RC || y >= RR) continue;
          if ((x - px) ** 2 + (y - py) ** 2 > R * R) continue;
          const i = y * RC + x;
          if (rnd() < 0.3) {
            heat[i] = 1;
            heatShade[i] = (rnd() < 0.6 ? 1 : 2) as Shade;
          }
          if (target[i] && rnd() < 0.5) knock[i] = t + 0.25 + rnd() * 0.5;
        }
      }
      if (rnd() < 0.12) spawn(Math.max(0, Math.min(RC - 1, Math.round(px))), Math.max(0, Math.min(RR - 1, Math.round(py))), rnd() < 0.5 ? 1 : -1);
    }

    const shadeColor = (s: number) => (s === 3 ? colors.ink : s === 2 ? colors.accent : colors.light);

    function draw() {
      ctx.clearRect(0, 0, W, H);
      for (const f of field) {
        if (f.a <= 0.01) continue;
        ctx.globalAlpha = f.a;
        ctx.fillStyle = f.tone === 2 ? colors.field2 : colors.field;
        ctx.fillRect(f.x, f.y, fsize, fsize);
      }
      for (let y = 0; y < RR; y++) {
        for (let x = 0; x < RC; x++) {
          const i = y * RC + x;
          const locked = target[i]! > 0 && t >= lockAt[i]! && t >= knock[i]!;
          const flash = target[i]! > 0 && t >= lockAt[i]! && t < lockAt[i]! + 0.14;
          // Solid squares only: a fading signal steps down through the shades instead of turning translucent.
          let shade = 0;
          const h = heat[i]!;
          if (h > 0.55) shade = heatShade[i]!;
          else if (h > 0.22) shade = locked ? target[i]! : 1;
          else if (flash) shade = 1;
          else if (locked) shade = target[i]!;
          if (!shade) continue;
          ctx.globalAlpha = 1;
          ctx.fillStyle = shadeColor(shade);
          ctx.fillRect(rx + x * cell, ry + y * cell, size, size);
        }
      }
      ctx.globalAlpha = 1;
    }

    let t = 0;
    let last = 0;
    let raf = 0;
    let visible = true;
    let nextSpawn = 0;

    function frame(now: number) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      t += dt;
      const intro = t < INTRO;
      nextSpawn -= dt;
      if (nextSpawn <= 0) {
        spawn();
        nextSpawn = intro ? 0.03 + rnd() * 0.05 : 0.5 + rnd() * 1.4;
      }
      stepWalkers(dt);
      disturb();
      const decay = Math.exp(-dt / 0.3);
      for (let i = 0; i < heat.length; i++) if (heat[i]! > 0) heat[i]! *= decay;
      // The field breathes: a few squares fade in or out each second.
      if (field.length && rnd() < dt * 14) {
        const f = field[Math.floor(rnd() * field.length)]!;
        f.on = rnd() < f.s * 1.1;
      }
      const fstep = dt / 0.6;
      for (const f of field) f.a = f.on ? Math.min(1, f.a + fstep) : Math.max(0, f.a - fstep);
      draw();
      if (visible && !document.hidden) raf = requestAnimationFrame(frame);
      else raf = 0;
    }

    const start = () => {
      if (raf || still.matches) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    function setup() {
      readColors();
      layout();
      if (still.matches) {
        t = 99;
        heat.fill(0);
        draw();
      } else start();
    }

    setup();
    const ro = new ResizeObserver(() => {
      if (t < INTRO) t = INTRO; // don't replay the intro on every resize
      layout();
      if (still.matches) draw();
    });
    ro.observe(host);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible) start();
    });
    io.observe(host);
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => (readColors(), still.matches && draw());
    scheme.addEventListener("change", recolor);
    const vis = () => !document.hidden && start();
    document.addEventListener("visibilitychange", vis);
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scheme.removeEventListener("change", recolor);
      document.removeEventListener("visibilitychange", vis);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, [slot, calm]);

  return <canvas ref={canvas} className="hero-canvas" aria-hidden />;
}

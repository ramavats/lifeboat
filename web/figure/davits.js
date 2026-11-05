/**
 * Davits: a lifeboat hangs outboard of a ship's side from two curved davits.
 * The pointer's height lowers it down its falls to the water on one spring.
 * At rest it hangs a third of the way down, swung out and ready, and its
 * canopy carries the bright stroke. While it is lowering the falls take the
 * bright; once afloat, the hull does. The slider is the pointer travel, in
 * viewBox units, that a full launch takes: less travel, a stronger answer.
 *
 * The pattern: a continuous answer. One spring, a hit band fixed on screen
 * (it never follows the boat), and a rest that already tells the story.
 */
const {
  Cam, clamp, facing, fillet, fit, hull, open, poly, prism, proj, rings, ringAt, run, seg, spring, stepS,
  mk, pointer, put, register, disposer, solid,
} = HL;

const DECK = 50; // deck height above the water
const SHIP = [0, 0, 150, 22]; // the ship's side: x0, y0, x1, y1; the side faces +y, outboard
const BX0 = 38, BX1 = 112, BY0 = 40, BY1 = 62, BYM = (BY0 + BY1) / 2; // the boat's gunwale
const BH = 12, CH = 11; // hull depth, canopy height
const STOWED = DECK + 10, AFLOAT = -3, REST = 0.46; // keel heights, and rest as a share of the way down
const DAVITS = [52, 98], TIP = DECK + 40;
const keelAt = (f) => STOWED + (AFLOAT - STOWED) * f;

/** The boat in plan: a flat transom aft, a pointed bow forward, every corner rounded. */
const PLAN = fillet([[BX0, BY0 + 3], [BX1 - 20, BY0], [BX1, BYM], [BX1 - 20, BY1], [BX0, BY1 - 3]], [4, 18, 7, 18, 4], 5);
const CX = PLAN.reduce((a, p) => a + p[0], 0) / PLAN.length;

/** A plan scaled about its middle, as a ring of samples with outward normals. */
function shape(sx, sy) {
  const pts = PLAN.map(([x, y]) => [CX + (x - CX) * sx, BYM + (y - BYM) * sy]);
  const n = pts.length, area = pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * p[1], 0);
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let nu = b[1] - a[1], nv = a[0] - b[0];
    if (area < 0) { nu = -nu; nv = -nv; }
    const l = Math.hypot(nu, nv) || 1;
    return { u: p[0], v: p[1], nu: nu / l, nv: nv / l };
  });
}

/** A davit: up from the deck edge, then a swan neck reaching outboard over the boat. */
const davitPts = (x) => [[x, 20, DECK], [x, 20, DECK + 24], [x, 23, DECK + 34], [x, 31, DECK + 40], [x, 41, DECK + 42], [x, BYM, TIP]];

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.78);
  fit(C, [
    [SHIP[0], SHIP[1], 0], [SHIP[2], SHIP[1], DECK + 6], [SHIP[2], SHIP[3], 0], [SHIP[0], SHIP[3], DECK + 42],
    [BX0, BY1, AFLOAT], [BX1, BY1, AFLOAT], [BX0, BY0, STOWED + BH + CH],
  ], 200, 166);
  const P = proj(C), front = facing(C);
  let band = value, over = null;
  const g = mk("g", {}, svg);

  // Where the boat will float, painted first: a guide it settles onto.
  mk("path", { class: "dash nf", d: poly(ringAt(P, shape(0.92, 0.85), 0)) }, g);

  // The ship's side: a long plate standing on the water, with portholes and a rail.
  const [sr, si] = rings(SHIP[0], SHIP[1], SHIP[2], SHIP[3], 5, 1.6);
  put(solid(g), prism(P, front, sr, si, 0, DECK));
  const marks = [], RAIL = DECK + 7;
  for (let k = 0; k < 6; k++) {
    const cx = 13 + k * 25, cz = DECK - 16, pts = [];
    for (let a = 0; a < 12; a++) pts.push(P(cx + 3 * Math.cos((a / 6) * Math.PI), SHIP[3], cz + 3 * Math.sin((a / 6) * Math.PI)));
    marks.push(poly(pts));
  }
  marks.push(open([P(SHIP[0] + 4, SHIP[3], RAIL), P(SHIP[2] - 4, SHIP[3], RAIL)]));
  for (let x = SHIP[0] + 8; x < SHIP[2]; x += 14) marks.push(seg(P(x, SHIP[3], DECK), P(x, SHIP[3], RAIL)));
  mk("path", { class: "lo nf", d: marks.join(" ") }, g);

  // The boat: a hull that narrows to its keel, under a domed canopy.
  const boat = mk("g", {}, g);
  const keel = shape(0.78, 0.42), gun = shape(1, 1), gunIn = shape(0.97, 0.88);
  const cFoot = shape(0.72, 0.78), cTop = shape(0.5, 0.42), cIn = shape(0.46, 0.34);
  const hullEl = solid(boat), canEl = solid(boat);
  const solidOf = (foot, top, inner, z0, z1) => ({
    sil: poly(hull(ringAt(P, foot, z0).concat(ringAt(P, top, z1)))),
    crease: open(ringAt(P, run(inner, front), z1)),
  });

  // The davits and the falls come after the boat: they reach over it.
  mk("path", { class: "sil nf", d: DAVITS.map((x) => open(davitPts(x).map((p) => P(...p)))).join(" ") }, g);
  const falls = mk("path", { class: "lo nf" }, g);

  const sp = spring(REST, { eps: 0.002 });
  let drawn = NaN, lit = "";

  function draw() {
    if (sp.x === drawn) return;
    drawn = sp.x;
    const z = keelAt(sp.x);
    put(hullEl, solidOf(keel, gun, gunIn, z, z + BH));
    put(canEl, solidOf(cFoot, cTop, cIn, z + BH, z + BH + CH));
    falls.setAttribute("d", DAVITS.map((x) => seg(P(x, BYM, TIP), P(x, BYM, z + BH + CH))).join(" "));
  }

  /** One bright place: the canopy at rest, the falls while lowering, the hull once afloat. */
  function light() {
    const t = sp.t, now = over === null ? "canopy" : t >= 0.96 ? "hull" : t > 0.04 ? "falls" : "canopy";
    if (now === lit) return;
    lit = now;
    canEl.sil.classList.toggle("hi", now === "canopy");
    hullEl.sil.classList.toggle("hi", now === "hull");
    falls.setAttribute("class", now === "falls" ? "hi nf" : "lo nf");
  }

  const B = register(stage, (dt) => {
    const m = stepS(sp, dt);
    draw();
    return m;
  });
  bag.add(B.unregister);

  // The hit band is fixed on screen, centred between the stowed and the
  // afloat boat; it never moves with the boat (rule 01).
  const mid = (P(CX, BYM, STOWED)[1] + P(CX, BYM, AFLOAT)[1]) / 2;

  function retarget() {
    if (over === null) {
      sp.t = REST;
      read.textContent = "rest";
    } else {
      const f = clamp((over - (mid - band / 2)) / band, 0, 1);
      sp.t = f;
      read.textContent = f >= 0.96 ? "afloat" : f <= 0.04 ? "stowed" : `lowering ${Math.round(f * 100)}%`;
    }
    light();
    B.wake();
  }

  draw();
  light();
  bag.add(pointer(stage, {
    move: (p) => { over = p[1]; retarget(); },
    leave: () => { over = null; retarget(); },
  }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { band = v; if (over !== null) retarget(); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "davits",
  means: "A lifeboat hangs from its davits; the pointer's height lowers it down its falls to the water.",
  rules: [1, 4, 5, 9],
  range: [150, 110, 70],
  tour: [[151, 150], [151, 208], [151, 260], null],
  mount,
});

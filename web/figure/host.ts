/**
 * Mounts a Hairline figure written with the hairline-create skill (web/figure/<name>.js) into a
 * page element, the way the skill's bench page does, without the bench's controls.
 *
 * kernel.js is the skill's engine, copied unchanged (MIT, lucasmarkes/hairline). It defines a
 * global `HL`; a figure reads `HL` and ends by calling `hairline({ … mount })`. Both run here as
 * plain scripts with those two names passed in, so neither leaks into the page's globals.
 */
import kernelSrc from "./kernel.js?raw";
import davitsSrc from "./davits.js?raw";

type HLKernel = Record<string, any>;
interface FigureDef {
  name: string;
  means: string;
  range: [number, number, number];
  tour: ([number, number] | null)[] | null;
  mount: (host: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string } }, value: number) => {
    set: (v: number) => void;
    destroy: () => void;
  };
}

let HL: HLKernel | null = null;
const kernel = (): HLKernel => (HL ??= new Function(`${kernelSrc}\n;return HL;`)() as HLKernel);

function load(src: string): FigureDef {
  let def: FigureDef | null = null;
  new Function("HL", "hairline", src)(kernel(), (d: FigureDef) => (def = d));
  if (!def) throw new Error("figure did not call hairline()");
  return def;
}

const FIGURES: Record<string, string> = { davits: davitsSrc };

/** Intensity 0..1 to the figure's own number: two straight lines meeting at 0.5, as the bench does. */
const at = ([lo, mid, hi]: [number, number, number], i: number) => (i <= 0.5 ? lo + (i / 0.5) * (mid - lo) : mid + ((i - 0.5) / 0.5) * (hi - mid));

export function mountFigure(
  stage: HTMLElement,
  name: keyof typeof FIGURES,
  opts: { intensity?: number; play?: boolean; onRead?: (text: string) => void } = {},
): () => void {
  const hl = kernel();
  const def = load(FIGURES[name]!);
  hl.inject(stage.ownerDocument);
  stage.setAttribute("data-hairline", def.name);
  stage.setAttribute("role", "img");
  stage.setAttribute("aria-label", def.means);
  const svg = hl.mk("svg", { viewBox: "0 0 400 320", "aria-hidden": "true" }, stage) as SVGSVGElement;

  let text = "rest";
  const read = {
    get textContent() {
      return text;
    },
    set textContent(v: string) {
      text = v == null ? "" : String(v);
      opts.onRead?.(text);
    },
  };
  const handle = def.mount({ stage, svg, read }, at(def.range, opts.intensity ?? 0.5));
  // The tour walks the figure while nobody's hand is on it, and gives way to a real pointer.
  const playing = opts.play ? hl.tour(stage, def.tour ?? hl.LAP, () => {}) : null;

  return () => {
    playing?.stop();
    handle.destroy();
    svg.remove();
  };
}

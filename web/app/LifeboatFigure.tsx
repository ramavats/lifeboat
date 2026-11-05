import { useEffect, useRef, useState } from "react";
import { mountFigure } from "../figure/host.js";

/**
 * The hero: a lifeboat on its davits, drawn for Lifeboat with the hairline-create skill
 * (web/figure/davits.js). The pointer's height lowers the boat to the water; with no hand on
 * it, the figure walks its own tour. The read-out under it is the figure's own caption.
 */
export function LifeboatFigure() {
  const stage = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState("rest");
  useEffect(() => {
    if (!stage.current) return;
    return mountFigure(stage.current, "davits", { intensity: 0.5, play: true, onRead: setRead });
  }, []);
  return (
    <figure style={{ margin: 0 }}>
      <div ref={stage} className="figure-slot" />
      <figcaption className="meta" style={{ textAlign: "right", marginTop: -8 }} aria-hidden>
        {read === "rest" ? "swung out, ready" : read}
      </figcaption>
    </figure>
  );
}

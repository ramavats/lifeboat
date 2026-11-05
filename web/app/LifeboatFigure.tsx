import { Vault } from "@lucasmarkes/hairline/react";

/**
 * The hero figure. TEMPORARY: Hairline's built-in Vault stands in until the custom lifeboat
 * figure is drawn with the hairline-create skill. Swap the component here; the slot keeps its
 * 5:4 ratio so nothing around it moves.
 */
export function LifeboatFigure() {
  return (
    <div className="figure-slot">
      <Vault intensity={0.5} play aria-label="A vault door whose bolts draw back as the dial turns" />
    </div>
  );
}

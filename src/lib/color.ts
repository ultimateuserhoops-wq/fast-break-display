// The app renders on a white background, so a white (or near-white) team/player colour
// makes names and numbers invisible. Use `ink()` when a team/player colour drives TEXT,
// and `nonWhite()` to clamp a colour at the moment it's chosen/saved.

const FALLBACK = "#111827"; // slate-900 — legible on white

/** True for white / near-white (any near-max-brightness colour) or empty. */
export function isWhitish(c?: string | null): boolean {
  if (!c) return false;
  const s = c.trim().toLowerCase();
  if (s === "white" || s === "#fff" || s === "#ffffff") return true;
  let r = 255, g = 255, b = 255;
  const hex = s.replace("#", "");
  if (/^[0-9a-f]{3}$/.test(hex)) { r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16); }
  else if (/^[0-9a-f]{6}$/.test(hex)) { r = parseInt(hex.slice(0, 2), 16); g = parseInt(hex.slice(2, 4), 16); b = parseInt(hex.slice(4, 6), 16); }
  else { const m = s.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/); if (m) { r = +m[1]; g = +m[2]; b = +m[3]; } else return false; }
  return r >= 230 && g >= 230 && b >= 230;
}

/** Colour to use for TEXT on the white background — swaps white/near-white for a dark ink. */
export function ink(c?: string | null, fallback = FALLBACK): string {
  return !c || isWhitish(c) ? fallback : c;
}

/** Clamp a colour being chosen/saved so white/near-white is never stored. */
export function nonWhite(c?: string | null, fallback = FALLBACK): string {
  return isWhitish(c) ? fallback : (c || fallback);
}

/** Parse a hex/rgb colour to [r,g,b] (0–255); defaults to mid-grey if unparseable. */
function rgb(c?: string | null): [number, number, number] {
  const s = (c || "").trim().toLowerCase();
  const hex = s.replace("#", "");
  if (/^[0-9a-f]{3}$/.test(hex)) return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  if (/^[0-9a-f]{6}$/.test(hex)) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  const m = s.match(/rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return [128, 128, 128];
}

/** Black or white TEXT that contrasts ON a given background colour (for solid buttons/chips). */
export function contrastText(bg?: string | null): string {
  const [r, g, b] = rgb(bg);
  // perceived luminance (sRGB) — light backgrounds get dark text, dark get white
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#111827" : "#ffffff";
}

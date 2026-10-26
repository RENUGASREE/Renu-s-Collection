import { getAssetUrl } from "../queryClient";

export const GEMSTONE_COLORS: Array<[string, string]> = [
  ["rose quartz", "#F4B0C0"],
  ["amethyst", "#9B71C0"],
  ["turquoise", "#3DADA0"],
  ["lapis", "#2D4A88"],
  ["jade", "#4EA870"],
  ["onyx", "#282820"],
  ["black", "#2E2828"],
  ["garnet", "#8C2040"],
  ["carnelian", "#C85030"],
  ["coral", "#D87060"],
  ["red", "#D05050"],
  ["orange", "#E08040"],
  ["amber", "#C88030"],
  ["citrine", "#E0B040"],
  ["yellow", "#D4A840"],
  ["gold", "#C09840"],
  ["green", "#508050"],
  ["teal", "#408080"],
  ["blue", "#5070B0"],
  ["purple", "#8060A8"],
  ["lavender", "#B090D0"],
  ["pink", "#F090A8"],
  ["white", "#F0ECE8"],
  ["ivory", "#EEE8D8"],
  ["cream", "#E8DEC8"],
  ["grey", "#A09898"],
  ["gray", "#A09898"],
  ["silver", "#B8B8C0"],
  ["brown", "#7A5848"],
  ["pearl", "#EDE8DC"],
  ["crystal", "#D8E4EF"],
  ["tiger", "#C07030"],
  ["malachite", "#388050"],
  ["sodalite", "#304878"],
  ["moonstone", "#CDD8E8"],
  ["aquamarine", "#60B8C0"],
  ["peridot", "#8AB840"],
  ["ruby", "#C02040"],
  ["emerald", "#288050"],
  ["sapphire", "#1840A0"],
  ["opal", "#E8D8C0"],
  ["clear", "#E0ECF4"],
];

export const NEUTRAL_BEAD_FALLBACK = "#B99A72"; // Champagne gold neutral fallback

export function colorFromStrings(
  color?: string,
  finish?: string,
  displayName?: string,
  variantSku?: string
): string {
  const text = `${color ?? ""} ${finish ?? ""} ${displayName ?? ""} ${variantSku ?? ""}`
    .toLowerCase()
    .trim();

  if (!text) return NEUTRAL_BEAD_FALLBACK;

  for (const [key, hex] of GEMSTONE_COLORS) {
    if (text.includes(key)) return hex;
  }

  return NEUTRAL_BEAD_FALLBACK;
}

export function lightenHex(hex: string, amount = 0.38): string {
  const clean = hex.startsWith("#") ? hex.slice(1) : hex;
  const r = parseInt(clean.slice(0, 2), 16) || 185;
  const g = parseInt(clean.slice(2, 4), 16) || 154;
  const b = parseInt(clean.slice(4, 6), 16) || 114;
  const toHex = (n: number) =>
    Math.round(n + (255 - n) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export interface BeadAppearanceInput {
  color?: string;
  finish?: string;
  displayName?: string;
  variantSku?: string;
  renderAssetUrl?: string;
  imageUrl?: string;
}

export interface BeadAppearance {
  color: string;
  lightColor: string;
  imageSrc: string | null;
}

export function getBeadAppearance(bead: BeadAppearanceInput): BeadAppearance {
  const color = colorFromStrings(
    bead.color,
    bead.finish,
    bead.displayName,
    bead.variantSku
  );
  const lightColor = lightenHex(color);

  let rawSrc = bead.renderAssetUrl || bead.imageUrl || null;
  // Ignore generic placeholder pngs for bead texture
  if (rawSrc && rawSrc.includes("placeholder")) {
    rawSrc = null;
  }

  const imageSrc = rawSrc ? getAssetUrl(rawSrc) : null;

  return {
    color,
    lightColor,
    imageSrc,
  };
}

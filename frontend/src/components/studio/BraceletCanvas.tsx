import React, { useMemo } from "react";
import { getAssetUrl } from "@/lib/queryClient";
import type { BraceletDesign, BeadPlacement, CharmAttachment } from "@/lib/studio/designState";
import type { PublicMaterial } from "@/lib/studio/studioApi";

// ============================================================================
// CONSTANTS
// ============================================================================
const SVG_SIZE = 480;
const CX = 240;
const CY = 240;
const PREFERRED_RING_R = 155; // px — target visual ring radius
const MIN_BEAD_PX = 16;       // minimum rendered bead diameter in px
const MAX_BEAD_PX = 68;       // maximum rendered bead diameter in px
const DEFAULT_DIAM_MM = 8;    // assumed when diameterMm is missing
const CHARM_DROP_PX = 10;     // gap between bead edge and charm centre

// ============================================================================
// COLOR FALLBACK HELPERS
// ============================================================================
const GEMSTONE_COLORS: Array<[string, string]> = [
  ["rose quartz", "#F4B0C0"], ["amethyst", "#9B71C0"], ["turquoise", "#3DADA0"],
  ["lapis", "#2D4A88"], ["jade", "#4EA870"], ["onyx", "#282820"], ["black", "#2E2828"],
  ["garnet", "#8C2040"], ["carnelian", "#C85030"], ["coral", "#D87060"],
  ["red", "#D05050"], ["orange", "#E08040"], ["amber", "#C88030"],
  ["citrine", "#E0B040"], ["yellow", "#D4A840"], ["gold", "#C09840"],
  ["green", "#508050"], ["teal", "#408080"], ["blue", "#5070B0"],
  ["purple", "#8060A8"], ["lavender", "#B090D0"], ["pink", "#F090A8"],
  ["white", "#F0ECE8"], ["ivory", "#EEE8D8"], ["cream", "#E8DEC8"],
  ["grey", "#A09898"], ["gray", "#A09898"], ["silver", "#B8B8C0"],
  ["brown", "#7A5848"], ["pearl", "#EDE8DC"], ["crystal", "#D8E4EF"],
  ["tiger", "#C07030"], ["malachite", "#388050"], ["sodalite", "#304878"],
  ["moonstone", "#CDD8E8"], ["aquamarine", "#60B8C0"], ["peridot", "#8AB840"],
  ["ruby", "#C02040"], ["emerald", "#288050"], ["sapphire", "#1840A0"],
  ["opal", "#E8D8C0"], ["clear", "#E0ECF4"],
];

function colorFromStrings(color?: string, finish?: string): string {
  const text = ((color ?? "") + " " + (finish ?? "")).toLowerCase().trim();
  if (!text) return "#B99A72";
  for (const [key, hex] of GEMSTONE_COLORS) {
    if (text.includes(key)) return hex;
  }
  return "#B99A72"; // champagne gold default
}

function lightenHex(hex: string, amount = 0.38): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const toHex = (n: number) =>
    Math.round(n + (255 - n) * amount).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ============================================================================
// RING GEOMETRY
// Beads arranged by actual diameterMm so physical sizes determine arc spacing.
// ============================================================================
interface BeadPosition {
  cx: number;
  cy: number;
  rpx: number;      // rendered bead radius in px
  angle: number;    // centre angle in radians (for charm drop direction)
  instanceId: string;
}

function computeRingLayout(beads: BeadPlacement[]): {
  positions: BeadPosition[];
  ringRadiusPx: number;
  scale: number;
} {
  if (beads.length === 0) {
    return { positions: [], ringRadiusPx: PREFERRED_RING_R, scale: 4 };
  }

  const diams = beads.map((b) => (b.diameterMm > 0 ? b.diameterMm : DEFAULT_DIAM_MM));
  const totalPathMm = diams.reduce((s, d) => s + d, 0);
  const minDiam = Math.min(...diams);
  const maxDiam = Math.max(...diams);

  // Derive scale so the ring radius equals PREFERRED_RING_R
  // R_px = (totalPathMm / 2π) * scale = PREFERRED_RING_R
  // => scale = PREFERRED_RING_R * 2π / totalPathMm
  const preferredScale = (PREFERRED_RING_R * 2 * Math.PI) / totalPathMm;

  // Clamp: beads must be at least MIN_BEAD_PX and at most MAX_BEAD_PX diameter
  const minBeadScale = MIN_BEAD_PX / minDiam;
  const maxBeadScale = MAX_BEAD_PX / maxDiam;

  // Ring must fit inside SVG with a margin
  const maxFitScale = (SVG_SIZE * 0.43 * 2 * Math.PI) / totalPathMm;

  const scale = Math.min(
    Math.max(preferredScale, minBeadScale),
    maxBeadScale,
    maxFitScale
  );

  const R_mm = totalPathMm / (2 * Math.PI);
  const ringRadiusPx = R_mm * scale;

  let cumAngle = -Math.PI / 2; // start at 12 o'clock
  const positions: BeadPosition[] = diams.map((d, i) => {
    const arcAngle = d / R_mm;
    const centerAngle = cumAngle + arcAngle / 2;
    cumAngle += arcAngle;
    return {
      cx: CX + ringRadiusPx * Math.cos(centerAngle),
      cy: CY + ringRadiusPx * Math.sin(centerAngle),
      rpx: (d / 2) * scale,
      angle: centerAngle,
      instanceId: beads[i].instanceId,
    };
  });

  return { positions, ringRadiusPx, scale };
}

// ============================================================================
// BEAD RENDERING HELPERS
// ============================================================================

/** Polished SVG fallback for beads without a renderAssetUrl */
function BeadFallback({
  cx, cy, rpx, color, finish, instanceId, isSelected,
}: {
  cx: number; cy: number; rpx: number;
  color?: string; finish?: string;
  instanceId: string; isSelected: boolean;
}) {
  const baseColor = colorFromStrings(color, finish);
  const lightColor = lightenHex(baseColor, 0.38);
  const gradId = `grad-${instanceId}`;
  const shadowId = `shad-${instanceId}`;

  return (
    <g>
      <defs>
        <radialGradient id={gradId} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor={lightColor} />
          <stop offset="100%" stopColor={baseColor} />
        </radialGradient>
        <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodOpacity="0.22" />
        </filter>
      </defs>
      {/* Main bead */}
      <circle
        cx={cx}
        cy={cy}
        r={rpx}
        fill={`url(#${gradId})`}
        filter={`url(#${shadowId})`}
        stroke={isSelected ? "#B66F72" : "rgba(255,255,255,0.45)"}
        strokeWidth={isSelected ? 2.5 : 1}
      />
      {/* Specular highlight */}
      <ellipse
        cx={cx - rpx * 0.27}
        cy={cy - rpx * 0.3}
        rx={rpx * 0.32}
        ry={rpx * 0.2}
        fill="rgba(255,255,255,0.42)"
        style={{ pointerEvents: "none" }}
      />
    </g>
  );
}

/** Realistic image bead using renderAssetUrl with circular clip */
function BeadImage({
  cx, cy, rpx, src, instanceId, isSelected,
}: {
  cx: number; cy: number; rpx: number;
  src: string; instanceId: string; isSelected: boolean;
}) {
  const clipId = `clip-${instanceId}`;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={rpx} />
        </clipPath>
      </defs>
      <image
        href={src}
        x={cx - rpx}
        y={cy - rpx}
        width={rpx * 2}
        height={rpx * 2}
        clipPath={`url(#${clipId})`}
        preserveAspectRatio="xMidYMid slice"
      />
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={rpx + 2.5}
          fill="none"
          stroke="#B66F72"
          strokeWidth="2.5"
        />
      )}
    </g>
  );
}

// ============================================================================
// CHARM RENDERING
// ============================================================================

function CharmElement({
  charm, anchorPos, scale, isSelected,
}: {
  charm: CharmAttachment;
  anchorPos: BeadPosition;
  scale: number;
  isSelected: boolean;
}) {
  const charmRpx = Math.max(MIN_BEAD_PX / 2, Math.min(20, 7 * scale));
  const dropDir = { x: Math.cos(anchorPos.angle), y: Math.sin(anchorPos.angle) };
  const lineSx = anchorPos.cx + anchorPos.rpx * dropDir.x;
  const lineSy = anchorPos.cy + anchorPos.rpx * dropDir.y;
  const charmCx = anchorPos.cx + (anchorPos.rpx + CHARM_DROP_PX + charmRpx) * dropDir.x;
  const charmCy = anchorPos.cy + (anchorPos.rpx + CHARM_DROP_PX + charmRpx) * dropDir.y;
  const clipId = `charm-clip-${charm.instanceId}`;

  return (
    <g>
      {/* Jump ring line */}
      <line
        x1={lineSx} y1={lineSy}
        x2={charmCx - charmRpx * 0.5 * dropDir.x}
        y2={charmCy - charmRpx * 0.5 * dropDir.y}
        stroke="#C0A888"
        strokeWidth="1.5"
        strokeDasharray="2 1"
      />
      {charm.renderAssetUrl ? (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={charmCx} cy={charmCy} r={charmRpx} />
            </clipPath>
          </defs>
          <image
            href={getAssetUrl(charm.renderAssetUrl)}
            x={charmCx - charmRpx}
            y={charmCy - charmRpx}
            width={charmRpx * 2}
            height={charmRpx * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid meet"
          />
        </>
      ) : (
        <>
          <defs>
            <radialGradient id={`cg-${charm.instanceId}`} cx="38%" cy="32%" r="65%">
              <stop offset="0%" stopColor="#D4BF90" />
              <stop offset="100%" stopColor="#B99A72" />
            </radialGradient>
          </defs>
          <circle
            cx={charmCx}
            cy={charmCy}
            r={charmRpx}
            fill={`url(#cg-${charm.instanceId})`}
            stroke={isSelected ? "#B66F72" : "rgba(255,255,255,0.5)"}
            strokeWidth={isSelected ? 2 : 1}
          />
          {/* Star/sparkle icon for charm */}
          <text
            x={charmCx}
            y={charmCy + charmRpx * 0.35}
            textAnchor="middle"
            fontSize={charmRpx * 1.1}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            ✦
          </text>
        </>
      )}
      {isSelected && (
        <circle
          cx={charmCx}
          cy={charmCy}
          r={charmRpx + 3}
          fill="none"
          stroke="#B66F72"
          strokeWidth="2"
        />
      )}
    </g>
  );
}

// ============================================================================
// EMPTY STATE CANVAS
// ============================================================================

function EmptyCanvas() {
  return (
    <g>
      <circle cx={CX} cy={CY} r={PREFERRED_RING_R} fill="none" stroke="#E6D8D0" strokeWidth="1.5" strokeDasharray="6 4" />
      <circle cx={CX} cy={CY} r={PREFERRED_RING_R * 0.55} fill="rgba(230,216,208,0.10)" />
      <text x={CX} y={CY - 16} textAnchor="middle" fontSize="13" fill="#B0A0A0" fontFamily="inherit">
        Your bracelet will
      </text>
      <text x={CX} y={CY + 4} textAnchor="middle" fontSize="13" fill="#B0A0A0" fontFamily="inherit">
        appear here
      </text>
      <text x={CX} y={CY + 22} textAnchor="middle" fontSize="11" fill="#C8B8B8" fontFamily="inherit">
        Add beads from the material panel
      </text>
    </g>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface BraceletCanvasProps {
  design: BraceletDesign;
  materials: PublicMaterial[];
  onSelectInstance: (instanceId: string | null) => void;
}

export default function BraceletCanvas({
  design,
  materials: _materials,
  onSelectInstance,
}: BraceletCanvasProps) {
  const { beadSequence, charms, selectedInstanceId } = design;

  const { positions, ringRadiusPx, scale } = useMemo(
    () => computeRingLayout(beadSequence),
    [beadSequence]
  );

  const handleClick = (e: React.MouseEvent<SVGElement>) => {
    // Clicking the SVG background deselects
    if ((e.target as SVGElement).tagName === "svg" || (e.target as SVGElement).tagName === "rect") {
      onSelectInstance(null);
    }
  };

  return (
    <div className="flex items-center justify-center w-full">
      <svg
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        width="100%"
        style={{ maxWidth: SVG_SIZE, maxHeight: SVG_SIZE }}
        className="rounded-2xl"
        onClick={handleClick}
        aria-label="Bracelet canvas"
      >
        {/* Canvas background */}
        <rect x="0" y="0" width={SVG_SIZE} height={SVG_SIZE} fill="#FAF6F0" rx="16" />

        {/* Subtle grid / texture */}
        <pattern id="cnv-dot" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.8" fill="#E2D6CC" />
        </pattern>
        <rect x="0" y="0" width={SVG_SIZE} height={SVG_SIZE} fill="url(#cnv-dot)" rx="16" />

        {beadSequence.length === 0 ? (
          <EmptyCanvas />
        ) : (
          <>
            {/* Elastic cord circle — drawn behind all beads */}
            <circle
              cx={CX}
              cy={CY}
              r={ringRadiusPx}
              fill="none"
              stroke="#D4BAA8"
              strokeWidth="2.5"
              opacity="0.7"
            />

            {/* Beads — drawn in sequence order */}
            {positions.map((pos, i) => {
              const bead = beadSequence[i];
              const isSel = bead.instanceId === selectedInstanceId;
              const resolvedSrc = bead.renderAssetUrl
                ? getAssetUrl(bead.renderAssetUrl)
                : null;

              return (
                <g
                  key={bead.instanceId}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectInstance(isSel ? null : bead.instanceId);
                  }}
                  role="button"
                  aria-label={`${bead.displayName}${isSel ? " (selected)" : ""}`}
                >
                  {resolvedSrc ? (
                    <BeadImage
                      cx={pos.cx}
                      cy={pos.cy}
                      rpx={pos.rpx}
                      src={resolvedSrc}
                      instanceId={bead.instanceId}
                      isSelected={isSel}
                    />
                  ) : (
                    <BeadFallback
                      cx={pos.cx}
                      cy={pos.cy}
                      rpx={pos.rpx}
                      color={bead.color}
                      finish={bead.finish}
                      instanceId={bead.instanceId}
                      isSelected={isSel}
                    />
                  )}
                </g>
              );
            })}

            {/* Charms — rendered above beads */}
            {charms.map((charm) => {
              const anchorPos = positions.find(
                (p) => p.instanceId === charm.anchorInstanceId
              );
              if (!anchorPos) return null;
              const isSel = charm.instanceId === selectedInstanceId;
              return (
                <g
                  key={charm.instanceId}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectInstance(isSel ? null : charm.instanceId);
                  }}
                >
                  <CharmElement
                    charm={charm}
                    anchorPos={anchorPos}
                    scale={scale}
                    isSelected={isSel}
                  />
                </g>
              );
            })}
          </>
        )}

        {/* Sequence order label (small index numbers) — shown only when beads exist */}
        {beadSequence.length > 0 &&
          positions.map((pos, i) => {
            if (pos.rpx < 10) return null; // too small to label
            return (
              <text
                key={`lbl-${positions[i].instanceId}`}
                x={pos.cx}
                y={pos.cy + pos.rpx + 12}
                textAnchor="middle"
                fontSize="9"
                fill="#C0AFA8"
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {i + 1}
              </text>
            );
          })}
      </svg>
    </div>
  );
}

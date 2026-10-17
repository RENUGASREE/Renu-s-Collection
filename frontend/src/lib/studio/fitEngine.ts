// ============================================================================
// FIT ENGINE — pure, framework-free
// Calculates estimated bracelet path length from real component dimensions,
// compares against admin-configured wrist target/allowance.
// All results are explicitly approximate — no physical guarantee is made.
// ============================================================================

import type { BeadPlacement } from "./designState";
import type { DesignRule } from "./studioApi";

export type FitStatus =
  | "no_beads"
  | "rule_unavailable"
  | "too_few_components"
  | "too_many_components"
  | "nonstandard_sizes"
  | "within_limits"
  | "needs_adjustment"
  | "manual_review";

export interface FitResult {
  status: FitStatus;
  label: string;
  description: string;
  /** Estimated bead path length in mm, or null if cannot be calculated */
  estimatedPathMm: number | null;
  /** Admin-configured target circumference (wristMm + fitAllowanceMm) */
  targetPathMm: number | null;
  /** estimatedPathMm - targetPathMm, or null */
  deviationMm: number | null;
  /** Always true — this is a geometric estimate, not a physical measurement */
  isApproximate: true;
  /** How many beads used a dimension fallback */
  fallbackCount: number;
}

const DEFAULT_DIAM_MM = 8; // assumed when diameterMm is missing or zero

/**
 * Estimates whether the bead sequence fits the given wrist size.
 *
 * Physics basis:
 *   When elastic beads sit side-by-side on a circular path, the total path
 *   length ≈ Σ(diameterMm). This is the outer tangential approximation valid
 *   when bead diameter is small relative to ring radius (true for typical
 *   4–14 mm beads on a 160–220 mm wrist). The result is labelled as an
 *   estimate only; physical confirmation happens at artisan assembly.
 */
export function estimateFit(
  beadSequence: BeadPlacement[],
  wristMm: number,
  rule: DesignRule | null
): FitResult {
  const isApproximate = true as const;

  if (beadSequence.length === 0) {
    return {
      status: "no_beads",
      label: "No beads placed",
      description: "Add beads to your bracelet to see a fit estimate.",
      estimatedPathMm: null,
      targetPathMm: null,
      deviationMm: null,
      isApproximate,
      fallbackCount: 0,
    };
  }

  if (!rule) {
    return {
      status: "rule_unavailable",
      label: "Fit not calibrated",
      description:
        "Design calibration rules could not be loaded. Manual artisan review will be required before production.",
      estimatedPathMm: null,
      targetPathMm: null,
      deviationMm: null,
      isApproximate,
      fallbackCount: 0,
    };
  }

  // Resolve diameters; track how many used the fallback
  let fallbackCount = 0;
  const diams = beadSequence.map((b) => {
    const d = b.diameterMm > 0 ? b.diameterMm : DEFAULT_DIAM_MM;
    if (!(b.diameterMm > 0)) fallbackCount++;
    return d;
  });

  const estimatedPathMm = diams.reduce((s, d) => s + d, 0);
  const targetPathMm = wristMm + rule.fitAllowanceMm;

  // Component count checks (rule limits, independent of dimensions)
  if (beadSequence.length < rule.minComponents) {
    return {
      status: "too_few_components",
      label: `Too few components (min: ${rule.minComponents})`,
      description: `Currently ${beadSequence.length} bead${beadSequence.length !== 1 ? "s" : ""}. Add at least ${rule.minComponents - beadSequence.length} more to meet the minimum design rule.`,
      estimatedPathMm,
      targetPathMm,
      deviationMm: estimatedPathMm - targetPathMm,
      isApproximate,
      fallbackCount,
    };
  }

  if (beadSequence.length > rule.maxComponents) {
    return {
      status: "too_many_components",
      label: `Too many components (max: ${rule.maxComponents})`,
      description: `Currently ${beadSequence.length} beads. Remove at least ${beadSequence.length - rule.maxComponents} to stay within the configured limit.`,
      estimatedPathMm,
      targetPathMm,
      deviationMm: estimatedPathMm - targetPathMm,
      isApproximate,
      fallbackCount,
    };
  }

  // Non-standard bead size check
  if (rule.permittedBeadSizesMm && rule.permittedBeadSizesMm.length > 0) {
    const hasNonStandard = diams.some(
      (d) => !rule.permittedBeadSizesMm.includes(d)
    );
    if (hasNonStandard) {
      const nonStandardSizes = [
        ...new Set(
          diams.filter((d) => !rule.permittedBeadSizesMm.includes(d))
        ),
      ].join(", ");
      return {
        status: "nonstandard_sizes",
        label: "Non-standard sizes — manual review required",
        description: `Bead size(s) ${nonStandardSizes} mm fall outside calibrated standard sizes (${rule.permittedBeadSizesMm.join(", ")} mm). Artisan review required for these dimensions.`,
        estimatedPathMm,
        targetPathMm,
        deviationMm: estimatedPathMm - targetPathMm,
        isApproximate,
        fallbackCount,
      };
    }
  }

  // Core fit comparison
  const deviationMm = estimatedPathMm - targetPathMm;
  const absDeviation = Math.abs(deviationMm);

  const fallbackNote =
    fallbackCount > 0
      ? ` (${fallbackCount} bead${fallbackCount !== 1 ? "s" : ""} used assumed ${DEFAULT_DIAM_MM} mm size)`
      : "";

  const directionHint =
    deviationMm > 0
      ? "Consider removing a bead or switching to smaller sizes."
      : "Consider adding a bead or switching to larger sizes.";

  if (absDeviation <= 5) {
    return {
      status: "within_limits",
      label: "Within configured limits (approximate)",
      description: `Estimated path ≈ ${estimatedPathMm.toFixed(0)} mm vs target ${targetPathMm.toFixed(0)} mm (wrist ${wristMm} mm + ${rule.fitAllowanceMm} mm elastic allowance)${fallbackNote}. Physical confirmation happens at artisan assembly.`,
      estimatedPathMm,
      targetPathMm,
      deviationMm,
      isApproximate,
      fallbackCount,
    };
  }

  if (absDeviation <= 15) {
    return {
      status: "needs_adjustment",
      label: "Needs adjustment",
      description: `Estimated path ≈ ${estimatedPathMm.toFixed(0)} mm. Target: ${targetPathMm.toFixed(0)} mm. Deviation: ${deviationMm > 0 ? "+" : ""}${deviationMm.toFixed(0)} mm${fallbackNote}. ${directionHint}`,
      estimatedPathMm,
      targetPathMm,
      deviationMm,
      isApproximate,
      fallbackCount,
    };
  }

  return {
    status: "manual_review",
    label: "Manual review required",
    description: `Estimated path ≈ ${estimatedPathMm.toFixed(0)} mm. Target: ${targetPathMm.toFixed(0)} mm. Significant deviation of ${deviationMm > 0 ? "+" : ""}${deviationMm.toFixed(0)} mm${fallbackNote}. Artisan calibration required.`,
    estimatedPathMm,
    targetPathMm,
    deviationMm,
    isApproximate,
    fallbackCount,
  };
}

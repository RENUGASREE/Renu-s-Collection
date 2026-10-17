import { useMemo } from "react";
import { estimateFit, type FitResult } from "@/lib/studio/fitEngine";
import type { BraceletDesign } from "@/lib/studio/designState";
import type { DesignRule } from "@/lib/studio/studioApi";
import { Ruler, AlertCircle, CheckCircle2, AlertTriangle, HelpCircle } from "lucide-react";

// ============================================================================
// STATUS DISPLAY CONFIG
// ============================================================================

interface StatusConfig {
  icon: React.ReactNode;
  barCls: string;
  textCls: string;
}

function statusConfig(result: FitResult): StatusConfig {
  switch (result.status) {
    case "within_limits":
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />,
        barCls: "bg-emerald-500",
        textCls: "text-emerald-700 dark:text-emerald-400",
      };
    case "needs_adjustment":
      return {
        icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
        barCls: "bg-amber-400",
        textCls: "text-amber-700 dark:text-amber-400",
      };
    case "too_few_components":
    case "too_many_components":
      return {
        icon: <AlertCircle className="w-4 h-4 text-blue-500 shrink-0" />,
        barCls: "bg-blue-400",
        textCls: "text-blue-700 dark:text-blue-400",
      };
    case "nonstandard_sizes":
    case "manual_review":
      return {
        icon: <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />,
        barCls: "bg-rose-400",
        textCls: "text-rose-700 dark:text-rose-400",
      };
    default:
      return {
        icon: <HelpCircle className="w-4 h-4 text-[#B0A0A0] shrink-0" />,
        barCls: "bg-[#E6D8D0]",
        textCls: "text-[#756861] dark:text-muted-foreground",
      };
  }
}

/** Visual bar showing estimated vs target path length (capped at 100%) */
function FitBar({
  estimated,
  target,
  barCls,
}: {
  estimated: number;
  target: number;
  barCls: string;
}) {
  const pct = Math.min(100, Math.round((estimated / target) * 100));
  const overflowing = estimated > target;

  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-[#B0A0A0] mb-1">
        <span>Estimated path: {estimated.toFixed(0)} mm</span>
        <span>Target: {target.toFixed(0)} mm</span>
      </div>
      <div className="w-full h-2 bg-[#EEE4DC] dark:bg-muted rounded-full overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barCls}`}
          style={{ width: `${pct}%` }}
        />
        {overflowing && (
          <div className="absolute inset-y-0 right-0 w-1 bg-rose-400 rounded-r-full" />
        )}
      </div>
      <div className="text-[10px] text-[#B0A0A0] mt-1 text-right">{pct}% of target</div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface FitIndicatorProps {
  design: BraceletDesign;
  designRule: DesignRule | null;
  onWristChange: (mm: number) => void;
}

export default function FitIndicator({
  design,
  designRule,
  onWristChange,
}: FitIndicatorProps) {
  const result = useMemo(
    () => estimateFit(design.beadSequence, design.wristMm, designRule),
    [design.beadSequence, design.wristMm, designRule]
  );

  const { icon, barCls, textCls } = statusConfig(result);
  const minWrist = designRule?.minWristMm ?? 130;
  const maxWrist = designRule?.maxWristMm ?? 220;

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] dark:border-border p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Ruler className="w-4 h-4 text-[#B99A72] shrink-0" />
        <h3 className="font-semibold text-sm text-[#342824] dark:text-foreground">
          Guided Fitting
        </h3>
        <span className="ml-auto text-[10px] italic text-[#B0A0A0]">approximate</span>
      </div>

      {/* Wrist size slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <label className="font-medium text-[#342824] dark:text-foreground">
            Wrist size
          </label>
          <span className="font-semibold text-[#B66F72] dark:text-primary">
            {design.wristMm} mm ({(design.wristMm / 10).toFixed(1)} cm)
          </span>
        </div>
        <input
          type="range"
          min={minWrist}
          max={maxWrist}
          step={5}
          value={design.wristMm}
          onChange={(e) => onWristChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#B66F72]"
          aria-label="Wrist size in millimetres"
        />
        <div className="flex justify-between text-[10px] text-[#B0A0A0]">
          <span>{minWrist} mm</span>
          <span>{maxWrist} mm</span>
        </div>
      </div>

      {/* Fit status */}
      <div>
        <div className={`flex items-start gap-2 text-xs font-medium ${textCls}`}>
          {icon}
          <span>{result.label}</span>
        </div>
        <p className="text-[11px] text-[#756861] dark:text-muted-foreground mt-1.5 leading-relaxed">
          {result.description}
        </p>

        {result.estimatedPathMm !== null && result.targetPathMm !== null && (
          <FitBar
            estimated={result.estimatedPathMm}
            target={result.targetPathMm}
            barCls={barCls}
          />
        )}
      </div>

      {/* Component count summary */}
      {design.beadSequence.length > 0 && (
        <div className="flex items-center gap-3 text-[11px] text-[#756861] border-t border-[#E6D8D0]/60 dark:border-border/60 pt-3">
          <span>
            <strong className="text-[#342824] dark:text-foreground">
              {design.beadSequence.length}
            </strong>{" "}
            bead{design.beadSequence.length !== 1 ? "s" : ""}
          </span>
          <span>·</span>
          <span>
            <strong className="text-[#342824] dark:text-foreground">
              {design.charms.length}
            </strong>{" "}
            charm{design.charms.length !== 1 ? "s" : ""}
          </span>
          {designRule && (
            <>
              <span>·</span>
              <span>
                Rule:{" "}
                <strong>
                  {designRule.minComponents}–{designRule.maxComponents}
                </strong>{" "}
                beads
              </span>
            </>
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[10px] text-[#B0A0A0] italic leading-relaxed border-t border-[#E6D8D0]/50 pt-2">
        Fit estimates are geometric approximations based on bead dimensions.
        Physical calibration is performed at artisan assembly.
        No fit status constitutes a guarantee of physical accuracy.
      </p>
    </div>
  );
}

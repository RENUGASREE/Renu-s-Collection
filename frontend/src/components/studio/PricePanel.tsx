import { useState, useEffect, useRef, useMemo } from "react";
import { fetchPriceQuote, type DesignPriceQuote, type ComponentInput } from "@/lib/studio/studioApi";
import type { BraceletDesign } from "@/lib/studio/designState";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const DEBOUNCE_MS = 800;

// ============================================================================
// HELPERS
// ============================================================================

/** Aggregate bead + charm SKUs into ComponentInput[] for the price-quote API */
function buildComponents(design: BraceletDesign): ComponentInput[] {
  const map = new Map<string, number>();
  for (const b of design.beadSequence) {
    map.set(b.variantSku, (map.get(b.variantSku) ?? 0) + 1);
  }
  for (const c of design.charms) {
    map.set(c.variantSku, (map.get(c.variantSku) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([variantSku, quantity]) => ({
    variantSku,
    quantity,
  }));
}

/** Build a clipboard-friendly text summary */
function buildTextSummary(design: BraceletDesign, quote: DesignPriceQuote): string {
  const lines: string[] = [
    "=== Renu's Collections — Bracelet Design Summary ===",
    `Wrist size: ${design.wristMm} mm`,
    `Saved: ${new Date().toLocaleString()}`,
    "",
    "Components:",
    ...quote.items.map(
      (it) =>
        `  ${it.materialName} (${it.variantSku}) × ${it.quantity} = ₹${it.subtotal.toFixed(2)}`
    ),
    "",
    `Component subtotal: ₹${quote.componentSubtotal.toFixed(2)}`,
    `Making charge: ₹${quote.makingCharge.totalMakingFee.toFixed(2)}`,
    `Estimated total: ₹${quote.totalPrice.toFixed(2)} (INR)`,
    "",
    `NOTE: ${quote.disclaimer}`,
    "",
    "Draft saved in this browser only. Not an account design or confirmed order.",
  ];
  return lines.join("\n");
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PricePanelProps {
  design: BraceletDesign;
  onQuoteChange?: (quote: DesignPriceQuote | null) => void;
}

export default function PricePanel({ design, onQuoteChange }: PricePanelProps) {
  const [quote, setQuote] = useState<DesignPriceQuote | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  // Stale-response guard: only accept results from the most recent request
  const quoteSeqRef = useRef(0);

  const components = useMemo(() => buildComponents(design), [design.beadSequence, design.charms]);

  // Debounced price-quote fetch with stale-response cancellation
  useEffect(() => {
    if (components.length === 0) {
      setQuote(null);
      setQuoteError(null);
      setLoadingQuote(false);
      onQuoteChange?.(null);
      return;
    }

    const seq = ++quoteSeqRef.current;

    const timer = setTimeout(async () => {
      setLoadingQuote(true);
      try {
        const result = await fetchPriceQuote(components);
        // Discard if a newer request has already started
        if (quoteSeqRef.current !== seq) return;
        setQuote(result);
        setQuoteError(null);
        onQuoteChange?.(result);
      } catch (err: any) {
        if (quoteSeqRef.current !== seq) return;
        setQuoteError(err?.message ?? "Price quote unavailable");
        setQuote(null);
        onQuoteChange?.(null);
      } finally {
        if (quoteSeqRef.current === seq) setLoadingQuote(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [components]);

  const handleCopy = async () => {
    if (!quote) return;
    const text = buildTextSummary(design, quote);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API unavailable (e.g. non-HTTPS dev environment)
    }
  };

  const isEmpty = design.beadSequence.length === 0 && design.charms.length === 0;

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] dark:border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[#E6D8D0]/60 dark:border-border/60">
        <DollarSign className="w-4 h-4 text-[#B99A72] shrink-0" />
        <h3 className="font-semibold text-sm text-[#342824] dark:text-foreground flex-1">
          Price Estimate
        </h3>
        {loadingQuote && (
          <Loader2 className="w-3.5 h-3.5 text-[#B0A0A0] animate-spin" />
        )}
        {/* Provisional badge */}
        <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
          Provisional
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Empty state */}
        {isEmpty && (
          <p className="text-[11px] text-[#B0A0A0] italic py-2">
            Add beads to see a price estimate.
          </p>
        )}

        {/* Error state */}
        {quoteError && (
          <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 rounded-xl p-3 border border-rose-200 dark:border-rose-900/40">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{quoteError}</span>
          </div>
        )}

        {/* Quote loaded */}
        {quote && (
          <>
            {/* Line items */}
            <div className="space-y-1.5">
              {quote.items.map((item) => (
                <div
                  key={item.variantSku}
                  className="flex items-start justify-between gap-2 text-xs"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[#342824] dark:text-foreground font-medium">
                      {item.materialName}
                    </span>
                    <span className="text-[#B0A0A0] ml-1.5">
                      {item.sizeLabel}
                      {item.color ? ` · ${item.color}` : ""}
                    </span>
                    <div className="text-[10px] text-[#B0A0A0] font-mono">
                      {item.variantSku}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[#342824] dark:text-foreground">
                      {item.quantity} × ₹{item.unitRate.toFixed(2)}
                    </div>
                    <div className="font-semibold text-[#B66F72] dark:text-primary">
                      ₹{item.subtotal.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Subtotals */}
            <div className="pt-3 border-t border-[#E6D8D0]/60 dark:border-border/60 space-y-1.5 text-xs">
              <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                <span>Components subtotal</span>
                <span>₹{quote.componentSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                <span>
                  Making charge
                  <span className="text-[10px] ml-1 text-[#B0A0A0]">(base)</span>
                </span>
                <span>₹{quote.makingCharge.baseFee.toFixed(2)}</span>
              </div>
              {quote.makingCharge.selectedServiceCharges.map((sc) => (
                <div
                  key={sc.name}
                  className="flex justify-between text-[#756861] dark:text-muted-foreground"
                >
                  <span>{sc.name}</span>
                  <span>₹{sc.fee.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between font-semibold text-[#342824] dark:text-foreground text-sm pt-1 border-t border-[#E6D8D0]/60 dark:border-border/60">
                <span>Estimated total</span>
                <span className="text-[#B66F72] dark:text-primary">
                  ₹{quote.totalPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Not-purchasable notice */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-[#FBF7F3] dark:bg-muted/20 border border-[#E6D8D0] dark:border-border text-[11px] text-[#756861] dark:text-muted-foreground">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#B99A72]" />
              <span>
                This is a provisional cost estimate. It does not constitute a
                confirmed order or an approved design.
              </span>
            </div>

            {/* Disclaimer (collapsible) */}
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-[10px] text-[#B0A0A0] hover:text-[#756861] transition-colors"
                onClick={() => setShowDisclaimer((v) => !v)}
              >
                {showDisclaimer ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                Full disclaimer
              </button>
              {showDisclaimer && (
                <p className="text-[10px] text-[#B0A0A0] italic leading-relaxed mt-1.5 bg-[#FBF7F3]/60 dark:bg-muted/10 rounded-lg p-2">
                  {quote.disclaimer}
                </p>
              )}
            </div>

            {/* Copy button */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleCopy}
              disabled={!quote}
              className="w-full rounded-xl text-xs border-[#E6D8D0] dark:border-border gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Design summary copied!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy design summary
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

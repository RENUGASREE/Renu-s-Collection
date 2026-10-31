import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Gem,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import {
  fetchAIDesignSuggestions,
  type AIDesignSuggestion,
  type AIDesignPromptInput,
} from "@/lib/studio/studioApi";
import { getBeadAppearance } from "@/lib/studio/appearance";

interface AIDesignAssistantModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWristMm: number;
  onApplySuggestion: (suggestion: AIDesignSuggestion) => void;
}

const QUICK_PROMPTS = [
  {
    label: "🌸 Romantic Pastel Charm",
    prompt: "Delicate blush pink tones and freshwater pearls for an anniversary dinner",
    occasion: "wedding",
    colorTheme: "rose_gold",
  },
  {
    label: "🌿 Earthy Mineral & Onyx",
    prompt: "Warm golden earth gemstone tones and matte dark beads for focus and daily wear",
    occasion: "daily_wear",
    colorTheme: "earthy",
  },
  {
    label: "🌊 Ocean Breeze & Silver",
    prompt: "Vibrant ocean turquoise hues paired with bright sterling silver spacers and accent charm",
    occasion: "party",
    colorTheme: "ocean_blue",
  },
  {
    label: "✨ Royal Gemstone & Lotus",
    prompt: "Deep royal purple gemstone beads with clear quartz and a sacred lotus charm",
    occasion: "spiritual",
    colorTheme: "purple",
  },
  {
    label: "🖤 Minimalist Luxe Noir",
    prompt: "Sleek all-black matte stone and textured accents with subtle silver details",
    occasion: "office",
    colorTheme: "black_silver",
    budget: 1200,
  },
];

const OCCASIONS = [
  { value: "", label: "Any Occasion" },
  { value: "daily_wear", label: "Everyday & Casual" },
  { value: "office", label: "Work & Professional" },
  { value: "party", label: "Evening & Party" },
  { value: "wedding", label: "Festive & Wedding" },
  { value: "spiritual", label: "Spiritual & Meditation" },
  { value: "gifting", label: "Special Gift" },
];

const COLOR_THEMES = [
  { value: "", label: "Any Palette" },
  { value: "rose_gold", label: "Rose Gold & Blush Pink" },
  { value: "black_silver", label: "Classic Black & Silver" },
  { value: "ocean_blue", label: "Ocean Cyan & Turquoise" },
  { value: "earthy", label: "Earthy Browns & Gold" },
  { value: "pearl_white", label: "Luminous Pearl White" },
  { value: "purple", label: "Royal Purple Amethyst" },
];

export function AIDesignAssistantModal({
  open,
  onOpenChange,
  currentWristMm,
  onApplySuggestion,
}: AIDesignAssistantModalProps) {
  const [prompt, setPrompt] = useState("");
  const [occasion, setOccasion] = useState("");
  const [colorTheme, setColorTheme] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AIDesignSuggestion[]>([]);
  const [expandedBreakdownId, setExpandedBreakdownId] = useState<string | null>(null);

  const handleQuickPrompt = (item: (typeof QUICK_PROMPTS)[0]) => {
    setPrompt(item.prompt);
    if (item.occasion) setOccasion(item.occasion);
    if (item.colorTheme) setColorTheme(item.colorTheme);
    if (item.budget) setBudget(item.budget.toString());
  };

  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const payload: AIDesignPromptInput = {
        prompt: prompt.trim(),
        occasion: occasion || undefined,
        colorTheme: colorTheme || undefined,
        budget: budget ? Number(budget) : undefined,
        wristMm: currentWristMm,
      };

      const result = await fetchAIDesignSuggestions(payload);
      setSuggestions(result);
      if (result.length === 0) {
        setError("Our artisan assistant could not find a match. Please try tweaking your prompt.");
      }
    } catch (err: any) {
      setError(err?.message || "Failed to generate design suggestions. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = (suggestion: AIDesignSuggestion) => {
    onApplySuggestion(suggestion);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#B66F72]/15 dark:bg-primary/15 flex items-center justify-center text-[#B66F72] dark:text-primary shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="font-playfair text-xl sm:text-2xl text-[#342824] dark:text-foreground">
                AI Jewelry Design Assistant
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-0.5">
                Describe your desired look, mood, or occasion. Our AI assistant will craft personalized arrangements grounded in our real studio gemstone catalogue.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* INPUT FORM SECTION */}
        <form onSubmit={handleGenerate} className="mt-4 space-y-3.5">
          <div>
            <Label htmlFor="ai-prompt" className="text-xs font-semibold text-[#342824] dark:text-foreground">
              Describe your dream jewelry in your own words
            </Label>
            <Textarea
              id="ai-prompt"
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A calming blue and silver bracelet for an evening celebration with a star charm under ₹1,500..."
              className="mt-1 text-sm bg-white dark:bg-background border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
            />
          </div>

          {/* Quick Prompt Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-medium text-[#756861] dark:text-muted-foreground mr-1">
              Try an idea:
            </span>
            {QUICK_PROMPTS.map((qp, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleQuickPrompt(qp)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white dark:bg-muted border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-foreground hover:border-[#B66F72] hover:text-[#B66F72] transition-colors"
              >
                {qp.label}
              </button>
            ))}
          </div>

          {/* Optional Filter Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#B66F72] dark:text-primary hover:underline"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showFilters ? "Hide styling preferences" : "Refine preferences (Occasion, Color, Budget)"}</span>
              {showFilters ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 mt-2 rounded-xl bg-white/70 dark:bg-background/50 border border-[#E6D8D0] dark:border-border">
                <div>
                  <Label className="text-[11px] font-semibold text-[#756861] dark:text-muted-foreground">
                    Occasion
                  </Label>
                  <select
                    value={occasion}
                    onChange={(e) => setOccasion(e.target.value)}
                    className="w-full mt-1 text-xs h-8 px-2 rounded-lg bg-white dark:bg-background border border-[#E6D8D0] dark:border-border text-[#342824] dark:text-foreground focus:outline-none focus:ring-1 focus:ring-[#B66F72]"
                  >
                    {OCCASIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-[#756861] dark:text-muted-foreground">
                    Color Theme
                  </Label>
                  <select
                    value={colorTheme}
                    onChange={(e) => setColorTheme(e.target.value)}
                    className="w-full mt-1 text-xs h-8 px-2 rounded-lg bg-white dark:bg-background border border-[#E6D8D0] dark:border-border text-[#342824] dark:text-foreground focus:outline-none focus:ring-1 focus:ring-[#B66F72]"
                  >
                    {COLOR_THEMES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-[#756861] dark:text-muted-foreground">
                    Max Budget (₹)
                  </Label>
                  <Input
                    type="number"
                    min="100"
                    step="50"
                    placeholder="e.g. 1500"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="h-8 mt-1 text-xs bg-white dark:bg-background border-[#E6D8D0] dark:border-border"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-[#756861] dark:text-muted-foreground">
              Calibrated for wrist: <strong className="text-[#342824] dark:text-foreground">{currentWristMm} mm</strong>
            </span>

            <Button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 py-2 h-9 rounded-xl shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Consulting Artisan AI…
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Generate Design Ideas
                </>
              )}
            </Button>
          </div>
        </form>

        {/* ERROR STATE */}
        {error && (
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 my-3">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Notice</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* LOADING SHIMMER */}
        {loading && (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center mx-auto text-[#B66F72] dark:text-primary animate-pulse">
              <Gem className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <p className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                Artisan AI is assembling your arrangements…
              </p>
              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 max-w-md mx-auto">
                Validating genuine gemstone beads, sizing for your {currentWristMm}mm wrist, and checking real-time boutique catalogue rates.
              </p>
            </div>
          </div>
        )}

        {/* RESULTS SECTION */}
        {!loading && suggestions.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#E6D8D0] dark:border-border pb-2">
              <h3 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Curated Suggestions ({suggestions.length})
              </h3>
              <span className="text-[11px] text-[#756861] dark:text-muted-foreground">
                Reviewed against active studio rules & rates
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {suggestions.map((sug) => {
                const uniqueMaterials = Array.from(
                  new Set(sug.beadSequence.map((b) => b.displayName))
                );
                const isBreakdownOpen = expandedBreakdownId === sug.id;

                return (
                  <div
                    key={sug.id}
                    className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-background border border-[#E6D8D0] dark:border-border shadow-sm hover:border-[#B66F72]/50 transition-all space-y-3.5"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-playfair text-base sm:text-lg font-semibold text-[#342824] dark:text-foreground">
                            {sug.name}
                          </h4>
                          <Badge variant="outline" className="text-[10px] font-normal border-[#E6D8D0] text-[#756861]">
                            {sug.style}
                          </Badge>
                          {sug.isAiGenerated === false ? (
                            <Badge className="text-[10px] font-normal bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100">
                              Artisan Curated
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] font-normal bg-[#B66F72]/10 text-[#B66F72] border-[#B66F72]/20 hover:bg-[#B66F72]/15">
                              AI Suggested
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs italic text-[#756861] dark:text-muted-foreground mt-0.5">
                          "{sug.tagline}"
                        </p>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        <span className="text-xs text-[#756861] dark:text-muted-foreground block">
                          Authoritative Price
                        </span>
                        <span className="text-lg font-bold text-[#B66F72] dark:text-primary">
                          ₹{sug.pricingQuote.totalPrice.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    {/* Why this fits you narrative */}
                    <div className="p-3 rounded-xl bg-[#FBF7F3] dark:bg-card border border-[#E6D8D0]/60 dark:border-border text-xs text-[#756861] dark:text-foreground/90 space-y-1">
                      <p className="font-semibold text-[#342824] dark:text-foreground flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#B66F72]" />
                        Why this fits your request:
                      </p>
                      <p className="leading-relaxed">{sug.matchReason}</p>
                    </div>

                    {/* Visual Bead Sequence Miniature */}
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-[#756861] dark:text-muted-foreground mb-1.5">
                        <span>
                          Arrangement: <strong>{sug.beadSequence.length} beads</strong> (Calibrated for {sug.wristMm}mm wrist)
                        </span>
                        {sug.charms.length > 0 && (
                          <span className="text-[#B66F72] font-medium">
                            + {sug.charms.length} {sug.charms.map((c) => c.displayName).join(", ")}
                          </span>
                        )}
                      </div>

                      {/* Mini Bead Dots Canvas Strip — tightly strung with no gaps */}
                      <div className="relative flex items-center p-2 rounded-xl bg-[#F8F4F0] dark:bg-muted/40 border border-[#E6D8D0]/40 overflow-x-auto py-3">
                        {/* Continuous elastic cord line behind beads */}
                        <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-[#D4BAA8]/70 pointer-events-none" />

                        <div className="flex items-center gap-0 -space-x-0.5 z-10 px-1">
                          {sug.beadSequence.map((b, bIdx) => {
                            const isCharmAnchor = sug.charms.some((c) => c.anchorIndex === bIdx);
                            const appearance = getBeadAppearance(b);
                            const diameterPx = Math.max(14, Math.min(24, Math.round((b.diameterMm || 8) * 1.8)));

                            return (
                              <div
                                key={bIdx}
                                className="relative flex flex-col items-center shrink-0"
                                title={`${b.displayName} (${b.diameterMm}mm)`}
                              >
                                <div
                                  className="rounded-full overflow-hidden shadow-sm flex items-center justify-center relative border border-black/15 shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
                                  style={{
                                    width: `${diameterPx}px`,
                                    height: `${diameterPx}px`,
                                    backgroundColor: appearance.color,
                                  }}
                                >
                                  {appearance.imageSrc ? (
                                    <img
                                      src={appearance.imageSrc}
                                      alt={b.displayName}
                                      className="w-full h-full object-cover rounded-full scale-125"
                                      loading="lazy"
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  ) : (
                                    <div
                                      className="w-full h-full rounded-full"
                                      style={{
                                        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.45), transparent 70%)`,
                                      }}
                                    />
                                  )}
                                </div>
                                {isCharmAnchor && (
                                  <div className="absolute -bottom-2 text-[8px] text-[#B66F72] font-bold">
                                    ★
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Materials Summary Pills */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {uniqueMaterials.map((matName, mIdx) => (
                        <span
                          key={mIdx}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[#F1E6DF] dark:bg-muted text-[#756861] dark:text-muted-foreground"
                        >
                          {matName}
                        </span>
                      ))}
                    </div>

                    {/* Collapsible Price Breakdown */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setExpandedBreakdownId(isBreakdownOpen ? null : sug.id)}
                        className="text-[11px] text-[#756861] dark:text-muted-foreground hover:text-[#342824] inline-flex items-center gap-1"
                      >
                        <span>{isBreakdownOpen ? "Hide Price Breakdown" : "View Price Breakdown"}</span>
                        {isBreakdownOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {isBreakdownOpen && (
                        <div className="mt-2 p-3 rounded-xl bg-[#FBF7F3] dark:bg-card border border-[#E6D8D0] text-xs space-y-1.5">
                          <div className="flex justify-between text-[#756861]">
                            <span>Components Subtotal ({sug.beadSequence.length + sug.charms.length} items):</span>
                            <span>₹{sug.pricingQuote.componentSubtotal.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="flex justify-between text-[#756861]">
                            <span>Artisanal Making Fee:</span>
                            <span>₹{sug.pricingQuote.baseMakingCharge.toLocaleString("en-IN")}</span>
                          </div>
                          <div className="border-t border-[#E6D8D0] pt-1 flex justify-between font-bold text-[#342824] dark:text-foreground">
                            <span>Total Estimated Price:</span>
                            <span className="text-[#B66F72]">₹{sug.pricingQuote.totalPrice.toLocaleString("en-IN")}</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Apply Button */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-[#E6D8D0]/60 dark:border-border">
                      <span className="text-[11px] text-[#756861] dark:text-muted-foreground flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />
                        Safe apply: you can click Undo on the designer canvas anytime
                      </span>

                      <Button
                        type="button"
                        onClick={() => handleApply(sug)}
                        className="w-full sm:w-auto bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 py-2 rounded-xl shadow-sm"
                      >
                        Apply to Designer Canvas
                        <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

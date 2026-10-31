import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import Footer from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import {
  fetchJewelleryTypesReadiness,
  type JewelleryTypeReadiness,
} from "@/lib/studio/studioApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Wand2,
  Sliders,
  ShieldCheck,
  ArrowRight,
  Clock,
  ShoppingBag,
  Gem,
  Info,
  CheckCircle2,
  AlertTriangle,
  Layers,
} from "lucide-react";

// ============================================================================
// STATIC MAPS
// ============================================================================

const TYPE_IMAGES: Record<string, string> = {
  bracelet:
    "https://images.unsplash.com/photo-1611591475878-1a51187494c8?auto=format&fit=crop&w=800&q=80",
  chain_necklace:
    "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=800&q=80",
  earrings:
    "https://images.unsplash.com/photo-1630019852942-f89202989a59?auto=format&fit=crop&w=800&q=80",
  bangles:
    "https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?auto=format&fit=crop&w=800&q=80",
};

/**
 * Only types with a fully implemented designer route are listed here.
 * Admin toggles designerStatus to "available" when the designer is ready.
 * This map must be kept in sync with App.tsx routes.
 */
const TYPE_ROUTES: Record<string, string> = {
  bracelet: "/create-your-own/bracelet",
};

// ============================================================================
// PAGE
// ============================================================================

export default function CreateYourOwnLanding() {
  const [types, setTypes] = useState<JewelleryTypeReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGapType, setSelectedGapType] = useState<JewelleryTypeReadiness | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchJewelleryTypesReadiness();
        if (!cancelled) {
          setTypes(data);
        }
      } catch {
        // Fallback if network or server error
        try {
          const res = await apiRequest("GET", "/api/v1/studio/jewellery-types");
          const json = await res.json();
          if (!cancelled && json.success && Array.isArray(json.data)) {
            setTypes(
              json.data.map((t: any) => ({
                slug: t.slug,
                displayName: t.displayName,
                description: t.description,
                imageUrl: t.imageUrl,
                displayOrder: t.displayOrder,
                isEnabled: t.isEnabled,
                isPublished: t.isPublished,
                isArchived: t.isArchived,
                designerStatus: t.designerStatus,
                supportedConstructionTypes: t.supportedConstructionTypes || [],
                eligibleMaterialCount: 0,
                inStockVariantCount: 0,
                hasDesignRule: false,
                hasMakingCharge: false,
                templateCount: 0,
                isFullyReady: t.designerStatus === "available",
                gapAnalysis: {
                  materialsStatus: "stocked",
                  materialsDetail: "Checking catalogue components...",
                  rulesStatus: "active",
                  pricingStatus: "active",
                  summary: t.description || "",
                },
              }))
            );
          }
        } catch {}
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const liveCount = types.filter((t) => t.designerStatus === "available" && t.isFullyReady).length;

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO
        title="Create Your Own Jewellery — Renu's Collections"
        description="Design bespoke handcrafted bracelets, necklaces, earrings, and bangles with calibrated fitting and authentic gemstones."
      />

      <main className="pt-28 pb-20">
        {/* ── Hero ── */}
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#B66F72]/10 text-[#B66F72] dark:text-primary text-xs font-semibold uppercase tracking-wider mb-4 border border-[#B66F72]/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Bespoke Design Studio</span>
          </div>

          <h1 className="font-playfair text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight max-w-3xl mx-auto leading-tight">
            Create Your Own Signature Jewellery
          </h1>

          <p className="mt-4 text-base sm:text-lg text-[#756861] dark:text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Handcraft a personalized piece that tells your unique story.
            Explore our bespoke studio to handpick individual gemstones, beads,
            precious metals, and tailored dimensions.
          </p>

          {/* Availability notice — driven by live API data */}
          {!loading && (
            <div
              className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs sm:text-sm ${
                liveCount > 0
                  ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200"
                  : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200"
              }`}
            >
              {liveCount > 0 ? (
                <>
                  <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <strong>Artisanal Studio is open for bespoke creations.</strong>{" "}
                    Select an available category below to begin crafting.
                  </span>
                </>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>
                    <strong>Bespoke Studios:</strong> Currently preparing authentic gemstone materials and calibration rules.
                  </span>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Dual Design Modes ── */}
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl mb-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Manual */}
            <Card className="rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card p-6 sm:p-8 shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center text-[#B66F72] dark:text-primary mb-5">
                <Sliders className="w-6 h-6" />
              </div>
              <h2 className="font-playfair text-2xl font-semibold mb-2">
                Manual Interactive Design
              </h2>
              <p className="text-sm text-[#756861] dark:text-muted-foreground leading-relaxed mb-6">
                Take complete artistic control. Place individual beads and
                charms onto an interactive canvas, calibrate millimeter sizing,
                test colour harmonies, and preview live wrist fit.
              </p>
              <ul className="space-y-2.5 text-xs sm:text-sm">
                {[
                  "Individual bead selection, placement & replacement",
                  "Exact wrist circumference calibration (13 cm – 22 cm)",
                  "Real-time authoritative component pricing & breakdown",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#B66F72] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* AI Assistant */}
            <Card className="rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card p-6 sm:p-8 shadow-xs relative overflow-hidden">
              <div className="absolute top-4 right-4">
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase font-semibold border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" />
                  Active Assistant
                </Badge>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#B99A72]/15 flex items-center justify-center text-[#B99A72] mb-5">
                <Wand2 className="w-6 h-6" />
              </div>
              <h2 className="font-playfair text-2xl font-semibold mb-2">
                AI Design Assistant
              </h2>
              <p className="text-sm text-[#756861] dark:text-muted-foreground leading-relaxed mb-6">
                Describe your mood, colour palette, or special occasion in
                natural language. Our smart assistant translates your concept
                into physical materials from our active inventory.
              </p>
              <ul className="space-y-2.5 text-xs sm:text-sm">
                {[
                  'Natural language prompts (e.g., "Rose gold summer pastel bracelet")',
                  "Strictly utilizes real in-stock gemstones and components",
                  "Fully editable in manual mode before purchasing",
                ].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#B99A72] shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </section>

        {/* ── Jewellery Type Cards ── */}
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl mb-20">
          <div className="text-center mb-12">
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">
              Artisanal Categories
            </span>
            <h2 className="font-playfair text-3xl sm:text-4xl font-semibold mt-1">
              Choose Your Canvas
            </h2>
            <p className="text-sm text-[#756861] dark:text-muted-foreground mt-2 max-w-xl mx-auto">
              Our Design Studio is tailored to distinct jewellery architectures.
            </p>
          </div>

          {loading ? (
            <div className="py-20 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
              <p className="text-xs text-[#756861] dark:text-muted-foreground">
                Loading bespoke categories…
              </p>
            </div>
          ) : types.length === 0 ? (
            <div className="py-16 text-center max-w-md mx-auto border border-[#E6D8D0] dark:border-border rounded-2xl p-8 bg-white dark:bg-card">
              <Sparkles className="w-8 h-8 mx-auto text-[#B66F72] mb-3 opacity-60" />
              <h3 className="font-playfair text-xl font-semibold mb-2">No Categories Currently Published</h3>
              <p className="text-xs text-[#756861] dark:text-muted-foreground mb-6">
                Our bespoke customisation studio is currently preparing fresh seasonal selections. Please explore our handcrafted ready-to-wear collections in the meantime.
              </p>
              <Link to="/products">
                <Button className="rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white text-xs">
                  Browse Collections
                </Button>
              </Link>
            </div>
          ) : (
            <div
              className={`grid grid-cols-1 ${
                types.length === 1
                  ? "max-w-md mx-auto"
                  : types.length === 2
                  ? "sm:grid-cols-2 max-w-2xl mx-auto gap-6"
                  : types.length === 3
                  ? "sm:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto gap-6"
                  : "sm:grid-cols-2 lg:grid-cols-4 gap-6"
              }`}
            >
              {types.map((type) => {
                const img = getAssetUrl(
                  type.imageUrl || TYPE_IMAGES[type.slug] || TYPE_IMAGES.bracelet
                );
                const isAvailable = type.designerStatus === "available" && type.isFullyReady;
                const route = TYPE_ROUTES[type.slug];

                return (
                  <Card
                    key={type.slug}
                    className="group rounded-2xl overflow-hidden border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs hover:shadow-md transition-all flex flex-col"
                  >
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100 dark:bg-muted">
                      <img
                        src={img}
                        alt={type.displayName}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            TYPE_IMAGES[type.slug] || TYPE_IMAGES.bracelet;
                        }}
                      />
                      <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
                        {isAvailable ? (
                          <Badge className="bg-emerald-600 text-white text-[10px] font-semibold uppercase tracking-wider">
                            Designer Ready
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="bg-white/90 dark:bg-card/90 text-[#756861] dark:text-muted-foreground backdrop-blur-xs text-[10px] uppercase font-semibold tracking-wider border border-[#E6D8D0] dark:border-border"
                          >
                            {type.designerStatus === "available" ? "In Preparation" : "Coming Soon"}
                          </Badge>
                        )}
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-xs">
                          {type.eligibleMaterialCount} component{type.eligibleMaterialCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    <CardContent className="p-5 flex flex-col flex-1 justify-between">
                      <div>
                        <h3 className="font-playfair text-xl font-semibold mb-1.5">
                          {type.displayName}
                        </h3>
                        <p className="text-xs text-[#756861] dark:text-muted-foreground leading-relaxed">
                          {type.description}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[#756861]">
                          <span className="px-2 py-0.5 rounded-md bg-[#F1E6DF] dark:bg-muted text-[10px]">
                            Constructions: {type.supportedConstructionTypes.join(", ")}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t border-[#E6D8D0]/60 dark:border-border/60 space-y-2">
                        {isAvailable && route ? (
                          <Link to={route} className="block">
                            <Button className="w-full text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 shrink-0" />
                              <span>Start Designing</span>
                              <ArrowRight className="w-3 h-3 ml-auto" />
                            </Button>
                          </Link>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedGapType(type)}
                            className="w-full text-xs rounded-xl border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50 flex items-center justify-center gap-1.5"
                          >
                            <Info className="w-3.5 h-3.5 text-[#B66F72]" />
                            <span>Inspect Catalogue Status</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Catalogue & Architecture Gap Modal ── */}
        <Dialog open={Boolean(selectedGapType)} onOpenChange={(open) => !open && setSelectedGapType(null)}>
          <DialogContent className="sm:max-w-lg bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg bg-[#B66F72]/15 flex items-center justify-center text-[#B66F72]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <DialogTitle className="font-playfair text-xl text-[#342824] dark:text-foreground">
                    {selectedGapType?.displayName} — Architecture & Catalogue
                  </DialogTitle>
                  <DialogDescription className="text-xs text-[#756861] dark:text-muted-foreground">
                    Studio prerequisites & current catalogue stocking status
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {selectedGapType && (
              <div className="space-y-4 pt-2 text-xs">
                {/* Status Callout */}
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Catalogue Stocking In Progress</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {selectedGapType.gapAnalysis?.summary}
                  </p>
                </div>

                {/* Audit Grid */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-white dark:bg-background border border-[#E6D8D0] dark:border-border">
                    <span className="text-[10px] text-[#756861] block">Eligible Materials Stocked:</span>
                    <strong className="text-sm font-semibold text-[#342824] dark:text-foreground">
                      {selectedGapType.eligibleMaterialCount} component{selectedGapType.eligibleMaterialCount === 1 ? "" : "s"}
                    </strong>
                    <p className="text-[10px] text-[#756861] mt-0.5">{selectedGapType.gapAnalysis?.materialsDetail}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-background border border-[#E6D8D0] dark:border-border">
                    <span className="text-[10px] text-[#756861] block">Construction Rule:</span>
                    <div className="flex items-center gap-1 mt-0.5">
                      {selectedGapType.hasDesignRule ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      <span className="font-semibold text-xs text-[#342824] dark:text-foreground">
                        {selectedGapType.hasDesignRule ? "Active" : "Awaiting Setup"}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#756861] block mt-0.5">
                      Types: {selectedGapType.supportedConstructionTypes.join(", ")}
                    </span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white dark:bg-background border border-[#E6D8D0] dark:border-border space-y-1">
                  <span className="text-[10px] font-semibold text-[#342824] dark:text-foreground block">
                    Business Roadmap & Procurement:
                  </span>
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground leading-relaxed">
                    To maintain strict product authenticity, Renu's Collections does not display placeholder or ungrounded custom designs. Admin Studio allows adding wholesale collets, Kundan stones, and findings once catalogued.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => setSelectedGapType(null)}
                    className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl"
                  >
                    Got It
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── 4-Step Process ── */}
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl mb-20 bg-white dark:bg-card rounded-3xl p-8 sm:p-12 border border-[#E6D8D0] dark:border-border shadow-xs">
          <div className="text-center mb-10">
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">
              The Process
            </span>
            <h2 className="font-playfair text-3xl font-semibold mt-1">
              How Custom Creation Works
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                n: "1",
                title: "Select Your Piece",
                body: "Choose between elastic bracelets, chain necklaces, drop earrings, or artisanal bangles.",
              },
              {
                n: "2",
                title: "Handpick Materials",
                body: "Choose from natural gemstones, pearls, crystal spacers, and symbolic charms in multiple millimeter sizes.",
              },
              {
                n: "3",
                title: "Calibrated Fitting",
                body: "Our sizing engine calculates total circumference and elasticity ease to estimate physical fit.",
              },
              {
                n: "4",
                title: "Artisanal Assembly",
                body: "Our master artisans hand-string and inspect your bespoke creation before delivering in a keepsake gift box.",
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-[#B66F72]/10 text-[#B66F72] flex items-center justify-center font-playfair font-bold text-lg mb-3">
                  {n}
                </div>
                <h3 className="font-playfair font-semibold text-base">{title}</h3>
                <p className="text-xs text-[#756861] dark:text-muted-foreground leading-relaxed">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Bridge to standard shop ── */}
        <section className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center">
          <div className="p-8 sm:p-10 rounded-3xl bg-gradient-to-r from-[#FBF7F3] via-[#F1E6DF] to-[#FBF7F3] dark:from-muted/40 dark:via-muted/20 dark:to-muted/40 border border-[#E6D8D0] dark:border-border">
            <Gem className="w-8 h-8 text-[#B66F72] dark:text-primary mx-auto mb-3" />
            <h2 className="font-playfair text-2xl sm:text-3xl font-semibold">
              Prefer Ready-To-Wear Creations?
            </h2>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-2 max-w-lg mx-auto">
              Explore our current signature catalogue of handcrafted jewellery,
              featuring one-of-a-kind designs ready for immediate dispatch.
            </p>
            <div className="mt-6 flex justify-center">
              <Link to="/products">
                <Button className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl px-6 py-2.5 text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm">
                  <ShoppingBag className="w-4 h-4" />
                  <span>Browse Ready Collections</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

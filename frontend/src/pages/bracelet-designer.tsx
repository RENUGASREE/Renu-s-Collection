import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SEO } from "@/components/SEO";
import Footer from "@/components/footer";
import Navbar from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Undo2, Redo2, RotateCcw, ArrowLeft, ArrowRight,
  Trash2, PlusCircle, RefreshCw, Sparkles, X, AlertTriangle,
  Layers, Bookmark,
} from "lucide-react";

import BraceletCanvas from "@/components/studio/BraceletCanvas";
import MaterialPicker, { type PickerAction } from "@/components/studio/MaterialPicker";
import FitIndicator from "@/components/studio/FitIndicator";
import PricePanel from "@/components/studio/PricePanel";
import { TemplateGallery } from "@/components/studio/TemplateGallery";
import { AddToCartPanel } from "@/components/studio/AddToCartPanel";
import { AIDesignAssistantModal } from "@/components/studio/AIDesignAssistantModal";

import {
  makeEmptyDesign, makeHistory, pushHistory, undoHistory, redoHistory,
  addBeadAtEnd, insertBead, replaceBead, removeBead, moveBeadLeft, moveBeadRight,
  attachCharm, removeCharm, dismissOrphanedCharms, setWristMm,
  saveDraft, loadDraftRaw, clearDraft,
  type BraceletDesign, type DesignHistory, type BeadPlacement, type CharmAttachment,
} from "@/lib/studio/designState";

import {
  fetchBraceletMaterials, fetchBraceletDesignRule, fetchBraceletMakingCharge,
  fetchSavedDesign,
  type PublicMaterial, type PublicVariant, type DesignRule, type MakingChargeConfig,
  type DesignTemplate, type DesignPriceQuote, type AIDesignSuggestion,
} from "@/lib/studio/studioApi";

// ============================================================================
// DRAFT RESTORATION
// ============================================================================

interface DraftWarning {
  message: string;
  orphanedCount: number;
  hasPartial: boolean;
  partialDesign: BraceletDesign | null;
}

function resolveDraft(
  draft: ReturnType<typeof loadDraftRaw>,
  materials: PublicMaterial[]
): { design: BraceletDesign | null; warning: DraftWarning | null } {
  if (!draft) return { design: null, warning: null };

  const matById = new Map(materials.map((m) => [m.id, m]));
  const variantBySku = new Map<string, { material: PublicMaterial; variant: PublicVariant }>();
  for (const m of materials) {
    for (const v of m.variants) {
      variantBySku.set(v.sku, { material: m, variant: v });
    }
  }

  const orphanedItems: string[] = [];
  const resolvedBeads: BeadPlacement[] = [];

  // Re-derive all bead data from the live catalogue — never trust stored prices/dimensions
  for (const item of draft.beadSequence) {
    const found = variantBySku.get(item.variantSku);
    if (!found || !matById.has(item.materialId)) {
      orphanedItems.push(item.variantSku);
      continue;
    }
    const { material: m, variant: v } = found;
    // Material must still be bracelet-eligible
    if (!m.allowedJewelleryTypes.includes("bracelet")) {
      orphanedItems.push(item.variantSku);
      continue;
    }
    resolvedBeads.push({
      instanceId: item.instanceId,
      materialId: m.id,
      variantSku: v.sku,
      materialType: m.materialType,
      diameterMm: v.dimensionsMm?.diameterMm ?? 0,
      renderAssetUrl: m.renderAssetUrl,
      imageUrl: m.imageUrl,
      color: v.color,
      finish: v.finish,
      displayName: `${m.name} · ${v.sizeLabel}`,
    });
  }

  const resolvedInstanceIds = new Set(resolvedBeads.map((b) => b.instanceId));
  const resolvedCharms: CharmAttachment[] = [];

  for (const c of draft.charms) {
    const found = variantBySku.get(c.variantSku);
    if (!found || !matById.has(c.materialId)) {
      orphanedItems.push(c.variantSku);
      continue;
    }
    if (!resolvedInstanceIds.has(c.anchorInstanceId)) {
      orphanedItems.push(c.variantSku);
      continue;
    }
    const { material: m, variant: v } = found;
    resolvedCharms.push({
      instanceId: c.instanceId,
      anchorInstanceId: c.anchorInstanceId,
      materialId: m.id,
      variantSku: v.sku,
      renderAssetUrl: m.renderAssetUrl,
      imageUrl: m.imageUrl,
      displayName: `${m.name} · ${v.sizeLabel}`,
    });
  }

  if (orphanedItems.length > 0 || resolvedBeads.length === 0) {
    const partialDesign: BraceletDesign | null =
      resolvedBeads.length > 0
        ? {
            beadSequence: resolvedBeads,
            charms: resolvedCharms,
            orphanedCharms: [],
            wristMm: draft.wristMm,
            selectedInstanceId: null,
          }
        : null;

    return {
      design: null,
      warning: {
        message: `${orphanedItems.length} component(s) from your draft are no longer available (removed or deactivated).`,
        orphanedCount: orphanedItems.length,
        hasPartial: resolvedBeads.length > 0,
        partialDesign,
      },
    };
  }

  return {
    design: {
      beadSequence: resolvedBeads,
      charms: resolvedCharms,
      orphanedCharms: [],
      wristMm: draft.wristMm,
      selectedInstanceId: null,
    },
    warning: null,
  };
}

// ============================================================================
// TOOLBAR BUTTON
// ============================================================================

function ToolBtn({
  icon,
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-medium transition-all shrink-0
        ${
          disabled
            ? "opacity-30 cursor-not-allowed text-[#B0A0A0]"
            : danger
            ? "text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
            : active
            ? "bg-[#B66F72]/15 text-[#B66F72] dark:text-primary"
            : "text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/60 dark:hover:bg-muted/40"
        }`}
    >
      {icon}
      <span className="hidden sm:block">{label}</span>
    </button>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function BraceletDesigner() {
  const { toast } = useToast();

  // ---- Server data ----
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [designRule, setDesignRule] = useState<DesignRule | null>(null);
  const [_makingCharge, _setMakingCharge] = useState<MakingChargeConfig | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // ---- Milestone 3 State ----
  const [searchParams] = useSearchParams();
  const designIdParam = searchParams.get("designId");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [currentDesignName, setCurrentDesignName] = useState("My Custom Bracelet");
  const [loadedSavedDesignId, setLoadedSavedDesignId] = useState<string | undefined>(undefined);
  const [latestQuote, setLatestQuote] = useState<DesignPriceQuote | null>(null);

  // ---- Design state ----
  const [history, setHistory] = useState<DesignHistory>(
    () => makeHistory(makeEmptyDesign(160))
  );
  const design = history.present;

  // ---- Picker mode ----
  const [pickerAction, setPickerAction] = useState<PickerAction>("append");

  // ---- Draft warning ----
  const [draftWarning, setDraftWarning] = useState<DraftWarning | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  // ============================================================
  // Load server data + attempt designId or draft restore
  // ============================================================
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingData(true);
      setDataError(null);
      try {
        const [mats, rule, charge] = await Promise.all([
          fetchBraceletMaterials(),
          fetchBraceletDesignRule().catch(() => null),
          fetchBraceletMakingCharge().catch(() => null),
        ]);
        if (cancelled) return;
        setMaterials(mats);
        setDesignRule(rule);
        _setMakingCharge(charge);

        // If loading a specific saved design from URL:
        if (designIdParam) {
          try {
            const saved = await fetchSavedDesign(designIdParam);
            if (cancelled) return;
            const variantBySku = new Map<string, { material: PublicMaterial; variant: PublicVariant }>();
            for (const m of mats) {
              for (const v of m.variants) {
                variantBySku.set(v.sku, { material: m, variant: v });
              }
            }

            const resolvedBeads: BeadPlacement[] = [];
            for (const b of saved.beadSequence) {
              const found = variantBySku.get(b.variantSku);
              if (found) {
                resolvedBeads.push({
                  instanceId: crypto.randomUUID(),
                  materialId: found.material.id,
                  variantSku: found.variant.sku,
                  materialType: found.material.materialType,
                  diameterMm: found.variant.dimensionsMm?.diameterMm ?? b.diameterMm ?? 8,
                  renderAssetUrl: found.material.renderAssetUrl,
                  imageUrl: found.material.imageUrl || b.imageUrl,
                  color: found.variant.color,
                  displayName: found.material.name || b.displayName,
                });
              }
            }

            const restoredDesign: BraceletDesign = {
              wristMm: saved.wristMm || 160,
              beadSequence: resolvedBeads,
              charms: [],
              orphanedCharms: [],
              selectedInstanceId: resolvedBeads[0]?.instanceId || null,
            };

            setHistory(makeHistory(restoredDesign));
            setCurrentDesignName(saved.name);
            setLoadedSavedDesignId(saved._id);
            return;
          } catch (err: any) {
            console.warn("Could not load saved design:", err);
          }
        }

        // Otherwise attempt draft restore against the live catalogue
        const draft = loadDraftRaw();
        if (draft) {
          const { design: resolved, warning } = resolveDraft(draft, mats);
          if (warning) {
            setDraftWarning(warning);
          } else if (resolved) {
            setHistory(makeHistory(resolved));
            setDraftRestored(true);
          }
        }
      } catch (err: any) {
        if (!cancelled)
          setDataError(err?.message ?? "Failed to load design studio data.");
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [designIdParam]);

  // Handler for loading a template from TemplateGallery
  const handleSelectTemplate = useCallback((template: DesignTemplate) => {
    const variantBySku = new Map<string, { material: PublicMaterial; variant: PublicVariant }>();
    for (const m of materials) {
      for (const v of m.variants) {
        variantBySku.set(v.sku, { material: m, variant: v });
      }
    }

    const resolvedBeads: BeadPlacement[] = [];
    for (const b of template.beadSequence) {
      const found = variantBySku.get(b.variantSku);
      if (found) {
        resolvedBeads.push({
          instanceId: crypto.randomUUID(),
          materialId: found.material.id,
          variantSku: found.variant.sku,
          materialType: found.material.materialType,
          diameterMm: found.variant.dimensionsMm?.diameterMm ?? 8,
          renderAssetUrl: found.material.renderAssetUrl,
          imageUrl: found.material.imageUrl,
          color: found.variant.color,
          displayName: found.material.name,
        });
      }
    }

    const newDesign: BraceletDesign = {
      wristMm: template.wristMm || 160,
      beadSequence: resolvedBeads,
      charms: [],
      orphanedCharms: [],
      selectedInstanceId: resolvedBeads[0]?.instanceId || null,
    };

    setHistory(makeHistory(newDesign));
    setCurrentDesignName(template.name);
    setLoadedSavedDesignId(undefined);
    toast({
      title: "Template Loaded",
      description: `"${template.name}" loaded with ${resolvedBeads.length} beads.`,
    });
  }, [materials, toast]);

  // Handler for applying an AI Design Assistant suggestion
  const handleApplyAISuggestion = useCallback(
    (suggestion: AIDesignSuggestion) => {
      const variantBySku = new Map<string, { material: PublicMaterial; variant: PublicVariant }>();
      for (const m of materials) {
        for (const v of m.variants) {
          variantBySku.set(v.sku, { material: m, variant: v });
        }
      }

      const resolvedBeads: BeadPlacement[] = [];
      for (const b of suggestion.beadSequence) {
        const found = variantBySku.get(b.variantSku);
        if (found) {
          resolvedBeads.push({
            instanceId: crypto.randomUUID(),
            materialId: found.material.id,
            variantSku: found.variant.sku,
            materialType: found.material.materialType,
            diameterMm: found.variant.dimensionsMm?.diameterMm ?? b.diameterMm ?? 8,
            renderAssetUrl: found.material.renderAssetUrl,
            imageUrl: found.material.imageUrl || b.imageUrl,
            color: found.variant.color,
            displayName: found.material.name,
          });
        }
      }

      const resolvedCharms: CharmAttachment[] = [];
      for (const c of suggestion.charms) {
        const found = variantBySku.get(c.variantSku);
        const anchorBead =
          resolvedBeads[c.anchorIndex] ||
          resolvedBeads[Math.floor(resolvedBeads.length / 2)] ||
          resolvedBeads[0];

        if (found && anchorBead) {
          resolvedCharms.push({
            instanceId: crypto.randomUUID(),
            anchorInstanceId: anchorBead.instanceId,
            materialId: found.material.id,
            variantSku: found.variant.sku,
            renderAssetUrl: found.material.renderAssetUrl,
            imageUrl: found.material.imageUrl || c.imageUrl,
            displayName: found.material.name,
          });
        }
      }

      const newDesign: BraceletDesign = {
        wristMm: suggestion.wristMm || design.wristMm || 160,
        beadSequence: resolvedBeads,
        charms: resolvedCharms,
        orphanedCharms: [],
        selectedInstanceId: resolvedBeads[0]?.instanceId || null,
      };

      // Push to history so previous design can be recovered via Undo!
      setHistory((h) => pushHistory(h, newDesign));
      setCurrentDesignName(suggestion.name);
      setLoadedSavedDesignId(undefined);

      toast({
        title:
          suggestion.isAiGenerated === false
            ? "Curated Design Applied to Canvas"
            : "AI Design Applied to Canvas",
        description: `"${suggestion.name}" loaded with ${resolvedBeads.length} beads. Click Undo anytime to restore your previous arrangement.`,
      });
    },
    [materials, design.wristMm, toast]
  );

  // ============================================================
  // Auto-save draft on every design change (after first load)
  // ============================================================
  useEffect(() => {
    if (loadingData) return;
    saveDraft(design);
  }, [design, loadingData]);

  // ============================================================
  // Edit operations
  // ============================================================
  const dispatch = useCallback(
    (next: BraceletDesign) => setHistory((h) => pushHistory(h, next)),
    []
  );

  const handleSelectInstance = useCallback(
    (id: string | null) => {
      // Selection change doesn't push history — just update present in-place
      setHistory((h) => ({
        ...h,
        present: { ...h.present, selectedInstanceId: id },
      }));
    },
    []
  );

  const handleWristChange = useCallback(
    (mm: number) => {
      dispatch(setWristMm(design, mm));
    },
    [design, dispatch]
  );

  const handleSelectVariant = useCallback(
    (material: PublicMaterial, variant: PublicVariant, kind: "bead" | "charm") => {
      if (kind === "charm") {
        if (!design.selectedInstanceId || !design.beadSequence.some(b => b.instanceId === design.selectedInstanceId)) {
          toast({
            title: "Select a bead first",
            description: "Tap a bead on the canvas before attaching a charm.",
            variant: "destructive",
          });
          return;
        }
        const charm: Omit<CharmAttachment, "instanceId" | "anchorInstanceId"> = {
          materialId: material.id,
          variantSku: variant.sku,
          renderAssetUrl: material.renderAssetUrl,
          imageUrl: material.imageUrl,
          displayName: `${material.name} · ${variant.sizeLabel}`,
        };
        dispatch(attachCharm(design, charm));
        return;
      }

      // Build the BeadPlacement base (no instanceId yet — edit ops generate it)
      const beadBase: Omit<BeadPlacement, "instanceId"> = {
        materialId: material.id,
        variantSku: variant.sku,
        materialType: material.materialType,
        diameterMm: variant.dimensionsMm?.diameterMm ?? 0,
        renderAssetUrl: material.renderAssetUrl,
        imageUrl: material.imageUrl,
        color: variant.color,
        finish: variant.finish,
        displayName: `${material.name} · ${variant.sizeLabel}`,
      };

      switch (pickerAction) {
        case "append":
          dispatch(addBeadAtEnd(design, beadBase));
          break;
        case "insert_before":
          if (design.selectedInstanceId) {
            dispatch(insertBead(design, beadBase, design.selectedInstanceId, "before"));
          } else {
            dispatch(addBeadAtEnd(design, beadBase));
          }
          break;
        case "insert_after":
          if (design.selectedInstanceId) {
            dispatch(insertBead(design, beadBase, design.selectedInstanceId, "after"));
          } else {
            dispatch(addBeadAtEnd(design, beadBase));
          }
          break;
        case "replace":
          if (design.selectedInstanceId && design.beadSequence.some(b => b.instanceId === design.selectedInstanceId)) {
            dispatch(replaceBead(design, design.selectedInstanceId, beadBase));
          } else {
            dispatch(addBeadAtEnd(design, beadBase));
          }
          break;
      }
    },
    [design, dispatch, pickerAction, toast]
  );

  const handleRemoveSelected = useCallback(() => {
    if (!design.selectedInstanceId) return;
    // Is it a bead?
    if (design.beadSequence.some((b) => b.instanceId === design.selectedInstanceId)) {
      dispatch(removeBead(design, design.selectedInstanceId));
      return;
    }
    // Is it a charm?
    if (design.charms.some((c) => c.instanceId === design.selectedInstanceId)) {
      dispatch(removeCharm(design, design.selectedInstanceId));
    }
  }, [design, dispatch]);

  const handleMoveLeft = useCallback(() => {
    if (design.selectedInstanceId) dispatch(moveBeadLeft(design, design.selectedInstanceId));
  }, [design, dispatch]);

  const handleMoveRight = useCallback(() => {
    if (design.selectedInstanceId) dispatch(moveBeadRight(design, design.selectedInstanceId));
  }, [design, dispatch]);

  const handleReset = useCallback(() => {
    clearDraft();
    setHistory(makeHistory(makeEmptyDesign(design.wristMm)));
    setDraftRestored(false);
    setDraftWarning(null);
    toast({ title: "Design reset", description: "Canvas cleared." });
  }, [design.wristMm, toast]);

  const handleUndo = useCallback(() => setHistory(undoHistory), []);
  const handleRedo = useCallback(() => setHistory(redoHistory), []);

  const handleDismissOrphans = useCallback(() => {
    dispatch(dismissOrphanedCharms(design));
  }, [design, dispatch]);

  const selectedIsBead = design.beadSequence.some(
    (b) => b.instanceId === design.selectedInstanceId
  );
  const selectedIsCharm = design.charms.some(
    (c) => c.instanceId === design.selectedInstanceId
  );
  const hasSelection = selectedIsBead || selectedIsCharm;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO
        title="Elastic Bead Bracelet Designer — Renu's Collections"
        description="Design your own handcrafted elastic bead bracelet. Pick gemstones, spacers and charms, calibrate wrist fit, and get a live price estimate."
        noindex
      />

      <Navbar />

      <main className="pt-24 pb-16">
        {/* Page header */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl mb-4">
          <div className="flex items-center gap-3">
            <Link
              to="/create-your-own"
              className="flex items-center gap-1.5 text-xs text-[#756861] hover:text-[#B66F72] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Create Your Own
            </Link>
            <span className="text-[#D0C8C0]">/</span>
            <span className="text-xs font-medium text-[#342824] dark:text-foreground">
              Elastic Bead Bracelet Designer
            </span>
          </div>

          <div className="flex items-center justify-between mt-2 flex-wrap gap-3">
            <div>
              <h1 className="font-playfair text-2xl sm:text-3xl font-semibold tracking-tight">
                {currentDesignName || "Design Your Bracelet"}
              </h1>
              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                Elastic bead construction · Prices are provisional estimates
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                className="text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white flex items-center gap-1.5 shadow-sm"
                onClick={() => setShowAIAssistant(true)}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>AI Assistant</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-xs rounded-xl border-[#E6D8D0] hover:bg-white text-[#756861] dark:text-foreground flex items-center gap-1.5 shadow-xs"
                onClick={() => setShowTemplates(true)}
              >
                <Layers className="w-3.5 h-3.5 text-[#B66F72]" />
                <span>Starter Templates</span>
              </Button>

              <Link to="/my-designs">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs rounded-xl text-[#756861] hover:text-[#B66F72] flex items-center gap-1.5"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>My Designs</span>
                </Button>
              </Link>

              {draftRestored && !loadedSavedDesignId && (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#B66F72]/10 text-[#B66F72] border border-[#B66F72]/20 font-medium hidden sm:inline-block">
                  Draft restored
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Loading / error states */}
        {loadingData && (
          <div className="flex items-center justify-center py-32">
            <div className="w-8 h-8 border-2 border-[#B66F72] border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {dataError && (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <strong>Could not load studio data.</strong>{" "}
                {dataError}{" "}
                <button
                  className="underline ml-1"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Draft warning banner */}
        {draftWarning && !loadingData && (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <p className="flex-1 text-xs">{draftWarning.message}</p>
              <div className="flex gap-2 shrink-0">
                {draftWarning.hasPartial && draftWarning.partialDesign && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs rounded-xl border-amber-300 text-amber-900"
                    onClick={() => {
                      setHistory(makeHistory(draftWarning.partialDesign!));
                      setDraftRestored(true);
                      setDraftWarning(null);
                    }}
                  >
                    Load available beads
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs rounded-xl border-amber-300 text-amber-900"
                  onClick={() => { clearDraft(); setDraftWarning(null); }}
                >
                  Start fresh
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Orphaned charms banner */}
        {design.orphanedCharms.length > 0 && (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl mb-4">
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span className="flex-1">
                {design.orphanedCharms.length} charm
                {design.orphanedCharms.length !== 1 ? "s" : ""} lost their anchor
                bead. Undo to restore, or dismiss them.
              </span>
              <button
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-100 transition-colors"
                onClick={handleDismissOrphans}
              >
                <X className="w-3 h-3" />
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!loadingData && !dataError && (
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-screen-xl">
            {/* Three-panel layout */}
            <div className="flex flex-col lg:flex-row gap-4 items-start">
              {/* LEFT — Material Picker */}
              <div className="w-full lg:w-72 xl:w-80 shrink-0 lg:sticky lg:top-28 max-h-screen lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
                <div className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] dark:border-border p-4 h-full">
                  <MaterialPicker
                    materials={materials}
                    designRule={designRule}
                    design={design}
                    pickerAction={pickerAction}
                    onPickerActionChange={setPickerAction}
                    onSelectVariant={handleSelectVariant}
                  />
                </div>
              </div>

              {/* CENTRE — Canvas + Toolbar */}
              <div className="flex-1 min-w-0 space-y-3">
                {/* Toolbar */}
                <div className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] dark:border-border px-3 py-2 flex items-center gap-1 flex-wrap">
                  {/* History */}
                  <ToolBtn icon={<Undo2 className="w-4 h-4" />} label="Undo" onClick={handleUndo} disabled={!canUndo} />
                  <ToolBtn icon={<Redo2 className="w-4 h-4" />} label="Redo" onClick={handleRedo} disabled={!canRedo} />
                  <div className="w-px h-7 bg-[#E6D8D0] dark:bg-border mx-1" />

                  {/* Move */}
                  <ToolBtn icon={<ArrowLeft className="w-4 h-4" />} label="Move ←" onClick={handleMoveLeft} disabled={!selectedIsBead} />
                  <ToolBtn icon={<ArrowRight className="w-4 h-4" />} label="Move →" onClick={handleMoveRight} disabled={!selectedIsBead} />
                  <div className="w-px h-7 bg-[#E6D8D0] dark:bg-border mx-1" />

                  {/* Insert / Replace shortcuts (set picker mode) */}
                  <ToolBtn
                    icon={<PlusCircle className="w-4 h-4" />}
                    label="Insert before"
                    onClick={() => setPickerAction("insert_before")}
                    disabled={!selectedIsBead}
                    active={pickerAction === "insert_before"}
                  />
                  <ToolBtn
                    icon={<RefreshCw className="w-4 h-4" />}
                    label="Replace"
                    onClick={() => setPickerAction("replace")}
                    disabled={!selectedIsBead}
                    active={pickerAction === "replace"}
                  />

                  {/* Remove */}
                  <ToolBtn icon={<Trash2 className="w-4 h-4" />} label="Remove" onClick={handleRemoveSelected} disabled={!hasSelection} danger />
                  <div className="w-px h-7 bg-[#E6D8D0] dark:bg-border mx-1" />

                  {/* Reset */}
                  <ToolBtn icon={<RotateCcw className="w-4 h-4" />} label="Reset" onClick={handleReset} danger />
                  <div className="w-px h-7 bg-[#E6D8D0] dark:bg-border mx-1" />

                  {/* AI Ideas */}
                  <ToolBtn
                    icon={<Sparkles className="w-4 h-4 text-[#B66F72]" />}
                    label="AI Ideas"
                    onClick={() => setShowAIAssistant(true)}
                  />

                  {/* Bead count */}
                  <span className="ml-auto text-[11px] text-[#B0A0A0] hidden sm:block pr-1">
                    {design.beadSequence.length} bead{design.beadSequence.length !== 1 ? "s" : ""}
                    {design.charms.length > 0 ? ` · ${design.charms.length} charm${design.charms.length !== 1 ? "s" : ""}` : ""}
                  </span>
                </div>

                {/* SVG Canvas */}
                <div className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] dark:border-border p-3 sm:p-5">
                  <BraceletCanvas
                    design={design}
                    materials={materials}
                    onSelectInstance={handleSelectInstance}
                  />
                </div>

                {/* Selection hint */}
                <p className="text-center text-[11px] text-[#B0A0A0] dark:text-muted-foreground/60">
                  {hasSelection
                    ? `Selected: ${
                        design.beadSequence.find((b) => b.instanceId === design.selectedInstanceId)?.displayName
                        ?? design.charms.find((c) => c.instanceId === design.selectedInstanceId)?.displayName
                        ?? "…"
                      } — use toolbar or pick a replacement`
                    : "Tap a bead to select it, then edit using the toolbar above"}
                </p>
              </div>

              {/* RIGHT — Fit + Price + Add to Cart */}
              <div className="w-full lg:w-72 xl:w-80 shrink-0 space-y-4 lg:sticky lg:top-28 max-h-screen lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
                <FitIndicator
                  design={design}
                  designRule={designRule}
                  onWristChange={handleWristChange}
                />
                <PricePanel design={design} onQuoteChange={setLatestQuote} />
                <AddToCartPanel
                  wristMm={design.wristMm}
                  beads={design.beadSequence}
                  charms={design.charms}
                  quoteTotalPrice={latestQuote?.totalPrice || 0}
                  minComponents={designRule?.minComponents ?? 15}
                  maxComponents={designRule?.maxComponents ?? 35}
                  currentDesignName={currentDesignName}
                  savedDesignId={loadedSavedDesignId}
                  onSaved={(savedId, name) => {
                    setLoadedSavedDesignId(savedId);
                    setCurrentDesignName(name);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Starter Templates Modal */}
        <TemplateGallery
          open={showTemplates}
          onOpenChange={setShowTemplates}
          onSelectTemplate={handleSelectTemplate}
        />

        {/* AI Design Assistant Modal */}
        <AIDesignAssistantModal
          open={showAIAssistant}
          onOpenChange={setShowAIAssistant}
          currentWristMm={design.wristMm || 160}
          onApplySuggestion={handleApplyAISuggestion}
        />
      </main>

      <Footer />
    </div>
  );
}

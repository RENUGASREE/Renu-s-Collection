import { useState, useMemo, useEffect } from "react";
import { getAssetUrl } from "@/lib/queryClient";
import ProductImage from "@/components/ProductImage";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronRight, Sparkles, AlertTriangle } from "lucide-react";
import type { PublicMaterial, PublicVariant, DesignRule } from "@/lib/studio/studioApi";
import type { BraceletDesign } from "@/lib/studio/designState";
import { fetchComponentTypes, IStudioComponentType } from "@/lib/studio/independentStudioApi";

// ============================================================================
// HELPERS
// ============================================================================

const BEAD_TYPES = ["bead", "stone", "spacer"];
const CHARM_TYPE = "charm";

function stockLabel(v: PublicVariant): { text: string; cls: string } {
  const isAvailable = typeof v.stock === "number" ? v.stock > 0 : Boolean(v.inStock);
  if (!isAvailable) return { text: "Out of stock", cls: "text-red-500" };
  if (typeof v.stock === "number" && v.stock <= 5) return { text: `Low (${v.stock})`, cls: "text-amber-600" };
  return { text: "In stock", cls: "text-emerald-700" };
}

function isNonStandardSize(v: PublicVariant, rule: DesignRule | null): boolean {
  if (!rule || !rule.permittedBeadSizesMm || rule.permittedBeadSizesMm.length === 0) return false;
  const d = v.dimensionsMm?.diameterMm;
  if (!d) return false;
  return !rule.permittedBeadSizesMm.includes(d);
}

// ============================================================================
// TYPES
// ============================================================================

export type PickerAction = "append" | "insert_before" | "insert_after" | "replace";

interface MaterialPickerProps {
  materials: PublicMaterial[];
  designRule: DesignRule | null;
  design: BraceletDesign;
  pickerAction: PickerAction;
  onPickerActionChange: (action: PickerAction) => void;
  onSelectVariant: (
    material: PublicMaterial,
    variant: PublicVariant,
    kind: "bead" | "charm"
  ) => void;
}

// ============================================================================
// VARIANT PILL
// ============================================================================

function VariantPill({
  material,
  variant,
  kind,
  rule,
  hasSelection,
  onSelect,
}: {
  material: PublicMaterial;
  variant: PublicVariant;
  kind: "bead" | "charm";
  rule: DesignRule | null;
  hasSelection: boolean;
  onSelect: () => void;
}) {
  const { text: stockText, cls: stockCls } = stockLabel(variant);
  const nonStd = kind === "bead" && isNonStandardSize(variant, rule);
  const isAvailable = typeof variant.stock === "number" ? variant.stock > 0 : Boolean(variant.inStock);
  const disabled = !isAvailable;
  const variantThumb = variant.renderAssetUrl || variant.imageUrl;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-xs flex items-center justify-between gap-2.5 ${
        disabled
          ? "opacity-40 cursor-not-allowed bg-stone-50 border-stone-200"
          : "bg-white dark:bg-card border-[#E6D8D0] dark:border-border hover:border-[#B66F72] hover:bg-[#FBF7F3] dark:hover:bg-muted/50 cursor-pointer shadow-2xs"
      }`}
    >
      {variantThumb && (
        <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 border border-[#E6D8D0] bg-stone-50 flex items-center justify-center aspect-square">
          <img
            src={getAssetUrl(variantThumb)}
            alt={variant.sizeLabel}
            className="w-full h-full object-contain p-0.5"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-[#342824] dark:text-foreground">{variant.sizeLabel}</span>
          {variant.color && (
            <span className="text-[#756861] dark:text-muted-foreground">{variant.color}</span>
          )}
          {variant.finish && (
            <span className="text-[#956861] italic">{variant.finish}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-[10px] ${stockCls}`}>{stockText}</span>
          {variant.dimensionsMm?.diameterMm && (
            <span className="text-[10px] text-[#B0A0A0]">⌀{variant.dimensionsMm.diameterMm}mm</span>
          )}
          {nonStd && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />non-std size
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-semibold text-[#B66F72] dark:text-primary">₹{variant.sellingRate}</div>
        <div className="text-[10px] text-[#B0A0A0]">/{variant.sellingUnit}</div>
      </div>
    </button>
  );
}

// ============================================================================
// MATERIAL CARD
// ============================================================================

function MaterialCard({
  material,
  kind,
  rule,
  hasSelection,
  onSelectVariant,
  defaultExpanded,
}: {
  material: PublicMaterial;
  kind: "bead" | "charm";
  rule: DesignRule | null;
  hasSelection: boolean;
  onSelectVariant: (v: PublicVariant) => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const activeVariants = material.variants.filter((v) => v.inStock !== false || v.stock !== 0);

  return (
    <div className="rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 hover:bg-[#FBF7F3]/60 dark:hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-[#E6D8D0] bg-stone-50 flex items-center justify-center aspect-square">
          <ProductImage
            src={material.imageUrl}
            alt={material.name}
            name={material.name}
            category={material.materialType}
            size="sm"
            aspectRatio="aspect-square"
            className="w-full h-full"
            imgClassName="object-cover w-full h-full"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-medium text-xs text-[#342824] dark:text-foreground truncate">
              {material.name}
            </span>
            {material.materialType === CHARM_TYPE && (
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#B66F72]/15 text-[#B66F72] font-semibold shrink-0">
                Charm
              </span>
            )}
            {material.selectionPolicy === 'seller_random_variant' && (
              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-semibold shrink-0">
                Random
              </span>
            )}
          </div>
          <div className="text-[10px] text-[#B0A0A0]">
            {material.selectionPolicy === 'seller_random_variant' ? "Seller Assortment" : `${material.variants.length} variant${material.variants.length !== 1 ? "s" : ""}`}
            {" · "}
            <span className="font-mono uppercase">{material.code}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#B0A0A0] shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#B0A0A0] shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#E6D8D0]/50 pt-2">
          {material.selectionPolicy === 'seller_random_variant' ? (
            (() => {
              const eligibleVariants = material.variants.filter((v) =>
                v.inStock !== false && (!material.eligibleAssortmentSkus?.length || material.eligibleAssortmentSkus.includes(v.sku))
              );
              const poolStock = eligibleVariants.reduce((sum, v) => sum + (typeof v.stock === "number" ? v.stock : v.inStock ? 1 : 0), 0);
              const sampleRate = eligibleVariants[0]?.sellingRate ?? 0;
              const unit = eligibleVariants[0]?.sellingUnit ?? "piece";
              const isPoolAvailable = poolStock > 0;

              return (
                <div className="rounded-xl border border-[#B66F72]/30 bg-[#FAF7F5] dark:bg-muted/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-xs text-[#342824] dark:text-foreground">Random Assortment</span>
                      <span className="text-[10px] text-[#B66F72] ml-1.5 font-medium">(Seller Selected)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-xs text-[#B66F72]">₹{sampleRate}</span>
                      <span className="text-[10px] text-[#B0A0A0]">/{unit}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground leading-relaxed">
                    {material.assortmentNotes || "Finish or style will be randomly selected by our artisans during order crafting."}
                  </p>
                  <div className="flex items-center justify-between pt-1">
                    <span className={`text-[10px] font-medium ${isPoolAvailable ? "text-emerald-600" : "text-red-500"}`}>
                      {isPoolAvailable ? `Assortment available (pool stock: ${poolStock})` : "Out of stock"}
                    </span>
                    <button
                      type="button"
                      disabled={!isPoolAvailable}
                      onClick={() => onSelectVariant(eligibleVariants[0] || material.variants[0])}
                      className="px-3 py-1 rounded-lg text-xs font-medium bg-[#B66F72] text-white hover:bg-[#95565A] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Add Assortment
                    </button>
                  </div>
                </div>
              );
            })()
          ) : material.variants.length === 0 ? (
            <p className="text-[11px] text-[#B0A0A0] italic py-2">No variants configured.</p>
          ) : (
            material.variants.map((v) => (
              <VariantPill
                key={v.sku}
                material={material}
                variant={v}
                kind={kind}
                rule={rule}
                hasSelection={hasSelection}
                onSelect={() => onSelectVariant(v)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MaterialPicker({
  materials,
  designRule,
  design,
  pickerAction,
  onPickerActionChange,
  onSelectVariant,
}: MaterialPickerProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [componentTypes, setComponentTypes] = useState<IStudioComponentType[]>([]);

  useEffect(() => {
    fetchComponentTypes(true)
      .then(setComponentTypes)
      .catch((err) => console.error("Failed to fetch component types in MaterialPicker:", err));
  }, []);

  const hasSelection = design.selectedInstanceId !== null &&
    design.beadSequence.some((b) => b.instanceId === design.selectedInstanceId);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (filterType !== "all") {
        if (filterType === "charms" || filterType === "charm") {
          if (m.materialType !== "charm") return false;
        } else if (filterType === "bead" || filterType === "beads") {
          if (m.materialType !== "bead") return false;
        } else if (m.materialType !== filterType) {
          return false;
        }
      }
      // When filterType === "all", keep ALL components
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.variants.some((v) => v.sku.toLowerCase().includes(q) || (v.color ?? "").toLowerCase().includes(q))
      );
    });
  }, [materials, filterType, search]);

  const showingCharms = filterType === "charms" || filterType === "charm";

  const actionButtons: { key: PickerAction; label: string; disabled?: boolean }[] = [
    { key: "append", label: "Add to end" },
    { key: "insert_before", label: "Insert before", disabled: !hasSelection },
    { key: "insert_after", label: "Insert after", disabled: !hasSelection },
    { key: "replace", label: "Replace", disabled: !hasSelection },
  ];

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Header */}
      <div>
        <h2 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
          Material Library
        </h2>
        <p className="text-[11px] text-[#756861] dark:text-muted-foreground mt-0.5">
          Bracelet-eligible components
        </p>
      </div>

      {/* Action mode selector */}
      <div className="bg-[#FBF7F3] dark:bg-muted/30 rounded-xl p-2 border border-[#E6D8D0] dark:border-border">
        <p className="text-[10px] uppercase font-semibold text-[#B0A0A0] tracking-wider mb-1.5 px-1">
          Placement action
        </p>
        <div className="flex flex-wrap gap-1">
          {actionButtons.map(({ key, label, disabled }) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onPickerActionChange(key)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                pickerAction === key
                  ? "bg-[#B66F72] text-white"
                  : disabled
                  ? "bg-white/50 text-[#C0B0B0] cursor-not-allowed border border-[#E6D8D0]"
                  : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] hover:border-[#B66F72]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#B0A0A0]" />
        <Input
          placeholder="Search by name, colour or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs rounded-xl border-[#E6D8D0] dark:border-border bg-white dark:bg-card"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {[
          { key: "all", label: "All" },
          ...(componentTypes.length > 0
            ? componentTypes.map((t) => ({ key: t.typeId, label: t.displayName }))
            : [
                { key: "bead", label: "Beads" },
                { key: "charm", label: "Charms" },
              ]),
        ].map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterType(key)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
              filterType === key
                ? "bg-[#342824] text-white"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] hover:border-[#B66F72]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Material list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {showingCharms && !hasSelection && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-[11px] mb-2">
            <Sparkles className="w-3 h-3 shrink-0" />
            Select a bead on the canvas first to attach a charm.
          </div>
        )}

        {filteredMaterials.length === 0 ? (
          <EmptyMaterialsState
            message={
              search
                ? `No components match "${search}".`
                : showingCharms
                ? "No charm components configured yet."
                : "No components in this category yet."
            }
          />
        ) : (
          filteredMaterials.map((m, i) => {
            const kind = m.materialType === CHARM_TYPE ? "charm" : "bead";
            return (
              <MaterialCard
                key={m.id}
                material={m}
                kind={kind}
                rule={designRule}
                hasSelection={hasSelection}
                defaultExpanded={i === 0 && filteredMaterials.length <= 3}
                onSelectVariant={(v) => onSelectVariant(m, v, kind)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function EmptyMaterialsState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <Sparkles className="w-8 h-8 text-[#E6D8D0] mx-auto mb-2" />
      <p className="text-xs text-[#B0A0A0]">{message}</p>
      <p className="text-[11px] text-[#C0B0B0] mt-1">
        Add materials via Admin → Create Your Own.
      </p>
    </div>
  );
}

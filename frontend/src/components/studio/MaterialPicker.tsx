import { useState, useMemo } from "react";
import { getAssetUrl } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ChevronDown, ChevronRight, Sparkles, AlertTriangle } from "lucide-react";
import type { PublicMaterial, PublicVariant, DesignRule } from "@/lib/studio/studioApi";
import type { BraceletDesign } from "@/lib/studio/designState";

// ============================================================================
// HELPERS
// ============================================================================

const BEAD_TYPES = ["bead", "stone", "spacer"];
const CHARM_TYPE = "charm";

function stockLabel(v: PublicVariant): { text: string; cls: string } {
  if (!v.inStock) return { text: "Out of stock", cls: "text-red-500" };
  if (v.stock !== undefined && v.stock <= 5) return { text: `Low (${v.stock})`, cls: "text-amber-600" };
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
  const disabled = !variant.inStock;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all text-xs flex items-start justify-between gap-2 ${
        disabled
          ? "opacity-40 cursor-not-allowed bg-stone-50 border-stone-200"
          : "bg-white dark:bg-card border-[#E6D8D0] dark:border-border hover:border-[#B66F72] hover:bg-[#FBF7F3] dark:hover:bg-muted/50 cursor-pointer"
      }`}
    >
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
        <img
          src={getAssetUrl(material.imageUrl)}
          alt={material.name}
          className="w-10 h-10 rounded-lg object-cover border border-[#E6D8D0] shrink-0 bg-stone-50"
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/placeholders/placeholder.png";
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-xs text-[#342824] dark:text-foreground truncate">
            {material.name}
          </div>
          <div className="text-[10px] text-[#B0A0A0]">
            {material.variants.length} variant{material.variants.length !== 1 ? "s" : ""}
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
        <div className="px-3 pb-3 space-y-1.5 border-t border-[#E6D8D0]/50">
          {material.variants.length === 0 ? (
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

  const hasSelection = design.selectedInstanceId !== null &&
    design.beadSequence.some((b) => b.instanceId === design.selectedInstanceId);

  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (filterType === "charms") return m.materialType === CHARM_TYPE;
      if (filterType !== "all" && filterType !== "charms") {
        if (!BEAD_TYPES.includes(m.materialType)) return false;
        if (filterType !== "beads" && m.materialType !== filterType) return false;
      } else if (filterType === "all") {
        if (m.materialType === CHARM_TYPE) return false; // charms in separate section
        if (!BEAD_TYPES.includes(m.materialType)) return false;
      }
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.code.toLowerCase().includes(q) ||
        m.variants.some((v) => v.sku.toLowerCase().includes(q) || (v.color ?? "").toLowerCase().includes(q))
      );
    });
  }, [materials, filterType, search]);

  const charmMaterials = useMemo(
    () => materials.filter((m) => m.materialType === CHARM_TYPE),
    [materials]
  );

  const showingCharms = filterType === "charms";

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
          { key: "bead", label: "Beads" },
          { key: "stone", label: "Stones" },
          { key: "spacer", label: "Spacers" },
          { key: "charms", label: "Charms" },
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
        {showingCharms ? (
          charmMaterials.length === 0 ? (
            <EmptyMaterialsState message="No charm components configured yet." />
          ) : (
            <>
              {!hasSelection && (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-[11px]">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  Select a bead on the canvas first to attach a charm.
                </div>
              )}
              {charmMaterials.map((m, i) => (
                <MaterialCard
                  key={m.id}
                  material={m}
                  kind="charm"
                  rule={designRule}
                  hasSelection={hasSelection}
                  defaultExpanded={i === 0}
                  onSelectVariant={(v) => onSelectVariant(m, v, "charm")}
                />
              ))}
            </>
          )
        ) : filteredMaterials.length === 0 ? (
          <EmptyMaterialsState
            message={
              search
                ? `No components match "${search}".`
                : "No components in this category yet."
            }
          />
        ) : (
          filteredMaterials.map((m, i) => (
            <MaterialCard
              key={m.id}
              material={m}
              kind="bead"
              rule={designRule}
              hasSelection={hasSelection}
              defaultExpanded={i === 0 && filteredMaterials.length <= 3}
              onSelectVariant={(v) => onSelectVariant(m, v, "bead")}
            />
          ))
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

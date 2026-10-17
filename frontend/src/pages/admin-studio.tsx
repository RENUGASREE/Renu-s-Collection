import { useState, useEffect } from "react";
import { SEO } from "@/components/SEO";
import Footer from "@/components/footer";
import AdminNav from "@/components/AdminNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import { fetchJewelleryTypesReadiness, type JewelleryTypeReadiness } from "@/lib/studio/studioApi";
import {
  Sparkles,
  Layers,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  Filter,
  Package,
  Ruler,
  DollarSign,
  Tag,
  ImageIcon,
  RefreshCw,
  Sliders,
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface JewelleryType {
  slug: string;
  displayName: string;
  description?: string;
  displayOrder: number;
  isEnabled: boolean;
  designerStatus: "available" | "coming_soon" | "maintenance";
  supportedConstructionTypes: string[];
}

interface MaterialVariant {
  _id?: string;
  sku: string;
  color?: string;
  finish?: string;
  sizeLabel: string;
  dimensionsMm: {
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    diameterMm?: number;
    holeDiameterMm?: number;
    attachmentSizeMm?: number;
  };
  sellingUnit: "piece" | "pair" | "cm" | "unit";
  purchaseCost: number;
  sellingRate: number;
  stock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

interface StudioMaterial {
  _id: string;
  name: string;
  code: string;
  description?: string;
  materialType: string;
  imageUrl: string;
  renderAssetUrl?: string;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  isActive: boolean;
  sortOrder: number;
  variants: MaterialVariant[];
}

interface DesignRule {
  jewelleryType: string;
  constructionType: string;
  minWristMm: number;
  maxWristMm: number;
  minComponents: number;
  maxComponents: number;
  permittedBeadSizesMm: number[];
  allowedMaterialTypes: string[];
  maxCharms: number;
  fitAllowanceMm: number;
  requiresReviewThresholds?: {
    minComponentsForReview?: number;
    maxComponentsForReview?: number;
    notes?: string;
  };
  isActive: boolean;
  version: number;
}

interface MakingCharge {
  jewelleryType: string;
  constructionType: string;
  baseFee: number;
  serviceCharges: Array<{
    name: string;
    fee: number;
    isOptional: boolean;
    description?: string;
  }>;
  isActive: boolean;
}

export default function AdminStudio() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"materials" | "types" | "rules" | "pricing" | "reservations">("materials");

  // State: Jewellery Types
  const [jewelleryTypes, setJewelleryTypes] = useState<JewelleryType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);

  // State: Materials & Variants
  const [materials, setMaterials] = useState<StudioMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // Material Form Modal
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<StudioMaterial | null>(null);
  const [materialForm, setMaterialForm] = useState({
    name: "",
    code: "",
    description: "",
    materialType: "bead",
    imageUrl: "",
    renderAssetUrl: "",
    allowedJewelleryTypes: ["bracelet"],
    isActive: true,
  });

  // Variant Modal
  const [showVariantModal, setShowVariantModal] = useState(false);
  const [selectedMaterialForVariant, setSelectedMaterialForVariant] = useState<StudioMaterial | null>(null);
  const [editingVariantSku, setEditingVariantSku] = useState<string | null>(null);
  const [variantForm, setVariantForm] = useState({
    sku: "",
    color: "",
    finish: "",
    sizeLabel: "8mm",
    diameterMm: 8,
    holeDiameterMm: 1,
    sellingUnit: "piece" as "piece" | "pair" | "cm" | "unit",
    purchaseCost: 15,
    sellingRate: 35,
    stock: 100,
    lowStockThreshold: 10,
    isActive: true,
  });

  // Confirm disable variant dialog
  const [disablingVariant, setDisablingVariant] = useState<{ materialId: string; sku: string } | null>(null);

  // State: Live Readiness
  const [readinessList, setReadinessList] = useState<JewelleryTypeReadiness[]>([]);

  // State: Design Rules & Making Charges (Multi-Type)
  const [selectedRuleType, setSelectedRuleType] = useState<string>("bracelet");
  const [selectedRuleConstruction, setSelectedRuleConstruction] = useState<string>("elastic_bead");
  const [currentRule, setCurrentRule] = useState<DesignRule | null>(null);
  const [loadingRule, setLoadingRule] = useState(false);

  const [selectedPricingType, setSelectedPricingType] = useState<string>("bracelet");
  const [selectedPricingConstruction, setSelectedPricingConstruction] = useState<string>("elastic_bead");
  const [currentMakingCharge, setCurrentMakingCharge] = useState<MakingCharge | null>(null);
  const [loadingCharge, setLoadingCharge] = useState(false);

  // State: Stock Reservations & Lifecycle (Milestone 6)
  const [reservations, setReservations] = useState<any[]>([]);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [filterReservationStatus, setFilterReservationStatus] = useState<string>("all");

  useEffect(() => {
    fetchJewelleryTypes();
    fetchMaterials();
  }, []);

  useEffect(() => {
    if (activeTab === "reservations") {
      fetchReservations();
    }
  }, [activeTab, filterReservationStatus]);

  useEffect(() => {
    if (selectedRuleType && selectedRuleConstruction) {
      fetchRule(selectedRuleType, selectedRuleConstruction);
    }
  }, [selectedRuleType, selectedRuleConstruction]);

  useEffect(() => {
    if (selectedPricingType && selectedPricingConstruction) {
      fetchMakingCharge(selectedPricingType, selectedPricingConstruction);
    }
  }, [selectedPricingType, selectedPricingConstruction]);

  // ==========================================================================
  // API LOADERS
  // ==========================================================================

  const fetchJewelleryTypes = async () => {
    try {
      setLoadingTypes(true);
      const [res, readiness] = await Promise.all([
        apiRequest("GET", "/api/v1/studio/admin/jewellery-types"),
        fetchJewelleryTypesReadiness(),
      ]);
      const json = await res.json();
      if (json.success) setJewelleryTypes(json.data);
      if (readiness) setReadinessList(readiness);
    } catch (err: any) {
      toast({ title: "Failed to load jewellery types", description: err.message, variant: "destructive" });
    } finally {
      setLoadingTypes(false);
    }
  };

  const fetchMaterials = async () => {
    try {
      setLoadingMaterials(true);
      const res = await apiRequest("GET", "/api/v1/studio/admin/materials?limit=100");
      const json = await res.json();
      if (json.success) setMaterials(json.data);
    } catch (err: any) {
      toast({ title: "Failed to load materials", description: err.message, variant: "destructive" });
    } finally {
      setLoadingMaterials(false);
    }
  };

  const fetchRule = async (typeSlug: string, construction: string) => {
    try {
      setLoadingRule(true);
      const res = await apiRequest("GET", `/api/v1/studio/admin/rules/${typeSlug}/${construction}`);
      if (res.ok) {
        const json = await res.json();
        setCurrentRule(json.data);
      } else {
        setCurrentRule(null);
      }
    } catch (err: any) {
      setCurrentRule(null);
    } finally {
      setLoadingRule(false);
    }
  };

  const fetchMakingCharge = async (typeSlug: string, construction: string) => {
    try {
      setLoadingCharge(true);
      const res = await apiRequest("GET", `/api/v1/studio/admin/making-charges/${typeSlug}/${construction}`);
      if (res.ok) {
        const json = await res.json();
        setCurrentMakingCharge(json.data);
      } else {
        setCurrentMakingCharge(null);
      }
    } catch (err: any) {
      setCurrentMakingCharge(null);
    } finally {
      setLoadingCharge(false);
    }
  };

  const fetchReservations = async () => {
    try {
      setLoadingReservations(true);
      const url =
        filterReservationStatus !== "all"
          ? `/api/v1/studio/admin/inventory/reservations?status=${filterReservationStatus}`
          : "/api/v1/studio/admin/inventory/reservations";
      const res = await apiRequest("GET", url);
      const json = await res.json();
      if (json.success) setReservations(json.data);
    } catch (err: any) {
      toast({ title: "Failed to load reservations", description: err.message, variant: "destructive" });
    } finally {
      setLoadingReservations(false);
    }
  };

  const handleCleanupExpired = async () => {
    try {
      const res = await apiRequest("POST", "/api/v1/studio/admin/inventory/cleanup-expired");
      const json = await res.json();
      if (json.success) {
        toast({ title: "Expired Reservations Cleaned", description: json.message });
        fetchReservations();
        fetchMaterials();
      }
    } catch (err: any) {
      toast({ title: "Cleanup Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleReconcile = async (
    reservationId: string,
    action: "force_commit" | "refund_and_release"
  ) => {
    try {
      const res = await apiRequest("POST", `/api/v1/studio/admin/inventory/reconcile/${reservationId}`, {
        action,
        adminNotes: action === "force_commit" ? "Admin confirmed stock availability" : "Admin cancelled order for refund",
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Reconciliation Saved", description: json.message });
        fetchReservations();
      }
    } catch (err: any) {
      toast({ title: "Reconciliation Failed", description: err.message, variant: "destructive" });
    }
  };

  // ==========================================================================
  // JEWELLERY TYPE ACTIONS
  // ==========================================================================

  const handleUpdateTypeStatus = async (slug: string, updates: Partial<JewelleryType>) => {
    try {
      const res = await apiRequest("PATCH", `/api/v1/studio/admin/jewellery-types/${slug}`, updates);
      if (!res.ok) throw new Error("Update failed");
      toast({ title: "Category Updated", description: `Updated settings for ${slug}.` });
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  // ==========================================================================
  // MATERIAL ACTIONS
  // ==========================================================================

  const handleSaveMaterial = async () => {
    try {
      if (!materialForm.name.trim() || !materialForm.code.trim() || !materialForm.imageUrl.trim()) {
        toast({ title: "Validation Error", description: "Name, Code, and Image URL are required.", variant: "destructive" });
        return;
      }

      if (editingMaterial) {
        const res = await apiRequest("PATCH", `/api/v1/studio/admin/materials/${editingMaterial._id}`, materialForm);
        if (!res.ok) throw new Error("Update failed");
        toast({ title: "Material Updated", description: `Updated ${materialForm.name}.` });
      } else {
        const res = await apiRequest("POST", "/api/v1/studio/admin/materials", materialForm);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Creation failed");
        }
        toast({ title: "Material Created", description: `Created new material ${materialForm.name}.` });
      }

      setShowMaterialModal(false);
      setEditingMaterial(null);
      fetchMaterials();
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  // ==========================================================================
  // VARIANT ACTIONS
  // ==========================================================================

  const handleSaveVariant = async () => {
    if (!selectedMaterialForVariant) return;

    try {
      if (!variantForm.sku.trim() || !variantForm.sizeLabel.trim()) {
        toast({ title: "Validation Error", description: "SKU and Size Label are required.", variant: "destructive" });
        return;
      }

      const payload = {
        sku: variantForm.sku.toUpperCase(),
        color: variantForm.color,
        finish: variantForm.finish,
        sizeLabel: variantForm.sizeLabel,
        dimensionsMm: {
          diameterMm: Number(variantForm.diameterMm) || undefined,
          holeDiameterMm: Number(variantForm.holeDiameterMm) || undefined,
        },
        sellingUnit: variantForm.sellingUnit,
        purchaseCost: Number(variantForm.purchaseCost) || 0,
        sellingRate: Number(variantForm.sellingRate) || 0,
        stock: Number(variantForm.stock) || 0,
        lowStockThreshold: Number(variantForm.lowStockThreshold) || 5,
        isActive: variantForm.isActive,
      };

      if (editingVariantSku) {
        const res = await apiRequest(
          "PATCH",
          `/api/v1/studio/admin/materials/${selectedMaterialForVariant._id}/variants/${editingVariantSku}`,
          payload
        );
        if (!res.ok) throw new Error("Update variant failed");
        toast({ title: "Variant Updated", description: `Updated SKU ${variantForm.sku}.` });
      } else {
        const res = await apiRequest(
          "POST",
          `/api/v1/studio/admin/materials/${selectedMaterialForVariant._id}/variants`,
          payload
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.message || "Add variant failed");
        }
        toast({ title: "Variant Added", description: `Added variant SKU ${variantForm.sku}.` });
      }

      setShowVariantModal(false);
      setEditingVariantSku(null);
      fetchMaterials();
    } catch (err: any) {
      toast({ title: "Variant Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleConfirmDisableVariant = async () => {
    if (!disablingVariant) return;
    try {
      const res = await apiRequest(
        "DELETE",
        `/api/v1/studio/admin/materials/${disablingVariant.materialId}/variants/${disablingVariant.sku}`
      );
      if (!res.ok) throw new Error("Disable failed");
      toast({ title: "Variant Disabled", description: `SKU ${disablingVariant.sku} is now inactive.` });
      setDisablingVariant(null);
      fetchMaterials();
    } catch (err: any) {
      toast({ title: "Failed to Disable", description: err.message, variant: "destructive" });
    }
  };

  // ==========================================================================
  // DESIGN RULE & MAKING CHARGE SAVERS
  // ==========================================================================

  const handleSaveRule = async () => {
    if (!currentRule) return;
    try {
      const res = await apiRequest(
        "PUT",
        `/api/v1/studio/admin/rules/${selectedRuleType}/${selectedRuleConstruction}`,
        currentRule
      );
      if (!res.ok) throw new Error("Save rule failed");
      toast({
        title: "Design Rule Saved",
        description: `Rules for ${selectedRuleType} (${selectedRuleConstruction}) updated.`,
      });
      fetchRule(selectedRuleType, selectedRuleConstruction);
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleInitRuleTemplate = () => {
    const isEarring = selectedRuleType === "earrings";
    const isBangle = selectedRuleType === "bangles";
    const isChain = selectedRuleType === "chain_necklace";

    setCurrentRule({
      jewelleryType: selectedRuleType,
      constructionType: selectedRuleConstruction,
      minWristMm: isEarring ? 20 : isBangle ? 160 : isChain ? 380 : 130,
      maxWristMm: isEarring ? 90 : isBangle ? 220 : isChain ? 600 : 230,
      minComponents: isEarring ? 2 : isBangle ? 6 : isChain ? 1 : 12,
      maxComponents: isEarring ? 12 : isBangle ? 30 : isChain ? 10 : 45,
      permittedBeadSizesMm: [4, 6, 8, 10, 12],
      allowedMaterialTypes: isEarring
        ? ["stone", "charm", "findings"]
        : isBangle
        ? ["stone", "spacer"]
        : isChain
        ? ["chain", "pendant", "clasp"]
        : ["bead", "stone", "spacer", "charm"],
      maxCharms: isEarring ? 2 : isBangle ? 4 : 5,
      fitAllowanceMm: isEarring ? 0 : isBangle ? 5 : 10,
      isActive: true,
      version: 1,
    });
  };

  const handleSaveMakingCharge = async () => {
    if (!currentMakingCharge) return;
    try {
      const res = await apiRequest(
        "PUT",
        `/api/v1/studio/admin/making-charges/${selectedPricingType}/${selectedPricingConstruction}`,
        currentMakingCharge
      );
      if (!res.ok) throw new Error("Save charge failed");
      toast({
        title: "Making Charge Saved",
        description: `Craftsmanship fees for ${selectedPricingType} (${selectedPricingConstruction}) updated.`,
      });
      fetchMakingCharge(selectedPricingType, selectedPricingConstruction);
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleInitMakingChargeTemplate = () => {
    const isEarring = selectedPricingType === "earrings";
    const isBangle = selectedPricingType === "bangles";
    const baseFee = isEarring ? 150 : isBangle ? 250 : 200;

    setCurrentMakingCharge({
      jewelleryType: selectedPricingType,
      constructionType: selectedPricingConstruction,
      baseFee,
      serviceCharges: [
        {
          name: "Premium Velvet Gift Box",
          fee: 100,
          isOptional: true,
          description: "Luxurious satin-lined presentation packaging",
        },
        {
          name: "Certificate of Authenticity",
          fee: 50,
          isOptional: true,
          description: "Artisan verification & gemstone card",
        },
      ],
      isActive: true,
    });
  };

  // Filtering materials list
  const filteredMaterials = materials.filter((m) => {
    if (filterType !== "all" && m.materialType !== filterType) return false;
    if (filterCategory !== "all" && !m.allowedJewelleryTypes.includes(filterCategory)) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = m.name.toLowerCase().includes(q);
      const matchCode = m.code.toLowerCase().includes(q);
      const matchSku = m.variants.some((v) => v.sku.toLowerCase().includes(q));
      if (!matchName && !matchCode && !matchSku) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Create Your Own Studio Admin - Renu's Collections" noindex />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-6xl">
        <AdminNav className="mb-6" />

        {/* Studio Admin Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border pb-6 mb-6">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Design Studio</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Create Your Own Management
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Configure shared materials, individual SKU inventory, direct rates, craftsmanship fees, and construction rules.
            </p>
          </div>

          <Button
            onClick={() => {
              fetchJewelleryTypes();
              fetchMaterials();
              if (selectedRuleType && selectedRuleConstruction) {
                fetchRule(selectedRuleType, selectedRuleConstruction);
              }
              if (selectedPricingType && selectedPricingConstruction) {
                fetchMakingCharge(selectedPricingType, selectedPricingConstruction);
              }
            }}
            variant="outline"
            size="sm"
            className="border-[#E6D8D0] dark:border-border text-xs rounded-xl flex items-center gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Studio</span>
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("materials")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === "materials"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Shared Materials & Variants</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white">
              {materials.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("types")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === "types"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Jewellery Types</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-100 dark:bg-muted text-stone-600">
              {jewelleryTypes.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === "rules"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Design Rules (Bracelet)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pricing")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === "pricing"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Making Charges & Fees</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reservations")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === "reservations"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Stock Reservations</span>
          </button>
        </div>

        {/* TAB 1: SHARED MATERIALS & VARIANTS */}
        {activeTab === "materials" && (
          <div className="space-y-6">
            {/* Filter and Action Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-white dark:bg-card p-4 rounded-2xl border border-[#E6D8D0] dark:border-border">
              <div className="flex flex-1 items-center gap-3 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#756861]" />
                  <Input
                    placeholder="Search material by name, code or SKU..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 text-xs rounded-xl border-[#E6D8D0] dark:border-border bg-[#FBF7F3]/50 dark:bg-background"
                  />
                </div>

                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="h-9 px-3 text-xs rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-[#342824] dark:text-foreground"
                >
                  <option value="all">All Component Types</option>
                  <option value="bead">Beads</option>
                  <option value="stone">Stones</option>
                  <option value="spacer">Spacers</option>
                  <option value="charm">Charms</option>
                  <option value="clasp">Clasps</option>
                  <option value="chain">Chains</option>
                  <option value="pendant">Pendants</option>
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="h-9 px-3 text-xs rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-[#342824] dark:text-foreground"
                >
                  <option value="all">All Categories</option>
                  <option value="bracelet">Bracelets Eligible</option>
                  <option value="chain_necklace">Chains Eligible</option>
                  <option value="earrings">Earrings Eligible</option>
                  <option value="bangles">Bangles Eligible</option>
                </select>
              </div>

              <Button
                onClick={() => {
                  setEditingMaterial(null);
                  setMaterialForm({
                    name: "",
                    code: "",
                    description: "",
                    materialType: "bead",
                    imageUrl: "",
                    renderAssetUrl: "",
                    allowedJewelleryTypes: ["bracelet"],
                    isActive: true,
                  });
                  setShowMaterialModal(true);
                }}
                className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-4 flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Shared Material</span>
              </Button>
            </div>

            {/* Materials List */}
            {loadingMaterials ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-xs text-[#756861]">Loading component library...</p>
              </div>
            ) : filteredMaterials.length === 0 ? (
              <Card className="p-12 text-center rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card">
                <Package className="w-10 h-10 text-[#B99A72] opacity-60 mx-auto mb-3" />
                <h3 className="font-playfair text-lg font-semibold">No Materials Found</h3>
                <p className="text-xs text-[#756861] mt-1 max-w-sm mx-auto">
                  No materials match your current filter. Click "Add Shared Material" to begin cataloguing beads, stones, or charms.
                </p>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredMaterials.map((mat) => (
                  <Card
                    key={mat._id}
                    className="rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card overflow-hidden shadow-xs"
                  >
                    <div className="p-5 flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-[#E6D8D0]/60 dark:border-border/60">
                      <div className="flex items-start gap-4">
                        <img
                          src={getAssetUrl(mat.imageUrl)}
                          alt={mat.name}
                          className="w-16 h-16 rounded-xl object-cover border border-[#E6D8D0] dark:border-border shrink-0 bg-stone-50"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholders/placeholder.png";
                          }}
                        />

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                              {mat.name}
                            </h3>
                            <Badge variant="outline" className="font-mono text-[10px] uppercase border-[#B99A72]/30 text-[#B99A72]">
                              {mat.code}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {mat.materialType}
                            </Badge>
                            {!mat.isActive && (
                              <Badge variant="destructive" className="text-[10px]">
                                Inactive
                              </Badge>
                            )}
                          </div>

                          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 max-w-xl">
                            {mat.description || "No description provided."}
                          </p>

                          {/* Category eligibility pills */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[11px] font-medium text-[#756861]">Eligible in:</span>
                            {mat.allowedJewelleryTypes.map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#B66F72]/10 text-[#B66F72] dark:text-primary capitalize"
                              >
                                {t.replace("_", " ")}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingMaterial(mat);
                            setMaterialForm({
                              name: mat.name,
                              code: mat.code,
                              description: mat.description || "",
                              materialType: mat.materialType,
                              imageUrl: mat.imageUrl,
                              renderAssetUrl: mat.renderAssetUrl || "",
                              allowedJewelleryTypes: mat.allowedJewelleryTypes,
                              isActive: mat.isActive,
                            });
                            setShowMaterialModal(true);
                          }}
                          className="h-8 text-xs rounded-xl border-[#E6D8D0] dark:border-border"
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          <span>Edit Material</span>
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedMaterialForVariant(mat);
                            setEditingVariantSku(null);
                            setVariantForm({
                              sku: `${mat.code}-`,
                              color: "",
                              finish: "",
                              sizeLabel: "8mm",
                              diameterMm: 8,
                              holeDiameterMm: 1,
                              sellingUnit: "piece",
                              purchaseCost: 15,
                              sellingRate: 35,
                              stock: 50,
                              lowStockThreshold: 10,
                              isActive: true,
                            });
                            setShowVariantModal(true);
                          }}
                          className="h-8 text-xs rounded-xl bg-[#B66F72] hover:bg-[#95565A] text-white"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />
                          <span>Add SKU Variant</span>
                        </Button>
                      </div>
                    </div>

                    {/* Stocked Variants Table */}
                    <div className="p-4 bg-[#FBF7F3]/40 dark:bg-muted/10">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] uppercase font-semibold text-[#756861] tracking-wider">
                          Stocked Variants ({mat.variants.length})
                        </span>
                        <span className="text-[11px] text-[#756861] italic">
                          Private purchase cost is strictly hidden from customer APIs
                        </span>
                      </div>

                      {mat.variants.length === 0 ? (
                        <p className="text-xs text-[#756861] italic py-2">
                          No variants added yet. Click "Add SKU Variant" to stock specific sizes or colors.
                        </p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-[#E6D8D0]/60 dark:border-border/60 text-[#756861]">
                                <th className="py-2 px-2">SKU</th>
                                <th className="py-2 px-2">Size / Label</th>
                                <th className="py-2 px-2">Color / Finish</th>
                                <th className="py-2 px-2">Unit</th>
                                <th className="py-2 px-2">Stock Level</th>
                                <th className="py-2 px-2 font-mono text-stone-500">Cost (Private)</th>
                                <th className="py-2 px-2 font-semibold text-[#B66F72]">Selling Rate</th>
                                <th className="py-2 px-2 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {mat.variants.map((v) => (
                                <tr
                                  key={v.sku}
                                  className={`border-b border-[#E6D8D0]/30 dark:border-border/30 hover:bg-white/50 dark:hover:bg-muted/20 ${
                                    !v.isActive ? "opacity-50" : ""
                                  }`}
                                >
                                  <td className="py-2.5 px-2 font-mono font-medium">{v.sku}</td>
                                  <td className="py-2.5 px-2">{v.sizeLabel}</td>
                                  <td className="py-2.5 px-2 text-[#756861]">
                                    {[v.color, v.finish].filter(Boolean).join(" • ") || "—"}
                                  </td>
                                  <td className="py-2.5 px-2 capitalize">{v.sellingUnit}</td>
                                  <td className="py-2.5 px-2">
                                    <span
                                      className={`font-medium ${
                                        v.stock <= v.lowStockThreshold
                                          ? "text-amber-600 dark:text-amber-400 font-bold"
                                          : "text-emerald-700 dark:text-emerald-400"
                                      }`}
                                    >
                                      {v.stock} units
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-2 font-mono text-stone-500">₹{v.purchaseCost}</td>
                                  <td className="py-2.5 px-2 font-semibold text-[#B66F72] dark:text-primary">
                                    ₹{v.sellingRate}
                                  </td>
                                  <td className="py-2.5 px-2 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setSelectedMaterialForVariant(mat);
                                          setEditingVariantSku(v.sku);
                                          setVariantForm({
                                            sku: v.sku,
                                            color: v.color || "",
                                            finish: v.finish || "",
                                            sizeLabel: v.sizeLabel,
                                            diameterMm: v.dimensionsMm?.diameterMm || 8,
                                            holeDiameterMm: v.dimensionsMm?.holeDiameterMm || 1,
                                            sellingUnit: v.sellingUnit,
                                            purchaseCost: v.purchaseCost,
                                            sellingRate: v.sellingRate,
                                            stock: v.stock,
                                            lowStockThreshold: v.lowStockThreshold,
                                            isActive: v.isActive,
                                          });
                                          setShowVariantModal(true);
                                        }}
                                        className="h-7 px-2 text-xs"
                                        title="Edit variant stock & rates"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </Button>

                                      {v.isActive ? (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => setDisablingVariant({ materialId: mat._id, sku: v.sku })}
                                          className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                          title="Disable variant"
                                        >
                                          <EyeOff className="w-3 h-3" />
                                        </Button>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground italic px-1">Disabled</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: JEWELLERY TYPES & READINESS */}
        {activeTab === "types" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {jewelleryTypes.map((type) => {
                const readiness = readinessList.find((r) => r.slug === type.slug);
                return (
                  <Card key={type.slug} className="rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card p-6 shadow-xs flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
                              {type.displayName}
                            </h3>
                            <Badge
                              variant="outline"
                              className={
                                type.designerStatus === "available"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 text-[10px]"
                                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800 text-[10px]"
                              }
                            >
                              {type.designerStatus === "available" ? "Active" : "Coming Soon"}
                            </Badge>
                          </div>
                          <span className="text-xs font-mono text-[#756861]">slug: {type.slug}</span>
                        </div>

                        <select
                          value={type.designerStatus}
                          onChange={(e) => handleUpdateTypeStatus(type.slug, { designerStatus: e.target.value as any })}
                          className="text-xs rounded-lg border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background h-8 px-2"
                        >
                          <option value="available">Available</option>
                          <option value="coming_soon">Coming Soon</option>
                          <option value="maintenance">Maintenance</option>
                        </select>
                      </div>

                      <p className="text-xs text-[#756861] dark:text-muted-foreground mb-4 leading-relaxed">
                        {type.description}
                      </p>

                      {/* Live Readiness Breakdown */}
                      <div className="p-3 rounded-xl bg-[#FBF7F3] dark:bg-background/60 border border-[#E6D8D0]/70 dark:border-border/70 space-y-2 mb-4 text-xs">
                        <span className="text-[10px] uppercase font-semibold text-[#B99A72] tracking-wider block">Live Studio Readiness</span>
                        <div className="grid grid-cols-3 gap-2 text-center pt-1">
                          <div className="bg-white dark:bg-card p-2 rounded-lg border border-[#E6D8D0]/50 dark:border-border/50">
                            <span className="text-[10px] text-[#756861] block">Materials</span>
                            <span className="font-bold text-sm text-[#342824] dark:text-foreground">
                              {readiness?.eligibleMaterialCount ?? 0}
                            </span>
                            <span className="text-[9px] text-[#756861] block">Components</span>
                          </div>
                          <div className="bg-white dark:bg-card p-2 rounded-lg border border-[#E6D8D0]/50 dark:border-border/50">
                            <span className="text-[10px] text-[#756861] block">Design Rules</span>
                            <span className={`font-semibold text-xs mt-1 block ${readiness?.hasDesignRule ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {readiness?.hasDesignRule ? "Configured ✓" : "Missing ✗"}
                            </span>
                          </div>
                          <div className="bg-white dark:bg-card p-2 rounded-lg border border-[#E6D8D0]/50 dark:border-border/50">
                            <span className="text-[10px] text-[#756861] block">Making Fee</span>
                            <span className={`font-semibold text-xs mt-1 block ${readiness?.hasMakingCharge ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                              {readiness?.hasMakingCharge ? "Configured ✓" : "Missing ✗"}
                            </span>
                          </div>
                        </div>

                        {/* Gaps Alert */}
                        {readiness?.gapAnalysis && !readiness.isFullyReady && (
                          <div className="mt-2 pt-2 border-t border-[#E6D8D0]/50 dark:border-border/50 text-[11px] text-amber-800 dark:text-amber-300">
                            <div className="flex items-center gap-1.5 font-semibold text-[11px] mb-1">
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Catalogue Readiness Gap:</span>
                            </div>
                            <p className="text-[10px] text-amber-700 dark:text-amber-400 pl-1 leading-relaxed">
                              {readiness.gapAnalysis.materialsDetail}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[#756861]">Supported Constructions:</span>
                          <span className="font-mono">{type.supportedConstructionTypes.join(", ") || "None"}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#756861]">Published in Customer Studio:</span>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={type.isEnabled}
                              onChange={(e) => handleUpdateTypeStatus(type.slug, { isEnabled: e.target.checked })}
                              className="w-4 h-4 rounded accent-[#B66F72]"
                            />
                            <span className="font-medium">{type.isEnabled ? "Enabled" : "Disabled"}</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Quick navigation to configure rules & pricing */}
                    <div className="pt-4 mt-4 border-t border-[#E6D8D0]/60 dark:border-border/60 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedRuleType(type.slug);
                          setSelectedRuleConstruction(type.supportedConstructionTypes[0] || "default");
                          setActiveTab("rules");
                        }}
                        className="flex-1 text-xs h-8 border-[#E6D8D0] dark:border-border"
                      >
                        <Sliders className="w-3 h-3 mr-1.5" />
                        Configure Rules
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedPricingType(type.slug);
                          setSelectedPricingConstruction(type.supportedConstructionTypes[0] || "default");
                          setActiveTab("pricing");
                        }}
                        className="flex-1 text-xs h-8 border-[#E6D8D0] dark:border-border"
                      >
                        <DollarSign className="w-3 h-3 mr-1.5" />
                        Configure Fees
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: DESIGN RULES (MULTI-TYPE) */}
        {activeTab === "rules" && (
          <div className="max-w-3xl bg-white dark:bg-card p-8 rounded-2xl border border-[#E6D8D0] dark:border-border shadow-xs space-y-6">
            <div>
              <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Calibration Engine</span>
              <h3 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground mt-0.5">
                Design Rules & Physics Calibration
              </h3>
              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                Configure physical limits, component count limits, and sizing boundaries per jewelry type and construction method.
              </p>
            </div>

            {/* Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#FBF7F3] dark:bg-background border border-[#E6D8D0] dark:border-border">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Jewellery Category</Label>
                <select
                  value={selectedRuleType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setSelectedRuleType(newType);
                    const jt = jewelleryTypes.find((t) => t.slug === newType);
                    if (jt && jt.supportedConstructionTypes.length > 0) {
                      setSelectedRuleConstruction(jt.supportedConstructionTypes[0]);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
                >
                  {jewelleryTypes.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Construction Method</Label>
                <select
                  value={selectedRuleConstruction}
                  onChange={(e) => setSelectedRuleConstruction(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
                >
                  {(jewelleryTypes.find((t) => t.slug === selectedRuleType)?.supportedConstructionTypes || [selectedRuleConstruction]).map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ").toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingRule ? (
              <div className="py-12 text-center text-xs text-[#756861]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#B66F72]" />
                Loading calibration rules...
              </div>
            ) : !currentRule ? (
              <div className="py-10 text-center border-2 border-dashed border-[#E6D8D0] rounded-xl p-6">
                <AlertCircle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <h4 className="font-playfair text-base font-semibold">No Rules Configured</h4>
                <p className="text-xs text-[#756861] max-w-md mx-auto mt-1 mb-4">
                  No calibration rule exists for <strong>{selectedRuleType}</strong> with construction <strong>{selectedRuleConstruction}</strong>.
                </p>
                <Button
                  onClick={handleInitRuleTemplate}
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-5"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Initialize Rule Template
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      {selectedRuleType === "earrings"
                        ? "Min Earring Drop Length (mm)"
                        : selectedRuleType === "bangles"
                        ? "Min Bangle Circumference (mm)"
                        : selectedRuleType === "chain_necklace"
                        ? "Min Chain Length (mm)"
                        : "Min Wrist Circumference (mm)"}
                    </Label>
                    <Input
                      type="number"
                      value={currentRule.minWristMm}
                      onChange={(e) => setCurrentRule({ ...currentRule, minWristMm: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                    <span className="text-[10px] text-muted-foreground">Minimum wearable dimension</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      {selectedRuleType === "earrings"
                        ? "Max Earring Drop Length (mm)"
                        : selectedRuleType === "bangles"
                        ? "Max Bangle Circumference (mm)"
                        : selectedRuleType === "chain_necklace"
                        ? "Max Chain Length (mm)"
                        : "Max Wrist Circumference (mm)"}
                    </Label>
                    <Input
                      type="number"
                      value={currentRule.maxWristMm}
                      onChange={(e) => setCurrentRule({ ...currentRule, maxWristMm: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                    <span className="text-[10px] text-muted-foreground">Maximum wearable dimension</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Min Component Count</Label>
                    <Input
                      type="number"
                      value={currentRule.minComponents}
                      onChange={(e) => setCurrentRule({ ...currentRule, minComponents: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                    <span className="text-[10px] text-muted-foreground">Minimum items to assemble</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Max Component Count</Label>
                    <Input
                      type="number"
                      value={currentRule.maxComponents}
                      onChange={(e) => setCurrentRule({ ...currentRule, maxComponents: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                    <span className="text-[10px] text-muted-foreground">Physical canvas density limit</span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Max Charms / Accents Allowed</Label>
                    <Input
                      type="number"
                      value={currentRule.maxCharms}
                      onChange={(e) => setCurrentRule({ ...currentRule, maxCharms: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Fit / Slack Allowance (mm)</Label>
                    <Input
                      type="number"
                      value={currentRule.fitAllowanceMm}
                      onChange={(e) => setCurrentRule({ ...currentRule, fitAllowanceMm: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                    <span className="text-[10px] text-muted-foreground">Slack allowance for closure & drape</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E6D8D0]/60 dark:border-border/60 flex items-center justify-between">
                  <span className="text-xs text-[#756861]">Rule Version: v{currentRule.version}</span>
                  <Button
                    onClick={handleSaveRule}
                    className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-6"
                  >
                    Save Construction Rules
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MAKING CHARGES & SERVICE FEES (MULTI-TYPE) */}
        {activeTab === "pricing" && (
          <div className="max-w-3xl bg-white dark:bg-card p-8 rounded-2xl border border-[#E6D8D0] dark:border-border shadow-xs space-y-6">
            <div>
              <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Authoritative Pricing</span>
              <h3 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground mt-0.5">
                Craftsmanship & Assembly Fees
              </h3>
              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                Configure base artisan hand-assembly charges and optional finishing services. Total price = Materials + Making Fees.
              </p>
            </div>

            {/* Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-[#FBF7F3] dark:bg-background border border-[#E6D8D0] dark:border-border">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Jewellery Category</Label>
                <select
                  value={selectedPricingType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setSelectedPricingType(newType);
                    const jt = jewelleryTypes.find((t) => t.slug === newType);
                    if (jt && jt.supportedConstructionTypes.length > 0) {
                      setSelectedPricingConstruction(jt.supportedConstructionTypes[0]);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
                >
                  {jewelleryTypes.map((t) => (
                    <option key={t.slug} value={t.slug}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Construction Method</Label>
                <select
                  value={selectedPricingConstruction}
                  onChange={(e) => setSelectedPricingConstruction(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
                >
                  {(jewelleryTypes.find((t) => t.slug === selectedPricingType)?.supportedConstructionTypes || [selectedPricingConstruction]).map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, " ").toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadingCharge ? (
              <div className="py-12 text-center text-xs text-[#756861]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#B66F72]" />
                Loading craftsmanship fees...
              </div>
            ) : !currentMakingCharge ? (
              <div className="py-10 text-center border-2 border-dashed border-[#E6D8D0] rounded-xl p-6">
                <DollarSign className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <h4 className="font-playfair text-base font-semibold">No Making Fees Configured</h4>
                <p className="text-xs text-[#756861] max-w-md mx-auto mt-1 mb-4">
                  No craftsmanship charges set for <strong>{selectedPricingType}</strong> ({selectedPricingConstruction}).
                </p>
                <Button
                  onClick={handleInitMakingChargeTemplate}
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-5"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Initialize Craftsmanship Pricing
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Base Making Charge (INR ₹)</Label>
                  <Input
                    type="number"
                    value={currentMakingCharge.baseFee}
                    onChange={(e) => setCurrentMakingCharge({ ...currentMakingCharge, baseFee: Number(e.target.value) })}
                    className="text-xs rounded-xl"
                  />
                  <span className="text-[10px] text-muted-foreground">Standard assembly, artisan hand-stringing, setting & finish fee</span>
                </div>

                {/* Service Charges */}
                <div className="space-y-3 pt-3 border-t border-[#E6D8D0]/60 dark:border-border/60">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Optional Finishing / Presentation Services</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = [
                          ...currentMakingCharge.serviceCharges,
                          { name: "Custom Gift Note", fee: 25, isOptional: true, description: "Personalized calligraphed note card" },
                        ];
                        setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                      }}
                      className="text-xs text-[#B66F72] h-7 px-2"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Service
                    </Button>
                  </div>

                  {currentMakingCharge.serviceCharges.map((sc, scIdx) => (
                    <div key={scIdx} className="flex items-center gap-3 p-3 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3] dark:bg-background/60">
                      <div className="flex-1">
                        <p className="font-semibold text-xs text-[#342824] dark:text-foreground">{sc.name}</p>
                        <p className="text-[11px] text-[#756861] dark:text-muted-foreground">{sc.description}</p>
                      </div>
                      <div className="w-24">
                        <Input
                          type="number"
                          value={sc.fee}
                          onChange={(e) => {
                            const updated = [...currentMakingCharge.serviceCharges];
                            updated[scIdx].fee = Number(e.target.value);
                            setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                          }}
                          className="text-xs h-8 rounded-lg"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const updated = currentMakingCharge.serviceCharges.filter((_, i) => i !== scIdx);
                          setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                        }}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="pt-4 border-t border-[#E6D8D0]/60 dark:border-border/60 flex justify-end">
                  <Button
                    onClick={handleSaveMakingCharge}
                    className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-6"
                  >
                    Save Craftsmanship Charges
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: STOCK RESERVATIONS & LIFECYCLE (MILESTONE 6) */}
        {activeTab === "reservations" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-card p-4 rounded-2xl border border-[#E6D8D0] dark:border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#756861]">Filter Status:</span>
                <select
                  value={filterReservationStatus}
                  onChange={(e) => setFilterReservationStatus(e.target.value)}
                  className="text-xs rounded-lg border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background h-8 px-2"
                >
                  <option value="all">All Statuses</option>
                  <option value="reserved">Reserved (Pending Payment)</option>
                  <option value="committed">Committed (Paid / COD)</option>
                  <option value="released">Released (Expired / Failed)</option>
                  <option value="restocked">Restocked (Cancelled)</option>
                  <option value="reconciliation_required">Reconciliation Required</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCleanupExpired}
                  variant="outline"
                  size="sm"
                  className="border-[#E6D8D0] text-xs h-8 rounded-xl"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Clean Expired Reservations
                </Button>
                <Button
                  onClick={fetchReservations}
                  size="sm"
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs h-8 rounded-xl"
                >
                  Refresh
                </Button>
              </div>
            </div>

            {loadingReservations ? (
              <div className="py-12 text-center text-xs text-[#756861]">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#B66F72]" />
                Loading inventory reservations...
              </div>
            ) : reservations.length === 0 ? (
              <div className="py-12 text-center border-2 border-dashed border-[#E6D8D0] rounded-2xl p-8 bg-white dark:bg-card">
                <Package className="w-8 h-8 text-[#B99A72] mx-auto mb-2 opacity-50" />
                <h4 className="font-playfair text-base font-semibold">No Reservations Found</h4>
                <p className="text-xs text-[#756861] mt-1">
                  Custom jewelry component reservations will appear here as customers place orders.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reservations.map((res: any) => (
                  <Card key={res._id} className="p-5 rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-[#E6D8D0]/60">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-playfair font-semibold text-base">
                            Order #{res.orderNumber}
                          </span>
                          <Badge
                            variant="outline"
                            className={
                              res.status === "committed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                                : res.status === "reserved"
                                ? "bg-amber-50 text-amber-700 border-amber-200 text-[10px]"
                                : res.status === "reconciliation_required"
                                ? "bg-red-50 text-red-700 border-red-200 text-[10px]"
                                : res.status === "restocked"
                                ? "bg-blue-50 text-blue-700 border-blue-200 text-[10px]"
                                : "bg-stone-50 text-stone-600 border-stone-200 text-[10px]"
                            }
                          >
                            {res.status.replace("_", " ").toUpperCase()}
                          </Badge>
                        </div>
                        <span className="text-[11px] text-[#756861]">
                          Reserved At: {new Date(res.reservedAt).toLocaleString("en-IN")}
                          {res.status === "reserved" && ` · Expires: ${new Date(res.expiresAt).toLocaleTimeString("en-IN")}`}
                        </span>
                      </div>

                      {res.status === "reconciliation_required" && (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReconcile(res._id, "force_commit")}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 rounded-lg"
                          >
                            Force Commit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReconcile(res._id, "refund_and_release")}
                            className="text-red-600 border-red-200 hover:bg-red-50 text-xs h-7 px-3 rounded-lg"
                          >
                            Refund & Release
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="pt-3">
                      <span className="text-[11px] font-semibold text-[#756861] uppercase tracking-wider block mb-2">
                        Reserved Components:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {res.items?.map((item: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-xl border border-[#E6D8D0]/60 bg-[#FBF7F3] dark:bg-background/60 text-xs">
                            <p className="font-semibold text-[#342824] dark:text-foreground truncate">{item.materialName}</p>
                            <div className="flex items-center justify-between text-[11px] text-[#756861] mt-0.5">
                              <span className="font-mono">{item.sku}</span>
                              <span className="font-bold text-[#B66F72]">Qty: {item.quantity}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {res.reconciliationNotes && (
                        <div className="mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                          <strong>Admin Note:</strong> {res.reconciliationNotes}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MODAL: ADD / EDIT MATERIAL */}
        {showMaterialModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="max-w-lg w-full bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-[#E6D8D0]">
                <h3 className="font-playfair text-xl font-semibold">
                  {editingMaterial ? "Edit Shared Material" : "Add Shared Material"}
                </h3>
                <Button size="sm" variant="ghost" onClick={() => setShowMaterialModal(false)} className="h-7 w-7 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4 pt-4 text-xs">
                <div className="space-y-1">
                  <Label>Material Name</Label>
                  <Input
                    placeholder="e.g. Natural Rose Quartz Bead"
                    value={materialForm.name}
                    onChange={(e) => setMaterialForm({ ...materialForm, name: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Component Code</Label>
                    <Input
                      placeholder="e.g. MAT-ROSE-01"
                      value={materialForm.code}
                      onChange={(e) => setMaterialForm({ ...materialForm, code: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Material Type</Label>
                    <select
                      value={materialForm.materialType}
                      onChange={(e) => setMaterialForm({ ...materialForm, materialType: e.target.value })}
                      className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs"
                    >
                      <option value="bead">Bead</option>
                      <option value="stone">Stone</option>
                      <option value="spacer">Spacer</option>
                      <option value="charm">Charm</option>
                      <option value="clasp">Clasp</option>
                      <option value="chain">Chain</option>
                      <option value="pendant">Pendant</option>
                      <option value="findings">Findings</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Main Image URL</Label>
                  <Input
                    placeholder="e.g. /assets/materials/rose-quartz.jpg or https://..."
                    value={materialForm.imageUrl}
                    onChange={(e) => setMaterialForm({ ...materialForm, imageUrl: e.target.value })}
                  />
                  {materialForm.imageUrl && (
                    <img
                      src={getAssetUrl(materialForm.imageUrl)}
                      alt="Preview"
                      className="w-16 h-16 rounded-lg object-cover border mt-1"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/placeholders/placeholder.png";
                      }}
                    />
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Transparent Render Asset URL (Optional for 2D Canvas)</Label>
                  <Input
                    placeholder="e.g. /assets/materials/rose-quartz-cutout.png"
                    value={materialForm.renderAssetUrl}
                    onChange={(e) => setMaterialForm({ ...materialForm, renderAssetUrl: e.target.value })}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Description</Label>
                  <textarea
                    rows={2}
                    value={materialForm.description}
                    onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })}
                    className="w-full p-2 rounded-lg border border-[#E6D8D0] text-xs"
                    placeholder="Material origin, natural healing attributes, or aesthetic finish..."
                  />
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label>Eligible Jewellery Types</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { slug: "bracelet", label: "Bracelets" },
                      { slug: "chain_necklace", label: "Chains & Necklaces" },
                      { slug: "earrings", label: "Earrings" },
                      { slug: "bangles", label: "Bangles" },
                    ].map((t) => (
                      <label key={t.slug} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={materialForm.allowedJewelleryTypes.includes(t.slug)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMaterialForm({
                                ...materialForm,
                                allowedJewelleryTypes: [...materialForm.allowedJewelleryTypes, t.slug],
                              });
                            } else {
                              setMaterialForm({
                                ...materialForm,
                                allowedJewelleryTypes: materialForm.allowedJewelleryTypes.filter((x) => x !== t.slug),
                              });
                            }
                          }}
                          className="accent-[#B66F72]"
                        />
                        <span>{t.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-6 mt-4 border-t border-[#E6D8D0]">
                <Button variant="outline" size="sm" onClick={() => setShowMaterialModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveMaterial} className="bg-[#B66F72] hover:bg-[#95565A] text-white">
                  Save Material
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* MODAL: ADD / EDIT VARIANT */}
        {showVariantModal && selectedMaterialForVariant && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="max-w-lg w-full bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-[#E6D8D0]">
                <div>
                  <h3 className="font-playfair text-xl font-semibold">
                    {editingVariantSku ? "Edit SKU Variant" : "Add SKU Variant"}
                  </h3>
                  <p className="text-xs text-[#756861] mt-0.5">For {selectedMaterialForVariant.name}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowVariantModal(false)} className="h-7 w-7 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4 pt-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Variant SKU</Label>
                    <Input
                      placeholder="e.g. RQ-8MM-GLOSS"
                      value={variantForm.sku}
                      disabled={!!editingVariantSku}
                      onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Size Label</Label>
                    <Input
                      placeholder="e.g. 8mm or Medium"
                      value={variantForm.sizeLabel}
                      onChange={(e) => setVariantForm({ ...variantForm, sizeLabel: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Color / Tone</Label>
                    <Input
                      placeholder="e.g. Soft Rose"
                      value={variantForm.color}
                      onChange={(e) => setVariantForm({ ...variantForm, color: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Finish</Label>
                    <Input
                      placeholder="e.g. Faceted Gloss"
                      value={variantForm.finish}
                      onChange={(e) => setVariantForm({ ...variantForm, finish: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Outer Diameter (mm)</Label>
                    <Input
                      type="number"
                      value={variantForm.diameterMm}
                      onChange={(e) => setVariantForm({ ...variantForm, diameterMm: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Drill Hole (mm)</Label>
                    <Input
                      type="number"
                      value={variantForm.holeDiameterMm}
                      onChange={(e) => setVariantForm({ ...variantForm, holeDiameterMm: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-amber-50/50 border border-amber-200/60">
                  <div className="space-y-1">
                    <Label className="text-stone-700 font-semibold">Cost Price (₹)</Label>
                    <Input
                      type="number"
                      value={variantForm.purchaseCost}
                      onChange={(e) => setVariantForm({ ...variantForm, purchaseCost: Number(e.target.value) })}
                    />
                    <span className="text-[10px] text-stone-500">Private internal</span>
                  </div>

                  <div className="space-y-1 col-span-2">
                    <Label className="text-[#B66F72] font-semibold">Customer Selling Rate (₹)</Label>
                    <Input
                      type="number"
                      value={variantForm.sellingRate}
                      onChange={(e) => setVariantForm({ ...variantForm, sellingRate: Number(e.target.value) })}
                    />
                    <span className="text-[10px] text-[#B66F72]">Authoritative direct rate</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Stock Quantity</Label>
                    <Input
                      type="number"
                      value={variantForm.stock}
                      onChange={(e) => setVariantForm({ ...variantForm, stock: Number(e.target.value) })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Low Stock Alert Threshold</Label>
                    <Input
                      type="number"
                      value={variantForm.lowStockThreshold}
                      onChange={(e) => setVariantForm({ ...variantForm, lowStockThreshold: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-6 mt-4 border-t border-[#E6D8D0]">
                <Button variant="outline" size="sm" onClick={() => setShowVariantModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveVariant} className="bg-[#B66F72] hover:bg-[#95565A] text-white">
                  Save Variant
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* DIALOG: CONFIRM DISABLE VARIANT */}
        <AlertDialog open={!!disablingVariant} onOpenChange={(open) => !open && setDisablingVariant(null)}>
          <AlertDialogContent className="rounded-2xl border border-[#E6D8D0] bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg">Disable Component Variant?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861]">
                Disabling SKU "{disablingVariant?.sku}" prevents it from being selected in new custom designs. It remains preserved for existing design quote history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDisableVariant}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-xl"
              >
                Disable Component
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>

      <Footer />
    </div>
  );
}

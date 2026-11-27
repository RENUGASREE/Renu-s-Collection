import { useState, useEffect } from "react";
import ImageUploadField from "@/components/ImageUploadField";
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
import {
  fetchJewelleryTypesReadiness,
  type JewelleryTypeReadiness,
  createJewelleryType,
  updateJewelleryType,
  deleteJewelleryType,
  archiveJewelleryType,
  restoreJewelleryType,
  deleteStudioMaterial,
  fetchAdminDesignTemplates,
  createAdminDesignTemplate,
  updateAdminDesignTemplate,
  deleteAdminDesignTemplate,
  type DesignTemplate,
  type TemplateBead,
} from "@/lib/studio/studioApi";
import { getBeadAppearance } from "@/lib/studio/appearance";
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
  AlertTriangle,
  Eye,
  EyeOff,
  Archive,
  ArchiveRestore,
  Info,
  FolderTree,
  Wrench,
  Link as LinkIcon,
  Boxes,
} from "lucide-react";
import { StudioCategoriesSection } from "@/components/studio/admin/StudioCategoriesSection";
import { StudioConstructionMethodsSection } from "@/components/studio/admin/StudioConstructionMethodsSection";
import { StudioDesignRulesSection } from "@/components/studio/admin/StudioDesignRulesSection";
import { StudioMaterialLinksSection } from "@/components/studio/admin/StudioMaterialLinksSection";
import { StudioInventorySection } from "@/components/studio/admin/StudioInventorySection";
import { ManualAssemblyDesigner } from "@/components/studio/ManualAssemblyDesigner";
import {
  fetchStudioCategories,
  fetchConstructionMethods,
} from "@/lib/studio/independentStudioApi";
import type {
  IStudioCategory,
  IStudioConstructionMethod,
} from "@/types/studio.types";
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

export interface ComponentTypeItem {
  _id?: string;
  typeId: string;
  displayName: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  materialCount?: number;
}

interface JewelleryType {
  slug: string;
  displayName: string;
  description?: string;
  imageUrl?: string;
  displayOrder: number;
  isEnabled: boolean;
  isPublished: boolean;
  isArchived?: boolean;
  archivedAt?: string;
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
  reservedStock?: number;
  committedStock?: number;
  physicalStock?: number;
}

interface StudioMaterial {
  _id: string;
  id?: string;
  name: string;
  code: string;
  description?: string;
  materialType: string;
  imageUrl: string;
  renderAssetUrl?: string;
  additionalImages: string[];
  allowedJewelleryTypes: string[];
  visibilityScopes?: string[];
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
  const [activeTab, setActiveTab] = useState<
    "categories" | "methods" | "rules" | "designer" | "materials" | "inventory" | "links" | "types" | "pricing" | "reservations" | "templates"
  >("categories");

  // State: Independent Studio Hierarchy & Methods
  const [studioCategories, setStudioCategories] = useState<IStudioCategory[]>([]);
  const [studioMethods, setStudioMethods] = useState<IStudioConstructionMethod[]>([]);

  // State: Design Templates
  const [templates, setTemplates] = useState<DesignTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateStatusFilter, setTemplateStatusFilter] = useState<"published" | "draft" | "all">("published");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DesignTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    slug: "",
    description: "",
    thumbnailUrl: "",
    jewelleryType: "bracelet" as "bracelet",
    constructionType: "elastic_bead" as "elastic_bead",
    wristMm: 160,
    sortOrder: 0,
    isPublished: false,
    beadSequence: [] as TemplateBead[],
  });
  const [deletingTemplateSlug, setDeletingTemplateSlug] = useState<string | null>(null);
  const [selectedBeadSkuForTemplate, setSelectedBeadSkuForTemplate] = useState<string>("");
  const [beadAddCount, setBeadAddCount] = useState<number>(1);

  // State: Jewellery Types
  const [jewelleryTypes, setJewelleryTypes] = useState<JewelleryType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [showArchivedTypes, setShowArchivedTypes] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<JewelleryType | null>(null);
  const [typeForm, setTypeForm] = useState({
    slug: "",
    displayName: "",
    description: "",
    imageUrl: "",
    displayOrder: 0,
    isPublished: false,
    designerStatus: "coming_soon" as "available" | "coming_soon" | "maintenance",
    supportedConstructionTypes: "elastic_bead",
  });
  const [deletingTypeSlug, setDeletingTypeSlug] = useState<string | null>(null);
  const [categoryConflictMsg, setCategoryConflictMsg] = useState<string | null>(null);

  // Material Deletion State
  const [deletingMaterial, setDeletingMaterial] = useState<StudioMaterial | null>(null);
  const [materialConflictMsg, setMaterialConflictMsg] = useState<string | null>(null);

  // State: Materials & Variants
  const [materials, setMaterials] = useState<StudioMaterial[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [materialStatusFilter, setMaterialStatusFilter] = useState<"active" | "inactive" | "all">("active");

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
    visibilityScopes: ["studio"],
    isActive: true,
    selectionPolicy: "customer_selects_variant" as "customer_selects_variant" | "seller_random_variant",
    assortmentNotes: "",
    eligibleAssortmentSkus: [] as string[],
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
    imageUrl: "",
    renderAssetUrl: "",
  });

  // Component Types Management State
  const [componentTypes, setComponentTypes] = useState<ComponentTypeItem[]>([]);
  const [loadingComponentTypes, setLoadingComponentTypes] = useState(false);
  const [showComponentTypeModal, setShowComponentTypeModal] = useState(false);
  const [editingComponentTypeId, setEditingComponentTypeId] = useState<string | null>(null);
  const [editingDisplayName, setEditingDisplayName] = useState<string>("");
  const [newTypeForm, setNewTypeForm] = useState({
    typeId: "",
    displayName: "",
    description: "",
    displayOrder: 0,
    isActive: true,
  });
  const [typeBlockedDialog, setTypeBlockedDialog] = useState<{
    typeId: string;
    displayName: string;
    message: string;
    materialCount: number;
  } | null>(null);

  // Confirm disable / delete variant dialogs
  const [disablingVariant, setDisablingVariant] = useState<{ materialId: string; sku: string } | null>(null);
  const [deletingVariant, setDeletingVariant] = useState<{
    materialId: string;
    materialName: string;
    sku: string;
    variantId?: string;
    isActive?: boolean;
  } | null>(null);
  const [variantBlockedDialog, setVariantBlockedDialog] = useState<{
    materialId: string;
    materialName: string;
    sku: string;
    variantId?: string;
    message: string;
  } | null>(null);
  const [syncVariantSkus, setSyncVariantSkus] = useState(true);

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
    fetchJewelleryTypes(showArchivedTypes);
    fetchMaterials(true);
    fetchComponentTypes();
    fetchStudioCategories(false).then(setStudioCategories).catch(() => {});
    fetchConstructionMethods(false).then(setStudioMethods).catch(() => {});
    fetchTemplates();
    fetchReservations();
  }, [showArchivedTypes]);

  useEffect(() => {
    if (activeTab === "materials") {
      fetchMaterials(materials.length === 0);
      fetchComponentTypes();
    } else if (activeTab === "types") {
      fetchJewelleryTypes(showArchivedTypes);
    } else if (activeTab === "reservations") {
      fetchReservations();
    } else if (activeTab === "templates") {
      fetchTemplates();
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

  const fetchComponentTypes = async () => {
    try {
      setLoadingComponentTypes(true);
      const res = await apiRequest("GET", "/api/v1/studio/admin/component-types");
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setComponentTypes(json.data);
      }
    } catch (err: any) {
      console.error("Failed to load component types:", err);
    } finally {
      setLoadingComponentTypes(false);
    }
  };

  const fetchJewelleryTypes = async (includeArchived = showArchivedTypes) => {
    try {
      setLoadingTypes(true);
      const url = includeArchived
        ? "/api/v1/studio/admin/jewellery-types?includeArchived=true"
        : "/api/v1/studio/admin/jewellery-types";
      const [res, readiness] = await Promise.all([
        apiRequest("GET", url),
        fetchJewelleryTypesReadiness(true),
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

  const fetchMaterials = async (showSpinner = false) => {
    const savedScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    try {
      if (showSpinner) setLoadingMaterials(true);
      const res = await apiRequest("GET", "/api/v1/studio/admin/materials?limit=100");
      const json = await res.json();
      if (json.success) {
        setMaterials(json.data);
        if (savedScrollY > 0) {
          requestAnimationFrame(() => {
            window.scrollTo({ top: savedScrollY, behavior: "instant" });
          });
        }
      }
    } catch (err: any) {
      toast({ title: "Failed to load materials", description: err.message, variant: "destructive" });
    } finally {
      if (showSpinner) setLoadingMaterials(false);
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

  const fetchTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await fetchAdminDesignTemplates();
      setTemplates(data);
    } catch (err: any) {
      toast({
        title: "Error fetching templates",
        description: err.message || "Failed to load design templates",
        variant: "destructive",
      });
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleOpenCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: "",
      slug: "",
      description: "",
      thumbnailUrl: "",
      jewelleryType: "bracelet" as const,
      constructionType: "elastic_bead" as const,
      wristMm: 160,
      sortOrder: (templates.length + 1) * 10,
      isPublished: false,
      beadSequence: [],
    });
    const firstVariant = materials.flatMap((m) => m.variants).find((v) => v.isActive);
    if (firstVariant) {
      setSelectedBeadSkuForTemplate(firstVariant.sku);
    }
    setBeadAddCount(1);
    setShowTemplateModal(true);
  };

  const handleOpenEditTemplate = (tpl: DesignTemplate) => {
    setEditingTemplate(tpl);
    setTemplateForm({
      name: tpl.name,
      slug: tpl.slug,
      description: tpl.description || "",
      thumbnailUrl: tpl.thumbnailUrl || "",
      jewelleryType: (tpl.jewelleryType || "bracelet") as "bracelet",
      constructionType: (tpl.constructionType || "elastic_bead") as "elastic_bead",
      wristMm: tpl.wristMm || 160,
      sortOrder: tpl.sortOrder || 0,
      isPublished: Boolean(tpl.isPublished),
      beadSequence: [...(tpl.beadSequence || [])],
    });
    const firstVariant = materials.flatMap((m) => m.variants).find((v) => v.isActive);
    if (firstVariant) {
      setSelectedBeadSkuForTemplate(firstVariant.sku);
    }
    setBeadAddCount(1);
    setShowTemplateModal(true);
  };

  const handleAddBeadsToTemplate = () => {
    if (!selectedBeadSkuForTemplate) return;
    const material = materials.find((m) =>
      m.variants.some((v) => v.sku === selectedBeadSkuForTemplate)
    );
    const variant = material?.variants.find((v) => v.sku === selectedBeadSkuForTemplate);
    if (!material || !variant) return;

    const newBead: TemplateBead = {
      variantSku: variant.sku,
      displayName: material.name,
      imageUrl: material.imageUrl || material.renderAssetUrl || "",
    };

    const count = Math.max(1, Math.min(50, beadAddCount));
    const appended = Array(count).fill(newBead);
    setTemplateForm((prev) => ({
      ...prev,
      beadSequence: [...prev.beadSequence, ...appended],
    }));
  };

  const handleRemoveBeadAt = (index: number) => {
    setTemplateForm((prev) => ({
      ...prev,
      beadSequence: prev.beadSequence.filter((_, i) => i !== index),
    }));
  };

  const handleClearBeadSequence = () => {
    setTemplateForm((prev) => ({
      ...prev,
      beadSequence: [],
    }));
  };

  const handleTogglePublishTemplate = async (tpl: DesignTemplate) => {
    try {
      const willPublish = !tpl.isPublished;
      const hasTestInventory = tpl.beadSequence.some((b) => b.variantSku.startsWith("TEST-"));

      await updateAdminDesignTemplate(tpl.slug, { isPublished: willPublish });
      toast({
        title: willPublish
          ? hasTestInventory
            ? "Test Template Published"
            : "Template Published"
          : "Template Unpublished",
        description: willPublish
          ? hasTestInventory
            ? `"${tpl.name}" is now published using temporary TEST- materials. It is visible in Create Your Own Studio for testing.`
            : `"${tpl.name}" is now publicly available in the Studio.`
          : `"${tpl.name}" is now hidden as a Draft.`,
      });
      fetchTemplates();
    } catch (err: any) {
      toast({
        title: "Action Failed",
        description: err.message || "Failed to update publication status",
        variant: "destructive",
      });
    }
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.name.trim()) {
      toast({ title: "Validation Error", description: "Template name is required", variant: "destructive" });
      return;
    }
    const cleanSlug = (
      templateForm.slug.trim() ||
      templateForm.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    ).toLowerCase();

    if (!cleanSlug) {
      toast({ title: "Validation Error", description: "A valid slug is required", variant: "destructive" });
      return;
    }

    if (templateForm.beadSequence.length === 0) {
      toast({
        title: "Validation Error",
        description: "Template must have at least one bead in its arrangement",
        variant: "destructive",
      });
      return;
    }

    const hasTestInventory = templateForm.beadSequence.some((b) => b.variantSku.startsWith("TEST-"));

    try {
      if (editingTemplate) {
        await updateAdminDesignTemplate(editingTemplate.slug, {
          name: templateForm.name.trim(),
          slug: cleanSlug,
          description: templateForm.description.trim(),
          thumbnailUrl: templateForm.thumbnailUrl.trim(),
          jewelleryType: templateForm.jewelleryType,
          constructionType: templateForm.constructionType,
          wristMm: Number(templateForm.wristMm),
          sortOrder: Number(templateForm.sortOrder),
          isPublished: templateForm.isPublished,
          beadSequence: templateForm.beadSequence,
        });
        toast({
          title: "Template Updated",
          description: templateForm.isPublished && hasTestInventory
            ? `"${templateForm.name}" updated and published in test mode.`
            : `"${templateForm.name}" updated successfully.`,
        });
      } else {
        await createAdminDesignTemplate({
          name: templateForm.name.trim(),
          slug: cleanSlug,
          description: templateForm.description.trim(),
          thumbnailUrl: templateForm.thumbnailUrl.trim(),
          jewelleryType: templateForm.jewelleryType,
          constructionType: templateForm.constructionType,
          wristMm: Number(templateForm.wristMm),
          sortOrder: Number(templateForm.sortOrder),
          isPublished: templateForm.isPublished,
          beadSequence: templateForm.beadSequence,
        });
        toast({
          title: "Template Created",
          description: templateForm.isPublished && hasTestInventory
            ? `"${templateForm.name}" created and published in test mode.`
            : `"${templateForm.name}" created successfully.`,
        });
      }
      setShowTemplateModal(false);
      fetchTemplates();
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message || "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplateSlug) return;
    try {
      await deleteAdminDesignTemplate(deletingTemplateSlug);
      toast({ title: "Template Deleted", description: "Template has been removed." });
      setDeletingTemplateSlug(null);
      fetchTemplates();
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err.message || "Failed to delete template",
        variant: "destructive",
      });
    }
  };

  // ==========================================================================
  // JEWELLERY TYPE ACTIONS
  // ==========================================================================

  const handleOpenCreateType = () => {
    setEditingType(null);
    setTypeForm({
      slug: "",
      displayName: "",
      description: "",
      imageUrl: "",
      displayOrder: (jewelleryTypes.length + 1) * 10,
      isPublished: false,
      designerStatus: "coming_soon",
      supportedConstructionTypes: "elastic_bead",
    });
    setCategoryConflictMsg(null);
    setShowTypeModal(true);
  };

  const handleOpenEditType = (type: JewelleryType) => {
    setEditingType(type);
    setTypeForm({
      slug: type.slug,
      displayName: type.displayName,
      description: type.description || "",
      imageUrl: type.imageUrl || "",
      displayOrder: type.displayOrder ?? 0,
      isPublished: !!type.isPublished,
      designerStatus: type.designerStatus,
      supportedConstructionTypes: (type.supportedConstructionTypes || []).join(", "),
    });
    setCategoryConflictMsg(null);
    setShowTypeModal(true);
  };

  const handleSaveType = async () => {
    try {
      if (!typeForm.displayName.trim()) {
        toast({ title: "Validation Error", description: "Display name is required.", variant: "destructive" });
        return;
      }

      const constructions = typeForm.supportedConstructionTypes
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (constructions.length === 0) {
        toast({ title: "Validation Error", description: "At least one supported construction type is required.", variant: "destructive" });
        return;
      }

      if (editingType) {
        await updateJewelleryType(editingType.slug, {
          displayName: typeForm.displayName.trim(),
          description: typeForm.description.trim(),
          imageUrl: typeForm.imageUrl.trim() || undefined,
          displayOrder: Number(typeForm.displayOrder) || 0,
          isPublished: typeForm.isPublished,
          designerStatus: typeForm.designerStatus,
          supportedConstructionTypes: constructions,
        });
        toast({ title: "Category Updated", description: `Updated ${typeForm.displayName}.` });
      } else {
        if (!typeForm.slug.trim()) {
          toast({ title: "Validation Error", description: "Category slug is required.", variant: "destructive" });
          return;
        }
        await createJewelleryType({
          slug: typeForm.slug.trim().toLowerCase(),
          displayName: typeForm.displayName.trim(),
          description: typeForm.description.trim(),
          imageUrl: typeForm.imageUrl.trim() || undefined,
          displayOrder: Number(typeForm.displayOrder) || 0,
          isPublished: typeForm.isPublished,
          designerStatus: typeForm.designerStatus,
          supportedConstructionTypes: constructions,
        });
        toast({ title: "Category Created", description: `Created category ${typeForm.displayName}.` });
      }

      setShowTypeModal(false);
      setEditingType(null);
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleArchiveType = async (slug: string) => {
    try {
      await archiveJewelleryType(slug);
      toast({ title: "Category Archived", description: `Archived ${slug}. It is hidden from customer catalogue.` });
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Archive Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleRestoreType = async (slug: string) => {
    try {
      await restoreJewelleryType(slug);
      toast({ title: "Category Restored", description: `Restored ${slug}.` });
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Restore Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteType = async () => {
    if (!deletingTypeSlug) return;
    try {
      setCategoryConflictMsg(null);
      await deleteJewelleryType(deletingTypeSlug);
      toast({ title: "Category Deleted", description: `Deleted category ${deletingTypeSlug}.` });
      setDeletingTypeSlug(null);
      fetchJewelleryTypes();
    } catch (err: any) {
      setCategoryConflictMsg(
        err.message ||
          "Cannot delete category referenced by materials, orders, or saved designs. Please archive it instead."
      );
    }
  };

  const handleUpdateTypeStatus = async (slug: string, updates: Partial<JewelleryType>) => {
    try {
      await updateJewelleryType(slug, updates);
      toast({ title: "Category Updated", description: `Updated settings for ${slug}.` });
      fetchJewelleryTypes();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteMaterial = async () => {
    if (!deletingMaterial) return;
    try {
      setMaterialConflictMsg(null);
      await deleteStudioMaterial(deletingMaterial._id || (deletingMaterial as any).id);
      toast({ title: "Material Deleted", description: `Deleted material ${deletingMaterial.name}.` });
      setDeletingMaterial(null);
      fetchMaterials(false);
    } catch (err: any) {
      setMaterialConflictMsg(
        err.message ||
          "Cannot delete material referenced by customer orders, saved designs, or reservations. Please deactivate it instead."
      );
    }
  };

  // ==========================================================================
  // MATERIAL ACTIONS
  // ==========================================================================

  const handleSaveMaterial = async () => {
    try {
      if (!materialForm.name.trim() || !materialForm.code.trim()) {
        toast({ title: "Validation Error", description: "Name and Code are required.", variant: "destructive" });
        return;
      }

      const cleanImageUrl = materialForm.imageUrl?.trim() || null;
      const cleanRenderAssetUrl = materialForm.renderAssetUrl?.trim() || null;
      const payload = {
        ...materialForm,
        imageUrl: cleanImageUrl,
        renderAssetUrl: cleanRenderAssetUrl,
      };

      if (editingMaterial) {
        const res = await apiRequest("PATCH", `/api/v1/studio/admin/materials/${editingMaterial._id || (editingMaterial as any).id}`, {
          ...payload,
          syncVariantSkus,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Update failed");
        }
        toast({ title: "Material Updated", description: `Updated ${materialForm.name}.` });
      } else {
        const res = await apiRequest("POST", "/api/v1/studio/admin/materials", payload);
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(errData?.message || "Creation failed");
        }
        toast({ title: "Material Created", description: `Created new material ${materialForm.name}.` });
      }

      const scrollPos = typeof window !== "undefined" ? window.scrollY : 0;
      setShowMaterialModal(false);
      setEditingMaterial(null);
      await fetchMaterials(false);
      if (scrollPos > 0) {
        requestAnimationFrame(() => window.scrollTo({ top: scrollPos, behavior: "instant" }));
      }
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleOpenEditMaterial = (mat: StudioMaterial) => {
    setEditingMaterial(mat);
    setSyncVariantSkus(true);
    setMaterialForm({
      name: mat.name,
      code: mat.code,
      description: mat.description || "",
      materialType: mat.materialType,
      imageUrl: mat.imageUrl || "",
      renderAssetUrl: mat.renderAssetUrl || "",
      allowedJewelleryTypes: mat.allowedJewelleryTypes || [],
      visibilityScopes: mat.visibilityScopes && mat.visibilityScopes.length > 0 ? mat.visibilityScopes : ["studio"],
      isActive: mat.isActive,
      selectionPolicy: (mat as any).selectionPolicy || "customer_selects_variant",
      assortmentNotes: (mat as any).assortmentNotes || "",
      eligibleAssortmentSkus: (mat as any).eligibleAssortmentSkus || [],
    });
    setShowMaterialModal(true);
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
        imageUrl: variantForm.imageUrl.trim() || undefined,
        renderAssetUrl: variantForm.renderAssetUrl.trim() || undefined,
      };

      const materialId = selectedMaterialForVariant._id || (selectedMaterialForVariant as any).id;

      if (editingVariantSku) {
        const res = await apiRequest(
          "PATCH",
          `/api/v1/studio/admin/materials/${materialId}/variants/${encodeURIComponent(editingVariantSku)}`,
          payload
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.message || "Update variant failed");
        }
        toast({ title: "Variant Updated", description: `Updated SKU ${variantForm.sku}.` });
      } else {
        const res = await apiRequest(
          "POST",
          `/api/v1/studio/admin/materials/${materialId}/variants`,
          payload
        );
        if (!res.ok) {
          const errJson = await res.json().catch(() => null);
          throw new Error(errJson?.message || "Add variant failed");
        }
        toast({ title: "Variant Added", description: `Added variant SKU ${variantForm.sku}.` });
      }

      const scrollPos = typeof window !== "undefined" ? window.scrollY : 0;
      setShowVariantModal(false);
      setEditingVariantSku(null);
      await fetchMaterials(false);
      if (scrollPos > 0) {
        requestAnimationFrame(() => window.scrollTo({ top: scrollPos, behavior: "instant" }));
      }
    } catch (err: any) {
      toast({ title: "Variant Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleConfirmDisableVariant = async () => {
    if (!disablingVariant) return;
    try {
      const res = await apiRequest(
        "PATCH",
        `/api/v1/studio/admin/materials/${disablingVariant.materialId}/variants/${encodeURIComponent(disablingVariant.sku)}`,
        { isActive: false }
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || "Deactivation failed");
      }
      toast({ title: "Variant Deactivated", description: `SKU ${disablingVariant.sku} is now inactive.` });
      setDisablingVariant(null);
      fetchMaterials(false);
    } catch (err: any) {
      toast({ title: "Failed to Deactivate", description: err.message, variant: "destructive" });
    }
  };

  const handleConfirmDeleteVariant = async () => {
    if (!deletingVariant) return;
    const targetIdentifier = deletingVariant.variantId || deletingVariant.sku;
    try {
      await apiRequest(
        "DELETE",
        `/api/v1/studio/admin/materials/${deletingVariant.materialId}/variants/${encodeURIComponent(targetIdentifier)}`
      );
      toast({ title: "Variant Deleted", description: `SKU ${deletingVariant.sku} was permanently removed.` });
      setDeletingVariant(null);
      fetchMaterials(false);
    } catch (err: any) {
      const errMsg = err?.message || "";
      const is409 = errMsg.includes("409") || err?.status === 409;
      if (is409) {
        const cleanMessage = errMsg.replace(/^\d+:\s*/, "");
        setVariantBlockedDialog({
          materialId: deletingVariant.materialId,
          materialName: deletingVariant.materialName,
          sku: deletingVariant.sku,
          variantId: deletingVariant.variantId,
          message:
            cleanMessage ||
            `Cannot permanently delete SKU "${deletingVariant.sku}" because it is referenced in orders or designs.`,
        });
        setDeletingVariant(null);
        return;
      }
      toast({ title: "Failed to Delete SKU", description: errMsg, variant: "destructive" });
    }
  };

  const handleDeactivateFromBlockedDialog = async () => {
    if (!variantBlockedDialog) return;
    const targetIdentifier = variantBlockedDialog.variantId || variantBlockedDialog.sku;
    try {
      await apiRequest(
        "PATCH",
        `/api/v1/studio/admin/materials/${variantBlockedDialog.materialId}/variants/${encodeURIComponent(targetIdentifier)}`,
        { isActive: false }
      );
      toast({
        title: "Variant Deactivated",
        description: `SKU ${variantBlockedDialog.sku} has been deactivated and will not appear in new customer orders or studio designs.`,
      });
      setVariantBlockedDialog(null);
      fetchMaterials();
    } catch (err: any) {
      toast({ title: "Deactivation Failed", description: err.message, variant: "destructive" });
    }
  };

  // ==========================================================================
  // COMPONENT TYPES ACTIONS
  // ==========================================================================

  const handleSaveComponentType = async () => {
    try {
      if (!newTypeForm.displayName.trim()) {
        toast({ title: "Validation Error", description: "Display name is required.", variant: "destructive" });
        return;
      }

      const res = await apiRequest("POST", "/api/v1/studio/admin/component-types", {
        displayName: newTypeForm.displayName.trim(),
        typeId: newTypeForm.typeId.trim() || undefined,
        description: newTypeForm.description.trim() || undefined,
        displayOrder: Number(newTypeForm.displayOrder) || 0,
        isActive: newTypeForm.isActive,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Creation failed");
      }

      toast({
        title: "Component Type Added",
        description: `Added "${newTypeForm.displayName}" to component types.`,
      });

      setNewTypeForm({
        typeId: "",
        displayName: "",
        description: "",
        displayOrder: 0,
        isActive: true,
      });
      fetchComponentTypes();
    } catch (err: any) {
      toast({ title: "Failed to Add Type", description: err.message, variant: "destructive" });
    }
  };

  const handleUpdateComponentType = async (typeId: string, displayName: string) => {
    try {
      if (!displayName.trim()) {
        toast({ title: "Validation Error", description: "Display name cannot be empty.", variant: "destructive" });
        return;
      }

      const res = await apiRequest("PATCH", `/api/v1/studio/admin/component-types/${typeId}`, {
        displayName: displayName.trim(),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Update failed");
      }

      toast({ title: "Display Name Updated", description: `Updated display name to "${displayName}".` });
      setEditingComponentTypeId(null);
      fetchComponentTypes();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleComponentTypeActive = async (type: ComponentTypeItem) => {
    try {
      const res = await apiRequest("PATCH", `/api/v1/studio/admin/component-types/${type.typeId}`, {
        isActive: !type.isActive,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Status update failed");
      }

      toast({
        title: type.isActive ? "Type Deactivated" : "Type Activated",
        description: `${type.displayName} is now ${type.isActive ? "inactive (hidden from new materials)" : "active"}.`,
      });
      fetchComponentTypes();
    } catch (err: any) {
      toast({ title: "Update Failed", description: err.message, variant: "destructive" });
    }
  };

  const handleDeleteComponentType = async (type: ComponentTypeItem) => {
    try {
      const res = await apiRequest("DELETE", `/api/v1/studio/admin/component-types/${type.typeId}`);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 409) {
          setTypeBlockedDialog({
            typeId: type.typeId,
            displayName: type.displayName,
            message: json?.message || `Cannot delete "${type.displayName}" because it is currently used by materials.`,
            materialCount: json?.materialCount || type.materialCount || 1,
          });
          return;
        }
        throw new Error(json?.message || "Delete failed");
      }

      toast({
        title: "Component Type Removed",
        description: `"${type.displayName}" has been permanently removed.`,
      });
      fetchComponentTypes();
    } catch (err: any) {
      toast({ title: "Failed to Remove Type", description: err.message, variant: "destructive" });
    }
  };

  const handleDeactivateFromTypeBlockedDialog = async () => {
    if (!typeBlockedDialog) return;
    try {
      const res = await apiRequest("PATCH", `/api/v1/studio/admin/component-types/${typeBlockedDialog.typeId}`, {
        isActive: false,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Deactivation failed");
      }

      toast({
        title: "Component Type Deactivated",
        description: `"${typeBlockedDialog.displayName}" is now deactivated to protect existing material records.`,
      });
      setTypeBlockedDialog(null);
      fetchComponentTypes();
    } catch (err: any) {
      toast({ title: "Deactivation Failed", description: err.message, variant: "destructive" });
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

    for (let i = 0; i < currentMakingCharge.serviceCharges.length; i++) {
      const sc = currentMakingCharge.serviceCharges[i];
      if (!sc.name || !sc.name.trim()) {
        toast({
          title: "Validation Error",
          description: `Finishing service #${i + 1} must have a title/name.`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const payload = {
        ...currentMakingCharge,
        baseFee: Math.max(0, Number(currentMakingCharge.baseFee) || 0),
        serviceCharges: currentMakingCharge.serviceCharges.map((sc) => ({
          name: sc.name.trim(),
          fee: Math.max(0, Number(sc.fee) || 0),
          isOptional: sc.isOptional !== undefined ? sc.isOptional : true,
          description: sc.description?.trim() || undefined,
        })),
      };

      const res = await apiRequest(
        "PUT",
        `/api/v1/studio/admin/making-charges/${selectedPricingType}/${selectedPricingConstruction}`,
        payload
      );
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Save charge failed");
      }
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
  const activeMaterialsCount = materials.filter((m) => m.isActive).length;
  const inactiveMaterialsCount = materials.filter((m) => !m.isActive).length;

  const filteredMaterials = materials.filter((m) => {
    if (materialStatusFilter === "active" && !m.isActive) return false;
    if (materialStatusFilter === "inactive" && m.isActive) return false;
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

  // Filtering templates list
  const publishedTemplatesCount = templates.filter((t) => t.isPublished).length;
  const draftTemplatesCount = templates.filter((t) => !t.isPublished).length;

  const filteredTemplates = templates.filter((t) => {
    if (templateStatusFilter === "published" && !t.isPublished) return false;
    if (templateStatusFilter === "draft" && t.isPublished) return false;
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
              fetchTemplates();
              fetchStudioCategories(false).then(setStudioCategories).catch(() => {});
              fetchConstructionMethods(false).then(setStudioMethods).catch(() => {});
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
            onClick={() => setActiveTab("categories")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "categories"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Categories & Subcategories</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("methods")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "methods"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Construction Methods</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("rules")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "rules"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>Design Rules & Calibration</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("designer")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "designer"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Manual Assembly Designer</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("materials")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "materials"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Studio Materials</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white">
              {materials.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "inventory"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Studio Inventory</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("links")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "links"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            <span>Inventory Connections</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pricing")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "pricing"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Pricing & Fees</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("reservations")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "reservations"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>Stock Reservations</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 shrink-0 ${
              activeTab === "templates"
                ? "bg-[#B66F72] text-white shadow-xs"
                : "bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Design Templates</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-stone-100 dark:bg-muted text-stone-600">
              {templates.length}
            </span>
          </button>
        </div>

        {/* TAB: STUDIO CATEGORIES & SUBCATEGORIES */}
        {activeTab === "categories" && (
          <StudioCategoriesSection />
        )}

        {/* TAB: CONSTRUCTION METHODS */}
        {activeTab === "methods" && (
          <StudioConstructionMethodsSection />
        )}

        {/* TAB: MANUAL ASSEMBLY DESIGNER */}
        {activeTab === "designer" && (
          <ManualAssemblyDesigner
            categories={studioCategories}
            methods={studioMethods}
          />
        )}

        {/* TAB: STUDIO INVENTORY */}
        {activeTab === "inventory" && (
          <StudioInventorySection
            onNavigateToMaterial={(materialId) => {
              setActiveTab("materials");
              const target = materials.find((m) => m.id === materialId);
              if (target) {
                handleOpenEditMaterial(target);
              }
            }}
          />
        )}

        {/* TAB: EXPLICIT MATERIAL LINKS */}
        {activeTab === "links" && (
          <StudioMaterialLinksSection studioMaterials={materials} />
        )}

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
                  {componentTypes
                    .filter((t) => t.isActive || filterType === t.typeId)
                    .map((t) => (
                      <option key={t.typeId} value={t.typeId}>
                        {t.displayName}
                      </option>
                    ))}
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="h-9 px-3 text-xs rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-[#342824] dark:text-foreground"
                >
                  <option value="all">All Studio Categories</option>
                  {studioCategories.length > 0
                    ? studioCategories.map((c) => (
                        <option key={c.id || c.slug} value={c.slug || c.id}>
                          {c.name}
                        </option>
                      ))
                    : jewelleryTypes.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.displayName} Eligible
                        </option>
                      ))}
                </select>

                <select
                  value={materialStatusFilter}
                  onChange={(e) => setMaterialStatusFilter(e.target.value as any)}
                  className="h-9 px-3 text-xs rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-[#342824] dark:text-foreground font-medium"
                >
                  <option value="active">Active Materials ({activeMaterialsCount})</option>
                  <option value="inactive">Archived / Inactive ({inactiveMaterialsCount})</option>
                  <option value="all">All Materials ({materials.length})</option>
                </select>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  onClick={() => {
                    fetchComponentTypes();
                    setShowComponentTypeModal(true);
                  }}
                  variant="outline"
                  className="text-xs rounded-xl h-9 px-3.5 border-[#E6D8D0] dark:border-border flex items-center gap-1.5 shrink-0 bg-white dark:bg-card hover:bg-stone-50"
                  title="Configure and manage component types"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#B99A72]" />
                  <span>Manage Component Types</span>
                </Button>

                <Button
                  onClick={() => {
                    setEditingMaterial(null);
                    setMaterialForm({
                      name: "",
                      code: "",
                      description: "",
                      materialType: componentTypes.find((t) => t.isActive)?.typeId || "bead",
                      imageUrl: "",
                      renderAssetUrl: "",
                      allowedJewelleryTypes: ["bracelet"],
                      visibilityScopes: ["studio"],
                      isActive: true,
                      selectionPolicy: "customer_selects_variant",
                      assortmentNotes: "",
                      eligibleAssortmentSkus: [],
                    });
                    setShowMaterialModal(true);
                  }}
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-4 flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Shared Material</span>
                </Button>
              </div>
            </div>

            {materialStatusFilter === "inactive" && (
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <span className="font-semibold">Archived View:</span>
                <span>These materials are inactive and hidden from the customer Create Your Own Studio, but retained for historical order integrity.</span>
              </div>
            )}

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
                    key={mat._id || (mat as any).id}
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
                            {mat.isActive ? (
                              <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200">
                                Active Material
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200">
                                Inactive Material
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

                          {/* Feature availability pills */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-[#756861]">Available in:</span>
                            {(mat.visibilityScopes && mat.visibilityScopes.length > 0 ? mat.visibilityScopes : ["studio"]).map((s) => (
                              <span
                                key={s}
                                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  s === "bracelet_customization"
                                    ? "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40"
                                    : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800/40"
                                }`}
                              >
                                {s === "studio" ? "Create Your Own Studio" : "Bracelet Customization"}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const newStatus = !mat.isActive;
                              const res = await apiRequest("PATCH", `/api/v1/studio/admin/materials/${mat._id || (mat as any).id}`, {
                                isActive: newStatus,
                              });
                              if (!res.ok) throw new Error("Failed to update status");
                              toast({
                                title: newStatus ? "Material Activated" : "Material Deactivated",
                                description: `${mat.name} is now ${newStatus ? "active" : "inactive"}.`,
                              });
                              fetchMaterials(false);
                            } catch (err: any) {
                              toast({ title: "Update Failed", description: err.message, variant: "destructive" });
                            }
                          }}
                          className={`h-8 text-xs rounded-xl ${
                            mat.isActive
                              ? "text-[#756861] hover:text-rose-600 hover:bg-rose-50 border-[#E6D8D0]"
                              : "text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-300"
                          }`}
                          title={mat.isActive ? "Deactivate Material" : "Activate Material"}
                        >
                          {mat.isActive ? (
                            <>
                              <EyeOff className="w-3.5 h-3.5 mr-1" />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <Eye className="w-3.5 h-3.5 mr-1" />
                              <span>Activate</span>
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDeletingMaterial(mat);
                            setMaterialConflictMsg(null);
                          }}
                          className="h-8 w-8 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                          title="Delete Material"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingMaterial(mat);
                            setSyncVariantSkus(true);
                            setMaterialForm({
                              name: mat.name,
                              code: mat.code,
                              description: mat.description || "",
                              materialType: mat.materialType,
                              imageUrl: mat.imageUrl,
                              renderAssetUrl: mat.renderAssetUrl || "",
                              allowedJewelleryTypes: mat.allowedJewelleryTypes,
                              visibilityScopes: mat.visibilityScopes && mat.visibilityScopes.length > 0 ? mat.visibilityScopes : ["studio"],
                              isActive: mat.isActive,
                              selectionPolicy: (mat as any).selectionPolicy || "customer_selects_variant",
                              assortmentNotes: (mat as any).assortmentNotes || "",
                              eligibleAssortmentSkus: (mat as any).eligibleAssortmentSkus || [],
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
                              sku: `${mat.code}-8MM`,
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
                              imageUrl: "",
                              renderAssetUrl: "",
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
                                <th className="py-2 px-2">Status</th>
                                <th className="py-2 px-2">Stock (Available)</th>
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
                                    !v.isActive ? "opacity-60 bg-stone-50/50 dark:bg-muted/10" : ""
                                  }`}
                                >
                                  <td className="py-2.5 px-2 font-mono font-medium">{v.sku}</td>
                                  <td className="py-2.5 px-2">{v.sizeLabel}</td>
                                  <td className="py-2.5 px-2 text-[#756861]">
                                    {[v.color, v.finish].filter(Boolean).join(" • ") || "—"}
                                  </td>
                                  <td className="py-2.5 px-2 capitalize">{v.sellingUnit}</td>
                                  <td className="py-2.5 px-2">
                                    {!mat.isActive ? (
                                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
                                        Parent Inactive
                                      </Badge>
                                    ) : v.isActive ? (
                                      <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200">
                                        Active
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300 bg-rose-50 dark:bg-rose-950/30">
                                        Inactive
                                      </Badge>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <div className="flex flex-col">
                                      <span
                                        className={`font-medium ${
                                          v.stock <= v.lowStockThreshold
                                            ? "text-amber-600 dark:text-amber-400 font-bold"
                                            : "text-emerald-700 dark:text-emerald-400"
                                        }`}
                                      >
                                        {v.stock} available
                                      </span>
                                      {((v.committedStock || 0) > 0 || (v.reservedStock || 0) > 0) && (
                                        <span className="text-[10px] text-[#756861] dark:text-muted-foreground">
                                          {v.committedStock ? `${v.committedStock} committed` : ""}
                                          {v.committedStock && v.reservedStock ? " · " : ""}
                                          {v.reservedStock ? `${v.reservedStock} held in checkout` : ""}
                                          {` (${v.physicalStock ?? v.stock} physical)`}
                                        </span>
                                      )}
                                    </div>
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
                                            imageUrl: (v as any).imageUrl || "",
                                            renderAssetUrl: (v as any).renderAssetUrl || "",
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
                                          onClick={() => setDisablingVariant({ materialId: mat._id || (mat as any).id, sku: v.sku })}
                                          className="h-7 px-2 text-xs text-stone-500 hover:text-amber-700 hover:bg-amber-50"
                                          title="Deactivate variant"
                                        >
                                          <EyeOff className="w-3 h-3 mr-1" />
                                          <span>Deactivate</span>
                                        </Button>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={async () => {
                                            try {
                                              const res = await apiRequest(
                                                "PATCH",
                                                `/api/v1/studio/admin/materials/${mat._id || (mat as any).id}/variants/${encodeURIComponent(v.sku)}`,
                                                { isActive: true }
                                              );
                                              if (!res.ok) throw new Error("Activation failed");
                                              toast({
                                                title: "Variant Activated",
                                                description: `SKU ${v.sku} is now active.`,
                                              });
                                              fetchMaterials(false);
                                            } catch (err: any) {
                                              toast({
                                                title: "Activation Failed",
                                                description: err.message,
                                                variant: "destructive",
                                              });
                                            }
                                          }}
                                          className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                          title="Activate variant"
                                        >
                                          <Eye className="w-3 h-3 mr-1" />
                                          <span>Activate</span>
                                        </Button>
                                      )}

                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() =>
                                          setDeletingVariant({
                                            materialId: mat._id || (mat as any).id,
                                            materialName: mat.name,
                                            sku: v.sku,
                                            variantId: (v as any)._id,
                                            isActive: v.isActive,
                                          })
                                        }
                                        className="h-7 w-7 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                                        title="Delete SKU Variant"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-card p-4 rounded-2xl border border-[#E6D8D0] dark:border-border">
              <div>
                <h3 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                  Jewellery Categories & Readiness
                </h3>
                <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                  Manage dynamic studio categories, publication status, construction models, and catalogue readiness.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-[#756861] select-none">
                  <input
                    type="checkbox"
                    checked={showArchivedTypes}
                    onChange={(e) => setShowArchivedTypes(e.target.checked)}
                    className="w-4 h-4 rounded accent-[#B66F72]"
                  />
                  <span>Show Archived</span>
                </label>

                <Button
                  onClick={handleOpenCreateType}
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-4 flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Category</span>
                </Button>
              </div>
            </div>

            {loadingTypes ? (
              <div className="py-20 text-center">
                <div className="w-8 h-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-xs text-[#756861]">Loading categories...</p>
              </div>
            ) : jewelleryTypes.length === 0 ? (
              <Card className="p-12 text-center rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card">
                <Sliders className="w-10 h-10 text-[#B99A72] opacity-60 mx-auto mb-3" />
                <h3 className="font-playfair text-lg font-semibold">No Categories Configured</h3>
                <p className="text-xs text-[#756861] mt-1 max-w-sm mx-auto">
                  Click "Add Category" above to create and publish jewellery types.
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {jewelleryTypes.map((type) => {
                  const readiness = readinessList.find((r) => r.slug === type.slug);
                  return (
                    <Card
                      key={type.slug}
                      className={`rounded-2xl border bg-white dark:bg-card p-6 shadow-xs flex flex-col justify-between transition-all ${
                        type.isArchived
                          ? "border-amber-300 dark:border-amber-800/60 opacity-80 bg-amber-50/20"
                          : "border-[#E6D8D0] dark:border-border"
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex items-start gap-3">
                            {type.imageUrl && (
                              <img
                                src={getAssetUrl(type.imageUrl)}
                                alt={type.displayName}
                                className="w-12 h-12 rounded-xl object-cover border border-[#E6D8D0] dark:border-border shrink-0 bg-stone-50"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/placeholders/placeholder.png";
                                }}
                              />
                            )}
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
                                  {type.displayName}
                                </h3>
                                <Badge
                                  variant="outline"
                                  className={
                                    type.isPublished
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                                      : "bg-stone-50 text-stone-600 border-stone-200 text-[10px]"
                                  }
                                >
                                  {type.isPublished ? "Published" : "Unpublished"}
                                </Badge>
                                {type.isArchived && (
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]"
                                  >
                                    Archived
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-mono text-[#756861]">slug: {type.slug}</span>
                                <span className="text-xs text-[#756861]">·</span>
                                <span className="text-xs text-[#756861]">Order: {type.displayOrder ?? 0}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditType(type)}
                              className="h-8 w-8 p-0 text-stone-500 hover:text-[#B66F72] rounded-xl"
                              title="Edit Category Details"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>

                            {type.isArchived ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRestoreType(type.slug)}
                                className="h-8 text-xs border-[#E6D8D0] rounded-xl text-emerald-700 hover:bg-emerald-50"
                                title="Restore Category"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5 mr-1" />
                                <span>Restore</span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleArchiveType(type.slug)}
                                className="h-8 text-xs border-amber-200 rounded-xl text-amber-700 hover:bg-amber-50"
                                title="Archive Category"
                              >
                                <Archive className="w-3.5 h-3.5 mr-1" />
                                <span>Archive</span>
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setDeletingTypeSlug(type.slug);
                                setCategoryConflictMsg(null);
                              }}
                              className="h-8 w-8 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                              title="Delete Category"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        <p className="text-xs text-[#756861] dark:text-muted-foreground mb-4 leading-relaxed">
                          {type.description || "No description provided."}
                        </p>

                        {/* Live Readiness Breakdown */}
                        <div className="p-3 rounded-xl bg-[#FBF7F3] dark:bg-background/60 border border-[#E6D8D0]/70 dark:border-border/70 space-y-2 mb-4 text-xs">
                          <span className="text-[10px] uppercase font-semibold text-[#B99A72] tracking-wider block">
                            Live Studio Readiness
                          </span>
                          <div className="grid grid-cols-3 gap-2 text-center pt-1">
                            <div className="bg-white dark:bg-card p-2 rounded-lg border border-[#E6D8D0]/50 dark:border-border/50">
                              <span className="text-[10px] text-[#756861] block">Materials</span>
                              <span className="font-bold text-sm text-[#342824] dark:text-foreground">
                                {readiness?.eligibleMaterialCount ?? 0}
                              </span>
                              <span className="text-[9px] text-[#756861] block">
                                {readiness?.inStockVariantCount ?? 0} in stock
                              </span>
                            </div>
                            <div className="bg-white dark:bg-card p-2 rounded-lg border border-[#E6D8D0]/50 dark:border-border/50">
                              <span className="text-[10px] text-[#756861] block">Design Rules</span>
                              <span
                                className={`font-semibold text-xs mt-1 block ${
                                  readiness?.hasDesignRule
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
                                {readiness?.hasDesignRule ? "Configured ✓" : "Missing ✗"}
                              </span>
                            </div>
                            <div className="bg-white dark:bg-card p-2 rounded-lg border border-[#E6D8D0]/50 dark:border-border/50">
                              <span className="text-[10px] text-[#756861] block">Making Fee</span>
                              <span
                                className={`font-semibold text-xs mt-1 block ${
                                  readiness?.hasMakingCharge
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-amber-600 dark:text-amber-400"
                                }`}
                              >
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
                            <span className="font-mono text-[11px]">
                              {(type.supportedConstructionTypes || []).join(", ") || "None"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[#756861]">Designer Status:</span>
                            <select
                              value={type.designerStatus}
                              onChange={(e) =>
                                handleUpdateTypeStatus(type.slug, { designerStatus: e.target.value as any })
                              }
                              className="text-xs rounded-lg border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background h-8 px-2"
                            >
                              <option value="available">Available</option>
                              <option value="coming_soon">Coming Soon</option>
                              <option value="maintenance">Maintenance</option>
                            </select>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[#756861]">Published in Customer Studio:</span>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!type.isPublished}
                                onChange={(e) =>
                                  handleUpdateTypeStatus(type.slug, {
                                    isPublished: e.target.checked,
                                    isEnabled: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 rounded accent-[#B66F72]"
                              />
                              <span className="font-medium">
                                {type.isPublished ? "Published (Live)" : "Unpublished (Draft)"}
                              </span>
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
                            setSelectedRuleConstruction(type.supportedConstructionTypes?.[0] || "default");
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
                            setSelectedPricingConstruction(type.supportedConstructionTypes?.[0] || "default");
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
            )}
          </div>
        )}

        {/* TAB 3: DESIGN RULES & CALIBRATION */}
        {activeTab === "rules" && (
          <StudioDesignRulesSection />
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
                <Label className="text-xs font-semibold">Studio Jewellery Category</Label>
                <select
                  value={selectedPricingType}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setSelectedPricingType(newType);
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
                >
                  {studioCategories.map((c) => (
                    <option key={c.id || c.slug} value={c.slug || c.id}>
                      {c.name}
                    </option>
                  ))}
                  {/* Preserved legacy category to access the ₹20 craftsmanship charge */}
                  <option value="bracelet">Bracelet (Legacy ₹20 Record)</option>
                  {jewelleryTypes.filter(jt => jt.slug !== "bracelet").map((t) => (
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
                  {studioMethods.map((m) => (
                    <option key={m.id || m.slug} value={m.slug || m.id}>
                      {m.name}
                    </option>
                  ))}
                  {/* Preserved legacy construction type for legacy ₹20 charge */}
                  <option value="elastic_bead">Elastic Bead (Legacy Base)</option>
                  {jewelleryTypes
                    .find((t) => t.slug === selectedPricingType)
                    ?.supportedConstructionTypes?.filter((c) => c !== "elastic_bead")
                    .map((c) => (
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
                    <div>
                      <Label className="text-xs font-semibold">Optional Finishing / Presentation Services</Label>
                      <p className="text-[11px] text-[#756861] dark:text-muted-foreground mt-0.5">
                        Add or customize gift boxes, velvet pouches, engraved tags, or special packaging options.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = [
                          ...currentMakingCharge.serviceCharges,
                          { name: "", fee: 0, isOptional: true, description: "" },
                        ];
                        setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                      }}
                      className="text-xs text-[#B66F72] hover:text-[#95565A] hover:bg-[#B66F72]/10 h-7 px-2 shrink-0"
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add Service
                    </Button>
                  </div>

                  {currentMakingCharge.serviceCharges.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-[#E6D8D0] rounded-xl bg-stone-50/50 dark:bg-muted/10 text-xs text-[#756861]">
                      No optional finishing services added yet. Click &quot;+ Add Service&quot; above to offer gift wrap, velvet pouches, or calligraphed notes.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {currentMakingCharge.serviceCharges.map((sc, scIdx) => (
                        <div
                          key={scIdx}
                          className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3] dark:bg-background/60 shadow-2xs"
                        >
                          <div className="flex-1 space-y-1.5">
                            <Input
                              type="text"
                              value={sc.name}
                              placeholder="Service title (e.g. Velvet Gift Box, Custom Note)"
                              onChange={(e) => {
                                const updated = [...currentMakingCharge.serviceCharges];
                                updated[scIdx] = { ...updated[scIdx], name: e.target.value };
                                setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                              }}
                              className="text-xs font-semibold h-8 rounded-lg bg-white dark:bg-card"
                            />
                            <Input
                              type="text"
                              value={sc.description || ""}
                              placeholder="Description (e.g. Luxurious satin-lined presentation packaging)"
                              onChange={(e) => {
                                const updated = [...currentMakingCharge.serviceCharges];
                                updated[scIdx] = { ...updated[scIdx], description: e.target.value };
                                setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                              }}
                              className="text-[11px] h-7 rounded-lg text-[#756861] dark:text-muted-foreground bg-white dark:bg-card"
                            />
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="relative w-28">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#756861]">
                                ₹
                              </span>
                              <Input
                                type="number"
                                min={0}
                                value={sc.fee}
                                placeholder="Fee"
                                onChange={(e) => {
                                  const updated = [...currentMakingCharge.serviceCharges];
                                  updated[scIdx] = {
                                    ...updated[scIdx],
                                    fee: Math.max(0, Number(e.target.value) || 0),
                                  };
                                  setCurrentMakingCharge({ ...currentMakingCharge, serviceCharges: updated });
                                }}
                                className="text-xs h-8 pl-6 rounded-lg font-semibold bg-white dark:bg-card"
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
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg shrink-0"
                              title="Delete service"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

        {/* TAB 5: STOCK RESERVATIONS & LIFECYCLE */}
        {activeTab === "reservations" && (
          <div className="space-y-6">
            {/* Plain-Language Lifecycle Guide */}
            <div className="p-4 rounded-2xl bg-white dark:bg-card border border-[#E6D8D0] dark:border-border text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm text-[#342824] dark:text-foreground">
                <Package className="w-4 h-4 text-[#B66F72]" />
                <span>How Component Stock Reservations Work</span>
              </div>
              <p className="text-[#756861] dark:text-muted-foreground text-[11px] leading-relaxed">
                When a customer designs jewellery and proceeds to checkout, the system reserves the selected components to prevent overselling.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30">
                  <span className="font-semibold text-amber-800 dark:text-amber-300 block mb-0.5">1. Reserved</span>
                  <span className="text-[11px] text-[#756861] dark:text-muted-foreground">Held temporarily while payment is pending and released when the configured reservation timeout expires. Safe from other shoppers.</span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300 block mb-0.5">2. Committed</span>
                  <span className="text-[11px] text-[#756861] dark:text-muted-foreground">Order paid or Cash on Delivery placed. Physical stock is permanently deducted.</span>
                </div>
                <div className="p-3 rounded-xl bg-stone-100/60 dark:bg-muted/40 border border-stone-200/60 dark:border-border">
                  <span className="font-semibold text-stone-700 dark:text-foreground block mb-0.5">3. Released / Restocked</span>
                  <span className="text-[11px] text-[#756861] dark:text-muted-foreground">Cart abandoned or order cancelled. Components automatically return to inventory.</span>
                </div>
              </div>
            </div>

            {/* Filter and Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-card p-4 rounded-2xl border border-[#E6D8D0] dark:border-border">
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { key: "all", label: "All" },
                  { key: "reserved", label: "Reserved" },
                  { key: "committed", label: "Committed" },
                  { key: "released", label: "Released" },
                  { key: "restocked", label: "Restocked" },
                  { key: "reconciliation_required", label: "Requires Review" },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilterReservationStatus(key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      filterReservationStatus === key
                        ? "bg-[#342824] text-white shadow-xs"
                        : "bg-[#FBF7F3] dark:bg-background border border-[#E6D8D0] text-[#756861] hover:border-[#B66F72]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
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
                  <Card key={res._id || res.id} className="p-5 rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs">
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
                            onClick={() => handleReconcile(res._id || res.id, "force_commit")}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 rounded-lg"
                          >
                            Force Commit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReconcile(res._id || res.id, "refund_and_release")}
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

        {/* TAB 6: STARTER DESIGN TEMPLATES */}
        {activeTab === "templates" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-card p-4 rounded-2xl border border-[#E6D8D0] dark:border-border">
              <div>
                <h3 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                  Artisan Starter Design Templates
                </h3>
                <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                  Curated base arrangements that customers can choose in the Studio and customize freely.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-center gap-1.5 p-1 bg-[#F1E8E0] dark:bg-muted/60 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTemplateStatusFilter("published")}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                      templateStatusFilter === "published"
                        ? "bg-white dark:bg-card text-[#342824] dark:text-foreground shadow-xs font-semibold"
                        : "text-[#756861] dark:text-muted-foreground hover:text-[#342824]"
                    }`}
                  >
                    Published ({publishedTemplatesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateStatusFilter("draft")}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                      templateStatusFilter === "draft"
                        ? "bg-white dark:bg-card text-[#342824] dark:text-foreground shadow-xs font-semibold"
                        : "text-[#756861] dark:text-muted-foreground hover:text-[#342824]"
                    }`}
                  >
                    Drafts / Unpublished ({draftTemplatesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateStatusFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                      templateStatusFilter === "all"
                        ? "bg-white dark:bg-card text-[#342824] dark:text-foreground shadow-xs font-semibold"
                        : "text-[#756861] dark:text-muted-foreground hover:text-[#342824]"
                    }`}
                  >
                    All ({templates.length})
                  </button>
                </div>

                <Button
                  onClick={handleOpenCreateTemplate}
                  size="sm"
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl flex items-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Template</span>
                </Button>
              </div>
            </div>


            {loadingTemplates ? (
              <div className="py-20 text-center">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#B66F72] mb-2" />
                <p className="text-xs text-[#756861]">Loading design templates...</p>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <Card className="p-12 text-center rounded-2xl border border-dashed border-[#E6D8D0] dark:border-border">
                <Sparkles className="w-10 h-10 mx-auto text-[#B66F72]/40 mb-3" />
                <h4 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                  {templateStatusFilter === "published"
                    ? "No Published Templates"
                    : templateStatusFilter === "draft"
                    ? "No Draft Templates"
                    : "No Design Templates Created Yet"}
                </h4>
                <p className="text-xs text-[#756861] dark:text-muted-foreground max-w-md mx-auto mt-1 mb-4">
                  {templateStatusFilter === "published"
                    ? "Publish base gemstone arrangements when ready to show them in the customer Create Your Own Studio."
                    : "Create base gemstone arrangements that customers can load into the bracelet designer."}
                </p>
                <Button
                  onClick={handleOpenCreateTemplate}
                  size="sm"
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create First Template
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredTemplates.map((tpl) => {
                  const beadCount = tpl.beadSequence?.length || 0;
                  const charmCount = tpl.charms?.length || 0;
                  const hasTestItems = tpl.beadSequence?.some((b) => b.variantSku.startsWith("TEST-"));

                  const beadCounts: Record<string, { count: number; name: string }> = {};
                  tpl.beadSequence?.forEach((b) => {
                    if (!beadCounts[b.variantSku]) {
                      beadCounts[b.variantSku] = { count: 0, name: b.displayName };
                    }
                    beadCounts[b.variantSku].count++;
                  });

                  return (
                    <Card
                      key={tpl.slug}
                      className="p-5 rounded-2xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-playfair font-semibold text-lg text-[#342824] dark:text-foreground">
                                {tpl.name}
                              </h4>
                              {tpl.isPublished ? (
                                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 text-[10px] font-semibold">
                                  Published
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-amber-800 bg-amber-50 dark:bg-amber-950/40 border-amber-200 text-[10px] font-semibold">
                                  Draft (Unpublished)
                                </Badge>
                              )}
                              {hasTestItems && (
                                <Badge variant="outline" className="bg-amber-100/70 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 text-[10px] font-semibold">
                                  Test Content (Temporary Inventory)
                                </Badge>
                              )}
                            </div>
                            <span className="font-mono text-[11px] text-[#756861] dark:text-muted-foreground block mt-0.5">
                              /{tpl.slug} · {tpl.jewelleryType} · {tpl.wristMm / 10} cm wrist
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEditTemplate(tpl)}
                              className="h-8 w-8 p-0 text-[#756861] hover:text-[#B66F72]"
                              title="Edit Template"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeletingTemplateSlug(tpl.slug)}
                              className="h-8 w-8 p-0 text-[#756861] hover:text-rose-600"
                              title="Delete Template"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {tpl.thumbnailUrl && (
                          <div className="w-full h-32 rounded-xl overflow-hidden bg-stone-100 dark:bg-muted mb-3 border border-[#E6D8D0]/60 relative">
                            <img
                              src={getAssetUrl(tpl.thumbnailUrl.trim())}
                              alt={tpl.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}

                        {tpl.description && (
                          <p className="text-xs text-[#756861] dark:text-muted-foreground mb-3 line-clamp-2">
                            {tpl.description}
                          </p>
                        )}

                        {/* Bead Sequence Visual Preview */}
                        <div className="my-3">
                          <span className="text-[11px] font-semibold text-[#756861] uppercase tracking-wider block mb-1.5">
                            Arrangement Sequence ({beadCount} beads):
                          </span>
                          <div className="flex flex-wrap items-center gap-1 p-2 rounded-xl bg-stone-50 dark:bg-muted/30 border border-[#E6D8D0]/60 max-h-24 overflow-y-auto">
                            {tpl.beadSequence?.map((b, idx) => {
                              const material = materials.find((m) =>
                                m.variants.some((v) => v.sku === b.variantSku)
                              );
                              const variant = material?.variants.find((v) => v.sku === b.variantSku);
                              const app = getBeadAppearance({
                                variantSku: b.variantSku,
                                displayName: b.displayName,
                                color: variant?.color,
                                finish: variant?.finish,
                                renderAssetUrl: material?.renderAssetUrl,
                                imageUrl: material?.imageUrl,
                              });

                              return (
                                <div
                                  key={idx}
                                  className={`w-5 h-5 rounded-full shrink-0 aspect-square flex items-center justify-center relative overflow-hidden ${
                                    app.imageSrc
                                      ? "shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                                      : "border border-black/15 shadow-xs"
                                  }`}
                                  style={{
                                    backgroundColor: app.imageSrc ? "transparent" : app.color,
                                  }}
                                  title={`#${idx + 1}: ${b.displayName} (${b.variantSku})`}
                                >
                                  {app.imageSrc ? (
                                    <img
                                      src={app.imageSrc}
                                      alt={b.displayName}
                                      className="w-full h-full object-cover rounded-full scale-125 pointer-events-none select-none"
                                      loading="lazy"
                                      onError={(e) => {
                                        const parent = e.currentTarget.parentElement;
                                        if (parent) {
                                          parent.style.backgroundColor = app.color;
                                          parent.classList.add("border", "border-black/15");
                                        }
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
                              );
                            })}
                          </div>
                        </div>

                        {/* Gemstones Breakdown */}
                        <div className="flex flex-wrap gap-1.5 my-2">
                          {Object.entries(beadCounts).map(([sku, item]) => (
                            <span
                              key={sku}
                              className="px-2 py-0.5 rounded-md bg-stone-100 dark:bg-muted text-[10px] text-stone-700 dark:text-stone-300 font-medium"
                            >
                              {item.name}: <strong>{item.count}</strong>
                            </span>
                          ))}
                          {charmCount > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-medium">
                              Charms: {charmCount}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 mt-3 border-t border-[#E6D8D0]/60 dark:border-border flex items-center justify-between text-xs">
                        <span className="text-[11px] text-[#756861] dark:text-muted-foreground">
                          Order: {tpl.sortOrder}
                          {hasTestItems && (
                            <span className="ml-2 text-amber-700 font-medium">
                              (Contains temporary TEST- items)
                            </span>
                          )}
                        </span>

                        <Button
                          size="sm"
                          variant={tpl.isPublished ? "outline" : "default"}
                          onClick={() => handleTogglePublishTemplate(tpl)}
                          className={
                            tpl.isPublished
                              ? "h-7 text-xs rounded-lg border-[#E6D8D0]"
                              : "h-7 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
                          }
                        >
                          {tpl.isPublished ? "Unpublish to Draft" : hasTestItems ? "Publish (Test Content)" : "Publish to Store"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
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
                      className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] bg-white text-xs capitalize"
                    >
                      {!componentTypes.some((t) => t.typeId === materialForm.materialType && t.isActive) && materialForm.materialType && (
                        <option value={materialForm.materialType}>
                          {materialForm.materialType} (Preserved / Inactive)
                        </option>
                      )}
                      {componentTypes
                        .filter((t) => t.isActive)
                        .map((t) => (
                          <option key={t.typeId} value={t.typeId}>
                            {t.displayName}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <ImageUploadField
                  label="Material Image (Optional)"
                  value={materialForm.imageUrl}
                  onChange={(url) => setMaterialForm({ ...materialForm, imageUrl: url })}
                  placeholder="e.g. /assets/materials/rose-quartz.jpg or https://..."
                  helpText="Upload a photo of this bead, stone, or charm (JPEG, PNG, WebP). Optional — if omitted, a branded name placeholder will be displayed."
                />

                <ImageUploadField
                  label="Transparent Render Image (Optional)"
                  value={materialForm.renderAssetUrl}
                  onChange={(url) => setMaterialForm({ ...materialForm, renderAssetUrl: url })}
                  placeholder="e.g. /assets/materials/rose-quartz-cutout.png or https://..."
                  helpText="Optional transparent PNG/WebP cutout of this material for 2D studio canvas and bespoke rendering"
                />

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
                  <Label>Eligible Studio Categories</Label>
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                    Select which independent Studio jewellery categories can use this material.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {studioCategories.length > 0 ? (
                      studioCategories.map((c) => {
                        const val = c.slug || c.id;
                        return (
                          <label key={c.id || c.slug} className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={materialForm.allowedJewelleryTypes.includes(val)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setMaterialForm({
                                    ...materialForm,
                                    allowedJewelleryTypes: [...materialForm.allowedJewelleryTypes, val],
                                  });
                                } else {
                                  setMaterialForm({
                                    ...materialForm,
                                    allowedJewelleryTypes: materialForm.allowedJewelleryTypes.filter((x) => x !== val),
                                  });
                                }
                              }}
                              className="accent-[#B66F72]"
                            />
                            <span>{c.name}</span>
                          </label>
                        );
                      })
                    ) : (
                      jewelleryTypes.map((t) => (
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
                          <span>{t.displayName}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <Label>Where can this material be selected?</Label>
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                    Visibility control: Choose which customer storefront interfaces can display this material for selection.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={materialForm.visibilityScopes.includes("studio")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMaterialForm({
                              ...materialForm,
                              visibilityScopes: [...materialForm.visibilityScopes, "studio"],
                            });
                          } else {
                            setMaterialForm({
                              ...materialForm,
                              visibilityScopes: materialForm.visibilityScopes.filter((x) => x !== "studio"),
                            });
                          }
                        }}
                        className="accent-[#B66F72]"
                      />
                      <span>Create Your Own Studio</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={materialForm.visibilityScopes.includes("bracelet_customization")}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMaterialForm({
                              ...materialForm,
                              visibilityScopes: [...materialForm.visibilityScopes, "bracelet_customization"],
                            });
                          } else {
                            setMaterialForm({
                              ...materialForm,
                              visibilityScopes: materialForm.visibilityScopes.filter((x) => x !== "bracelet_customization"),
                            });
                          }
                        }}
                        className="accent-[#B66F72]"
                      />
                      <span>Store Product Customization</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-[#E6D8D0]/60">
                  <Label>Variant Selection Policy</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className={`p-2.5 rounded-xl border cursor-pointer text-xs flex flex-col gap-1 transition-all ${
                      materialForm.selectionPolicy === "customer_selects_variant"
                        ? "border-[#B66F72] bg-[#FAF7F5] ring-1 ring-[#B66F72]"
                        : "border-[#E6D8D0] bg-white hover:bg-stone-50"
                    }`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selectionPolicy"
                          value="customer_selects_variant"
                          checked={materialForm.selectionPolicy === "customer_selects_variant"}
                          onChange={() => setMaterialForm({ ...materialForm, selectionPolicy: "customer_selects_variant" })}
                          className="accent-[#B66F72]"
                        />
                        <span className="font-semibold text-stone-800">Customer Selects</span>
                      </div>
                      <span className="text-[10px] text-stone-500">
                        Customer chooses specific variant (e.g. Small Blue, 8mm).
                      </span>
                    </label>

                    <label className={`p-2.5 rounded-xl border cursor-pointer text-xs flex flex-col gap-1 transition-all ${
                      materialForm.selectionPolicy === "seller_random_variant"
                        ? "border-[#B66F72] bg-[#FAF7F5] ring-1 ring-[#B66F72]"
                        : "border-[#E6D8D0] bg-white hover:bg-stone-50"
                    }`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="selectionPolicy"
                          value="seller_random_variant"
                          checked={materialForm.selectionPolicy === "seller_random_variant"}
                          onChange={() => setMaterialForm({ ...materialForm, selectionPolicy: "seller_random_variant" })}
                          className="accent-[#B66F72]"
                        />
                        <span className="font-semibold text-stone-800">Seller Random Assortment</span>
                      </div>
                      <span className="text-[10px] text-stone-500">
                        Pooled inventory; seller randomly allocates variant on packing.
                      </span>
                    </label>
                  </div>

                  {materialForm.selectionPolicy === "seller_random_variant" && (
                    <div className="space-y-1 pt-1">
                      <Label>Customer Explanation Note</Label>
                      <Input
                        placeholder="e.g. Gold or Silver finish will be randomly selected by our artisans."
                        value={materialForm.assortmentNotes}
                        onChange={(e) => setMaterialForm({ ...materialForm, assortmentNotes: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3]/50 dark:bg-muted/20 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={materialForm.isActive}
                      onChange={(e) => setMaterialForm({ ...materialForm, isActive: e.target.checked })}
                      className="accent-[#B66F72] h-4 w-4 rounded"
                    />
                    <div>
                      <span className="font-medium text-[#342824] dark:text-foreground">Active Material in Studio</span>
                      <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                        When active, this component and its active variants can be selected in custom designs and templates.
                      </p>
                    </div>
                  </label>
                </div>

                {editingMaterial && (editingMaterial.variants?.length || 0) > 0 && (
                  <div className="pt-2">
                    <label className="flex items-center gap-2 p-2.5 rounded-xl border border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={syncVariantSkus}
                        onChange={(e) => setSyncVariantSkus(e.target.checked)}
                        className="accent-[#B66F72] h-4 w-4 rounded"
                      />
                      <div>
                        <span className="font-medium text-[#342824] dark:text-foreground">
                          Sync Variant SKUs with Component Code ({materialForm.code || "Code"})
                        </span>
                        <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                          Automatically updates all stocked variants' SKUs to match this compound code prefix.
                        </p>
                      </div>
                    </label>
                  </div>
                )}
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
                    <div className="flex items-center justify-between">
                      <Label>Variant SKU</Label>
                      <button
                        type="button"
                        onClick={() => {
                          const cleanSize = (variantForm.sizeLabel || "STD").trim().toUpperCase().replace(/\s+/g, "");
                          setVariantForm({
                            ...variantForm,
                            sku: `${selectedMaterialForVariant.code}-${cleanSize}`,
                          });
                        }}
                        className="text-[10px] text-[#B66F72] hover:underline flex items-center gap-1 font-medium"
                        title="Auto-fill SKU from compound code and size"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Sync with Code
                      </button>
                    </div>
                    <Input
                      placeholder="e.g. RQ-8MM-GLOSS"
                      value={variantForm.sku}
                      onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value.toUpperCase() })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Size Label</Label>
                    <Input
                      placeholder="e.g. 8mm or Medium"
                      value={variantForm.sizeLabel}
                      onChange={(e) => {
                        const newSize = e.target.value;
                        if (!editingVariantSku && (!variantForm.sku || variantForm.sku.startsWith(`${selectedMaterialForVariant.code}-`))) {
                          const cleanSize = newSize.trim().toUpperCase().replace(/\s+/g, "");
                          setVariantForm({
                            ...variantForm,
                            sizeLabel: newSize,
                            sku: `${selectedMaterialForVariant.code}-${cleanSize}`,
                          });
                        } else {
                          setVariantForm({ ...variantForm, sizeLabel: newSize });
                        }
                      }}
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

                <div className="space-y-3 pt-2 border-t border-[#E6D8D0]/60">
                  <div className="space-y-1">
                    <Label>Variant Display Image (Optional)</Label>
                    <Input
                      placeholder="e.g. /uploads/variant-blue-butterfly.jpg or https://..."
                      value={variantForm.imageUrl}
                      onChange={(e) => setVariantForm({ ...variantForm, imageUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                    <span className="text-[10px] text-stone-500">
                      Overrides the parent photo in the material picker for this specific variant.
                    </span>
                  </div>

                  <div className="space-y-1">
                    <Label>Variant Transparent Render Asset (PNG / WebP)</Label>
                    <Input
                      placeholder="e.g. /uploads/variant-blue-butterfly-render.png"
                      value={variantForm.renderAssetUrl}
                      onChange={(e) => setVariantForm({ ...variantForm, renderAssetUrl: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                    <span className="text-[10px] text-stone-500">
                      Transparent cut-out used on the 2D bracelet canvas hanging directly from the jump ring.
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3]/50 dark:bg-muted/20 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={variantForm.isActive}
                      onChange={(e) => setVariantForm({ ...variantForm, isActive: e.target.checked })}
                      className="accent-[#B66F72] h-4 w-4 rounded"
                    />
                    <div>
                      <span className="font-medium text-[#342824] dark:text-foreground">Active SKU Variant</span>
                      <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                        Active variants are available for selection in customer bracelet designs and quote calculations.
                      </p>
                    </div>
                  </label>
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
              <AlertDialogTitle className="font-playfair text-lg">Deactivate Component Variant?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861]">
                Deactivating SKU "{disablingVariant?.sku}" prevents it from being selected in new custom designs. It remains preserved for existing design quote history.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDisableVariant}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-xl"
              >
                Deactivate Variant
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* DIALOG: CONFIRM DELETE VARIANT */}
        <AlertDialog open={!!deletingVariant} onOpenChange={(open) => !open && setDeletingVariant(null)}>
          <AlertDialogContent className="rounded-2xl border border-[#E6D8D0] bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg text-rose-700">Delete SKU Variant?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861] space-y-2">
                <p>
                  Are you sure you want to permanently delete SKU variant{" "}
                  <span className="font-mono font-bold text-stone-800">"{deletingVariant?.sku}"</span> for material{" "}
                  <strong className="text-stone-800">{deletingVariant?.materialName}</strong>? This will permanently remove
                  this variant if it has no historical orders or active references.
                </p>
                <p className="text-[11px] text-stone-500">
                  Variants referenced in historical orders cannot be deleted and should be deactivated instead.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDeleteVariant}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-xl"
              >
                Delete SKU
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* DIALOG: VARIANT DELETION BLOCKED (HISTORICAL ORDERS / REFERENCES) */}
        <AlertDialog open={!!variantBlockedDialog} onOpenChange={(open) => !open && setVariantBlockedDialog(null)}>
          <AlertDialogContent className="rounded-2xl border border-amber-200 bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Permanent Deletion Unavailable
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861] space-y-3">
                <p className="text-stone-800 font-medium">{variantBlockedDialog?.message}</p>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                  <strong>Safe Alternative:</strong> Deactivating SKU{" "}
                  <span className="font-mono font-bold">"{variantBlockedDialog?.sku}"</span> prevents it from being selected
                  in any new customer orders or Studio designs, while preserving historical order details.
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="text-xs rounded-xl">Dismiss</AlertDialogCancel>
              <Button
                onClick={handleDeactivateFromBlockedDialog}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-xl flex items-center gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Deactivate Variant Instead</span>
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* DIALOG: COMPONENT TYPE DELETION BLOCKED */}
        <AlertDialog open={!!typeBlockedDialog} onOpenChange={(open) => !open && setTypeBlockedDialog(null)}>
          <AlertDialogContent className="rounded-2xl border border-amber-200 bg-white">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Cannot Delete Component Type
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861] space-y-3">
                <p className="text-stone-800">{typeBlockedDialog?.message}</p>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                  <strong>Recommended:</strong> Deactivate{" "}
                  <strong>{typeBlockedDialog?.displayName}</strong> to hide it from material creation while keeping existing materials intact.
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="text-xs rounded-xl">Close</AlertDialogCancel>
              <Button
                onClick={handleDeactivateFromTypeBlockedDialog}
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-xl flex items-center gap-1.5"
              >
                <EyeOff className="w-3.5 h-3.5" />
                <span>Deactivate Type Instead</span>
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MODAL: COMPONENT TYPES MANAGEMENT */}
        {showComponentTypeModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-[#E6D8D0] dark:border-border">
                <div>
                  <h3 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
                    Component Types Management
                  </h3>
                  <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                    Manage component categories (Bead, Stone, Charm, etc.) used across Shared Materials and Studio.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowComponentTypeModal(false);
                    setEditingComponentTypeId(null);
                  }}
                  className="h-8 w-8 p-0 rounded-full"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Add New Component Type Form */}
              <div className="mt-5 p-4 rounded-xl bg-[#FBF7F3] dark:bg-muted/20 border border-[#E6D8D0] dark:border-border space-y-3">
                <span className="text-xs font-semibold text-[#756861] uppercase tracking-wider block">
                  Add New Component Type
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Display Name (e.g. "Connector")</Label>
                    <Input
                      placeholder="e.g. Connector, Tassel, Wire"
                      value={newTypeForm.displayName}
                      onChange={(e) => {
                        const val = e.target.value;
                        const autoId = val.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
                        setNewTypeForm({
                          ...newTypeForm,
                          displayName: val,
                          typeId: autoId,
                        });
                      }}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Internal Identifier (Immutable once saved)</Label>
                    <Input
                      placeholder="e.g. connector"
                      value={newTypeForm.typeId}
                      onChange={(e) =>
                        setNewTypeForm({
                          ...newTypeForm,
                          typeId: e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_"),
                        })
                      }
                      className="h-9 text-xs font-mono lowercase"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-[#756861]">
                    Newly added types become available immediately in filters and material creation.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleSaveComponentType}
                    className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs h-8 px-3 rounded-lg flex items-center gap-1 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Type</span>
                  </Button>
                </div>
              </div>

              {/* Component Types List */}
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#756861] uppercase tracking-wider">
                    Existing Types ({componentTypes.length})
                  </span>
                  <span className="text-[11px] text-[#756861]">
                    Types in use cannot be permanently deleted, but can be safely deactivated.
                  </span>
                </div>

                {loadingComponentTypes ? (
                  <div className="py-8 text-center text-xs text-[#756861]">Loading component types...</div>
                ) : componentTypes.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#756861]">No component types found.</div>
                ) : (
                  <div className="border border-[#E6D8D0] dark:border-border rounded-xl overflow-hidden divide-y divide-[#E6D8D0]/60 dark:divide-border/60">
                    {componentTypes.map((t) => (
                      <div
                        key={t.typeId}
                        className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-white dark:bg-card hover:bg-stone-50/50 ${
                          !t.isActive ? "opacity-60 bg-stone-50/30" : ""
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {editingComponentTypeId === t.typeId ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={editingDisplayName}
                                onChange={(e) => setEditingDisplayName(e.target.value)}
                                className="h-7 text-xs w-40"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUpdateComponentType(t.typeId, editingDisplayName)}
                                className="h-7 w-7 p-0 text-emerald-700 hover:bg-emerald-50"
                                title="Save display name"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditingComponentTypeId(null)}
                                className="h-7 w-7 p-0 text-stone-400 hover:bg-stone-100"
                                title="Cancel edit"
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#342824] dark:text-foreground text-sm">
                                {t.displayName}
                              </span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingComponentTypeId(t.typeId);
                                  setEditingDisplayName(t.displayName);
                                }}
                                className="h-6 w-6 p-0 text-stone-400 hover:text-stone-700"
                                title="Edit display name"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}

                          <Badge variant="outline" className="font-mono text-[10px] lowercase text-[#B99A72] border-[#B99A72]/30">
                            {t.typeId}
                          </Badge>

                          {(t.materialCount ?? 0) > 0 ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {t.materialCount} {t.materialCount === 1 ? "material" : "materials"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-stone-400 border-stone-200">
                              Unused
                            </Badge>
                          )}

                          {t.isActive ? (
                            <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-rose-700 border-rose-300 bg-rose-50">
                              Inactive
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleComponentTypeActive(t)}
                            className={`h-7 px-2 text-xs flex items-center gap-1 ${
                              t.isActive
                                ? "text-stone-500 hover:text-amber-700 hover:bg-amber-50"
                                : "text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                            }`}
                            title={t.isActive ? "Deactivate type" : "Activate type"}
                          >
                            {t.isActive ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{t.isActive ? "Deactivate" : "Activate"}</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteComponentType(t)}
                            className="h-7 w-7 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Delete type"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-[#E6D8D0] flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowComponentTypeModal(false)}
                  className="rounded-xl text-xs"
                >
                  Done
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* MODAL: ADD / EDIT JEWELLERY CATEGORY */}
        {showTypeModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="max-w-lg w-full bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-[#E6D8D0] dark:border-border">
                <div>
                  <h3 className="font-playfair text-xl font-semibold">
                    {editingType ? "Edit Jewellery Category" : "Add Jewellery Category"}
                  </h3>
                  <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                    {editingType
                      ? `Update configuration for ${editingType.displayName}`
                      : "Introduce a new bespoke jewellery category to the studio"}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowTypeModal(false)} className="h-7 w-7 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4 pt-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Category Identifier (Slug)</Label>
                    <Input
                      placeholder="e.g. kundan_earrings"
                      value={typeForm.slug}
                      disabled={!!editingType}
                      onChange={(e) =>
                        setTypeForm({ ...typeForm, slug: e.target.value.toLowerCase().replace(/\s+/g, "_") })
                      }
                    />
                    <span className="text-[10px] text-muted-foreground">Unique system key</span>
                  </div>

                  <div className="space-y-1">
                    <Label>Display Name</Label>
                    <Input
                      placeholder="e.g. Kundan Stone Earrings"
                      value={typeForm.displayName}
                      onChange={(e) => setTypeForm({ ...typeForm, displayName: e.target.value })}
                    />
                    <span className="text-[10px] text-muted-foreground">Customer-facing title</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Description</Label>
                  <textarea
                    rows={2}
                    value={typeForm.description}
                    onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                    className="w-full p-2 rounded-lg border border-[#E6D8D0] dark:border-border text-xs bg-white dark:bg-background"
                    placeholder="Artisanal description of this bespoke category..."
                  />
                </div>

                <ImageUploadField
                  label="Category Image"
                  value={typeForm.imageUrl}
                  onChange={(url) => setTypeForm({ ...typeForm, imageUrl: url })}
                  placeholder="e.g. /assets/categories/earrings.jpg or https://..."
                  helpText="Upload a featured photo representing this bespoke category (JPEG, PNG, WebP)"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Display Order</Label>
                    <Input
                      type="number"
                      value={typeForm.displayOrder}
                      onChange={(e) => setTypeForm({ ...typeForm, displayOrder: Number(e.target.value) })}
                    />
                    <span className="text-[10px] text-muted-foreground">Lower numbers appear first</span>
                  </div>

                  <div className="space-y-1">
                    <Label>Designer Status</Label>
                    <select
                      value={typeForm.designerStatus}
                      onChange={(e) =>
                        setTypeForm({ ...typeForm, designerStatus: e.target.value as any })
                      }
                      className="w-full h-9 px-3 rounded-lg border border-[#E6D8D0] dark:border-border bg-white dark:bg-background text-xs"
                    >
                      <option value="available">Available</option>
                      <option value="coming_soon">Coming Soon</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Supported Construction Types (comma-separated)</Label>
                  <Input
                    placeholder="e.g. elastic_bead, wire_wrap, kundan_setting"
                    value={typeForm.supportedConstructionTypes}
                    onChange={(e) => setTypeForm({ ...typeForm, supportedConstructionTypes: e.target.value })}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Comma separated identifiers: elastic_bead, wire_wrap, kundan_setting, link_chain
                  </span>
                </div>

                <div className="pt-2 border-t border-[#E6D8D0]/60 dark:border-border/60">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={typeForm.isPublished}
                      onChange={(e) => setTypeForm({ ...typeForm, isPublished: e.target.checked })}
                      className="w-4 h-4 rounded accent-[#B66F72]"
                    />
                    <div>
                      <span className="font-semibold block">Publish to Customer Studio</span>
                      <span className="text-[11px] text-[#756861] dark:text-muted-foreground block">
                        When unpublished, customers cannot view or browse this category.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-6 mt-4 border-t border-[#E6D8D0] dark:border-border">
                <Button variant="outline" size="sm" onClick={() => setShowTypeModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveType} className="bg-[#B66F72] hover:bg-[#95565A] text-white">
                  {editingType ? "Save Changes" : "Create Category"}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* DIALOG: CONFIRM DELETE CATEGORY */}
        <AlertDialog open={!!deletingTypeSlug} onOpenChange={(open) => !open && setDeletingTypeSlug(null)}>
          <AlertDialogContent className="rounded-2xl border border-[#E6D8D0] bg-white dark:bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg text-rose-700">
                Delete Jewellery Category?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861] dark:text-muted-foreground space-y-2">
                <p>
                  Permanently deleting category <strong className="font-mono">{deletingTypeSlug}</strong> removes it from the studio catalogue.
                </p>
                {categoryConflictMsg && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mt-2">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Deletion Blocked (Integrity Safeguard)</span>
                    </div>
                    <p>{categoryConflictMsg}</p>
                    <p className="mt-2 text-[11px] text-amber-700 font-medium">
                      Recommended: Archive this category instead to hide it safely without breaking existing customer designs or orders.
                    </p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
              {categoryConflictMsg ? (
                <Button
                  onClick={() => {
                    if (deletingTypeSlug) handleArchiveType(deletingTypeSlug);
                    setDeletingTypeSlug(null);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-xl"
                >
                  Archive Category Instead
                </Button>
              ) : (
                <AlertDialogAction
                  onClick={handleDeleteType}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-xl"
                >
                  Delete Category
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* DIALOG: CONFIRM DELETE MATERIAL */}
        <AlertDialog open={!!deletingMaterial} onOpenChange={(open) => !open && setDeletingMaterial(null)}>
          <AlertDialogContent className="rounded-2xl border border-[#E6D8D0] bg-white dark:bg-card">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-lg text-rose-700">
                Delete Shared Material?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-[#756861] dark:text-muted-foreground space-y-2">
                <p>
                  Permanently deleting material <strong className="font-semibold">{deletingMaterial?.name}</strong> (<span className="font-mono">{deletingMaterial?.code}</span>) and its SKU variants.
                </p>
                {materialConflictMsg && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs mt-2">
                    <div className="flex items-center gap-1.5 font-semibold text-amber-800 mb-1">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <span>Deletion Blocked (Integrity Safeguard)</span>
                    </div>
                    <p>{materialConflictMsg}</p>
                    <p className="mt-2 text-[11px] text-amber-700 font-medium">
                      Recommended: Set this material to "Inactive" so it is hidden from future designs while historical records remain intact.
                    </p>
                  </div>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
              {materialConflictMsg ? (
                <Button
                  onClick={async () => {
                    if (deletingMaterial) {
                      try {
                        await apiRequest("PATCH", `/api/v1/studio/admin/materials/${deletingMaterial._id || (deletingMaterial as any).id}`, {
                          isActive: false,
                        });
                        toast({ title: "Material Deactivated", description: `${deletingMaterial.name} is now inactive.` });
                        fetchMaterials(false);
                      } catch (err: any) {
                        toast({ title: "Deactivate Failed", description: err.message, variant: "destructive" });
                      }
                    }
                    setDeletingMaterial(null);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs rounded-xl"
                >
                  Deactivate Material Instead
                </Button>
              ) : (
                <AlertDialogAction
                  onClick={handleDeleteMaterial}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-xl"
                >
                  Delete Material
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* MODAL: ADD / EDIT DESIGN TEMPLATE */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <Card className="max-w-2xl w-full bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] shadow-xl p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 border-b border-[#E6D8D0]">
                <div>
                  <h3 className="font-playfair text-xl font-semibold">
                    {editingTemplate ? "Edit Design Template" : "Create Starter Design Template"}
                  </h3>
                  <p className="text-xs text-[#756861] mt-0.5">
                    Define an artisan-curated base arrangement for the Create Your Own Studio
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setShowTemplateModal(false)} className="h-7 w-7 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Template Name *</Label>
                    <Input
                      value={templateForm.name}
                      onChange={(e) => {
                        const newName = e.target.value;
                        setTemplateForm((prev) => ({
                          ...prev,
                          name: newName,
                          slug: editingTemplate
                            ? prev.slug
                            : newName
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/^-+|-+$/g, ""),
                        }));
                      }}
                      placeholder="e.g. Triple Protection Harmony"
                      className="text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Slug (URL Identifier) *</Label>
                    <Input
                      value={templateForm.slug}
                      onChange={(e) =>
                        setTemplateForm({
                          ...templateForm,
                          slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
                        })
                      }
                      placeholder="e.g. triple-protection-harmony"
                      className="text-xs rounded-xl font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Jewellery Category</Label>
                    <select
                      value={templateForm.jewelleryType}
                      onChange={(e) => setTemplateForm({ ...templateForm, jewelleryType: e.target.value as "bracelet" })}
                      className="w-full text-xs rounded-xl border border-[#E6D8D0] bg-[#FBF7F3] dark:bg-background h-9 px-3"
                    >
                      {jewelleryTypes.map((t) => (
                        <option key={t.slug} value={t.slug}>
                          {t.displayName} ({t.slug})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Target Wrist Size (mm)</Label>
                    <Input
                      type="number"
                      value={templateForm.wristMm}
                      onChange={(e) => setTemplateForm({ ...templateForm, wristMm: Number(e.target.value) })}
                      min={100}
                      max={300}
                      step={5}
                      className="text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Display Sort Order</Label>
                    <Input
                      type="number"
                      value={templateForm.sortOrder}
                      onChange={(e) => setTemplateForm({ ...templateForm, sortOrder: Number(e.target.value) })}
                      className="text-xs rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Description</Label>
                  <Input
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                    placeholder="Short description of the arrangement, symbolism, or recommended wrist fit..."
                    className="text-xs rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold">Product Showcase Image (Optional)</Label>
                    {templateForm.beadSequence.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const firstBeadWithImg = templateForm.beadSequence.find((b) => b.imageUrl);
                          if (firstBeadWithImg?.imageUrl) {
                            setTemplateForm((prev) => ({ ...prev, thumbnailUrl: firstBeadWithImg.imageUrl }));
                          }
                        }}
                        className="text-[11px] text-[#B66F72] hover:underline"
                      >
                        Auto-fill from Gemstones
                      </button>
                    )}
                  </div>
                  <ImageUploadField
                    label=""
                    value={templateForm.thumbnailUrl}
                    onChange={(url) => setTemplateForm({ ...templateForm, thumbnailUrl: url })}
                    placeholder="e.g. https://... or /assets/bracelets/harmony.jpg"
                    helpText="Upload a showcase photo or leave empty to auto-render canvas"
                  />
                  <p className="text-[11px] text-[#756861] dark:text-muted-foreground mt-1">
                    Provide a product showcase photo, or leave blank to automatically render a live circular gemstone arrangement preview.
                  </p>
                </div>

                {/* Bead Sequence Builder Section */}
                <div className="p-4 rounded-xl border border-[#E6D8D0] bg-stone-50/50 dark:bg-muted/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-bold text-[#342824] dark:text-foreground">
                        Bead Sequence Arrangement ({templateForm.beadSequence.length} beads)
                      </Label>
                      <p className="text-[11px] text-[#756861] mt-0.5">
                        Approximate length: {templateForm.beadSequence.length * 8} mm (target: {templateForm.wristMm} mm)
                      </p>
                    </div>

                    {templateForm.beadSequence.length > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleClearBeadSequence}
                        className="text-rose-600 hover:text-rose-700 text-xs h-7 px-2"
                      >
                        Clear Arrangement
                      </Button>
                    )}
                  </div>

                  {/* Gemstone Palette Selector */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                    <select
                      value={selectedBeadSkuForTemplate}
                      onChange={(e) => setSelectedBeadSkuForTemplate(e.target.value)}
                      className="flex-1 text-xs rounded-xl border border-[#E6D8D0] bg-white dark:bg-background h-9 px-3"
                    >
                      {materials
                        .flatMap((m) => m.variants.map((v) => ({ material: m, variant: v })))
                        .filter((item) => item.variant.isActive && item.material.isActive)
                        .map(({ material, variant }) => (
                          <option key={variant.sku} value={variant.sku}>
                            {material.name} - {variant.sizeLabel} ({variant.sku})
                          </option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <select
                        value={beadAddCount}
                        onChange={(e) => setBeadAddCount(Number(e.target.value))}
                        className="text-xs rounded-xl border border-[#E6D8D0] bg-white dark:bg-background h-9 px-3"
                      >
                        <option value={1}>1 Bead</option>
                        <option value={2}>2 Beads</option>
                        <option value={3}>3 Beads</option>
                        <option value={4}>4 Beads</option>
                        <option value={7}>7 Beads</option>
                        <option value={10}>10 Beads</option>
                        <option value={20}>20 Beads</option>
                      </select>

                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddBeadsToTemplate}
                        className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl h-9 px-3 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Add Bead(s)
                      </Button>
                    </div>
                  </div>

                  {/* Visual Arrangement Preview Row */}
                  {templateForm.beadSequence.length === 0 ? (
                    <div className="py-6 text-center text-xs text-[#756861] border border-dashed border-[#E6D8D0] rounded-xl bg-white dark:bg-card">
                      No beads added yet. Select a gemstone above and click "Add Bead(s)".
                    </div>
                  ) : (
                    <div className="p-3 rounded-xl bg-white dark:bg-card border border-[#E6D8D0] max-h-36 overflow-y-auto space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {templateForm.beadSequence.map((b, idx) => {
                          const material = materials.find((m) =>
                            m.variants.some((v) => v.sku === b.variantSku)
                          );
                          const variant = material?.variants.find((v) => v.sku === b.variantSku);
                          const app = getBeadAppearance({
                            variantSku: b.variantSku,
                            displayName: b.displayName,
                            color: variant?.color,
                            finish: variant?.finish,
                            renderAssetUrl: material?.renderAssetUrl,
                            imageUrl: material?.imageUrl,
                          });

                          return (
                            <div
                              key={idx}
                              className="group relative flex items-center justify-center shrink-0 w-7 h-7"
                              title={`#${idx + 1}: ${b.displayName} (${b.variantSku})`}
                            >
                              <div
                                className={`w-7 h-7 rounded-full overflow-hidden shrink-0 aspect-square flex items-center justify-center relative cursor-pointer ${
                                  app.imageSrc
                                    ? "shadow-[0_1px_2px_rgba(0,0,0,0.18)]"
                                    : "border border-black/15 shadow-xs"
                                }`}
                                style={{
                                  backgroundColor: app.imageSrc ? "transparent" : app.color,
                                }}
                              >
                                {app.imageSrc ? (
                                  <img
                                    src={app.imageSrc}
                                    alt={b.displayName}
                                    className="w-full h-full object-cover rounded-full scale-125 pointer-events-none select-none"
                                    loading="lazy"
                                    onError={(e) => {
                                      const parent = e.currentTarget.parentElement;
                                      if (parent) {
                                        parent.style.backgroundColor = app.color;
                                        parent.classList.add("border", "border-black/15");
                                      }
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
                              <button
                                type="button"
                                onClick={() => handleRemoveBeadAt(idx)}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold z-10 shadow-xs hover:bg-rose-700"
                                title="Remove bead"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Publication Status Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-[#E6D8D0] bg-stone-50/50 dark:bg-muted/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateForm.isPublished}
                      onChange={(e) => setTemplateForm({ ...templateForm, isPublished: e.target.checked })}
                      className="accent-[#B66F72] mt-0.5 rounded"
                    />
                    <div>
                      <span className="text-xs font-semibold text-[#342824] dark:text-foreground block">
                        Publish Immediately to Studio
                      </span>
                      <span className="text-[11px] text-[#756861] dark:text-muted-foreground block mt-0.5">
                        Leave unchecked to save as a Draft. Note: Publishing will make this template visible to visitors in the Create Your Own Studio. If using temporary TEST- materials, unpublish or delete before store launch.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-6 mt-4 border-t border-[#E6D8D0]">
                <Button variant="outline" size="sm" onClick={() => setShowTemplateModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveTemplate} className="bg-[#B66F72] hover:bg-[#95565A] text-white">
                  Save Template
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* DIALOG: DELETE DESIGN TEMPLATE */}
        {deletingTemplateSlug && (
          <AlertDialog open={Boolean(deletingTemplateSlug)} onOpenChange={() => setDeletingTemplateSlug(null)}>
            <AlertDialogContent className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-playfair text-lg text-[#342824] dark:text-foreground">
                  Delete Design Template?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs text-[#756861] dark:text-muted-foreground">
                  Are you sure you want to permanently delete template <code className="font-mono font-semibold">{deletingTemplateSlug}</code>? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-xs rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteTemplate}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-xl"
                >
                  Delete Template
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </main>

      <Footer />
    </div>
  );
}

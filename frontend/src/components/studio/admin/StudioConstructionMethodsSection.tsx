import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import ImageUploadField from "@/components/ImageUploadField";
import {
  fetchConstructionMethods,
  createConstructionMethod,
  updateConstructionMethod,
  deleteConstructionMethod,
  fetchStudioCategories,
  assignMethodToSubcategory,
  removeMethodFromSubcategory,
  fetchSubcategoriesForMethod,
  syncMethodSubcategories,
  fetchComponentTypes,
  IStudioComponentType,
} from "@/lib/studio/independentStudioApi";
import type {
  IStudioConstructionMethod,
  IStudioCategory,
  PhysicalSpecsConfig,
  EndpointConfig,
} from "@/types/studio.types";
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Layers,
  ChevronRight,
  Eye,
  EyeOff,
  AlertCircle,
  HelpCircle,
  Settings2,
  Sliders,
  CheckCircle2,
} from "lucide-react";

const BASE_TYPES = [
  { value: "elastic_thread", label: "Elastic Thread (Continuous Loop)" },
  { value: "memory_wire", label: "Memory Wire (Rigid Pre-formed Loop)" },
  { value: "clasp_extension", label: "Clasp & Extension Chain" },
  { value: "wire_wrap", label: "Wire Wrapped / Flexible Cord" },
  { value: "chain", label: "Chain Link" },
  { value: "other", label: "Other Construction" },
];

export const StudioConstructionMethodsSection: React.FC = () => {
  const { toast } = useToast();
  const [methods, setMethods] = useState<IStudioConstructionMethod[]>([]);
  const [categories, setCategories] = useState<IStudioCategory[]>([]);
  const [componentTypes, setComponentTypes] = useState<IStudioComponentType[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    imageUrl: "",
    baseMaterialType: "elastic_thread",
    displayOrder: 0,
    isActive: true,
    isPublished: true,
    allowedComponentRoles: [] as string[],
    selectedSubcategoryIds: [] as string[],
    // Physical Specs (Nullable, starts blank)
    cordDiameterMm: null as number | null,
    chainLengthMm: null as number | null,
    wireThicknessMm: null as number | null,
    innerDiameterMm: null as number | null,
    turnsCount: null as number | null,
    beadableLengthMm: null as number | null,
    // Endpoints
    endpointAVisible: false,
    endpointASelectable: false,
    endpointARequired: false,
    endpointALabel: "End A Finish",
    endpointBVisible: false,
    endpointBSelectable: false,
    endpointBRequired: false,
    endpointBLabel: "End B Finish",
  });

  const subcategories = categories.filter((c) => Boolean(c.parentId));

  const getCategoryBreadcrumb = (subcat: IStudioCategory) => {
    const parent = categories.find((c) => c.id === subcat.parentId);
    return parent ? `${parent.name} › ${subcat.name}` : subcat.name;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedMethods, flatCategories, fetchedTypes] = await Promise.all([
        fetchConstructionMethods(false),
        fetchStudioCategories(false),
        fetchComponentTypes(true),
      ]);
      setMethods(fetchedMethods);
      setCategories(flatCategories);
      setComponentTypes(fetchedTypes);
    } catch (err: any) {
      toast({
        title: "Failed to load construction methods",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      imageUrl: "",
      baseMaterialType: "elastic_thread",
      displayOrder: methods.length + 1,
      isActive: true,
      isPublished: true,
      allowedComponentRoles: [],
      selectedSubcategoryIds: [],
      cordDiameterMm: null,
      chainLengthMm: null,
      wireThicknessMm: null,
      innerDiameterMm: null,
      turnsCount: null,
      beadableLengthMm: null,
      endpointAVisible: false,
      endpointASelectable: false,
      endpointARequired: false,
      endpointALabel: "End A Finish",
      endpointBVisible: false,
      endpointBSelectable: false,
      endpointBRequired: false,
      endpointBLabel: "End B Finish",
    });
    setShowForm(true);
  };

  const handleOpenEdit = (method: IStudioConstructionMethod) => {
    setEditingId(method.id);
    const specs = method.physicalSpecsConfig || {};
    const endA = method.endpointAConfig || ({} as EndpointConfig);
    const endB = method.endpointBConfig || ({} as EndpointConfig);
    const initialSubcategoryIds = method.subcategoryIds || method.assignedSubcategories?.map((s) => s.id) || [];

    setFormData({
      name: method.name,
      slug: method.slug,
      description: method.description || "",
      imageUrl: method.imageUrl || "",
      baseMaterialType: method.baseMaterialType || "elastic_thread",
      displayOrder: method.displayOrder || 0,
      isActive: method.isActive,
      isPublished: method.isPublished,
      allowedComponentRoles: method.allowedComponentRoles || [],
      selectedSubcategoryIds: initialSubcategoryIds,
      cordDiameterMm: specs.cordDiameterMm ?? null,
      chainLengthMm: specs.chainLengthMm ?? null,
      wireThicknessMm: specs.wireThicknessMm ?? null,
      innerDiameterMm: specs.innerDiameterMm ?? null,
      turnsCount: specs.turnsCount ?? null,
      beadableLengthMm: specs.beadableLengthMm ?? null,
      endpointAVisible: endA.visible ?? false,
      endpointASelectable: endA.isCustomerSelectable ?? false,
      endpointARequired: endA.isSelectionRequired ?? false,
      endpointALabel: endA.label || "End A Finish",
      endpointBVisible: endB.visible ?? false,
      endpointBSelectable: endB.isCustomerSelectable ?? false,
      endpointBRequired: endB.isSelectionRequired ?? false,
      endpointBLabel: endB.label || "End B Finish",
    });

    // Also fetch the latest authoritative assignments from backend
    fetchSubcategoriesForMethod(method.id)
      .then((res) => {
        if (res?.subcategoryIds) {
          setFormData((prev) => ({ ...prev, selectedSubcategoryIds: res.subcategoryIds }));
        }
      })
      .catch(() => {});

    setShowForm(true);
  };

  const handleToggleSubcategory = (subcategoryId: string) => {
    setFormData((prev) => {
      const exists = prev.selectedSubcategoryIds.includes(subcategoryId);
      return {
        ...prev,
        selectedSubcategoryIds: exists
          ? prev.selectedSubcategoryIds.filter((id) => id !== subcategoryId)
          : [...prev.selectedSubcategoryIds, subcategoryId],
      };
    });
  };

  const handleToggleRole = (role: string) => {
    setFormData((prev) => {
      const exists = prev.allowedComponentRoles.includes(role);
      return {
        ...prev,
        allowedComponentRoles: exists
          ? prev.allowedComponentRoles.filter((r) => r !== role)
          : [...prev.allowedComponentRoles, role],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    const payload: Partial<IStudioConstructionMethod> = {
      name: formData.name.trim(),
      slug: formData.slug.trim() || formData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      description: formData.description.trim() || null,
      imageUrl: formData.imageUrl || null,
      baseMaterialType: formData.baseMaterialType,
      displayOrder: Number(formData.displayOrder) || 0,
      isActive: formData.isActive,
      isPublished: formData.isPublished,
      allowedComponentRoles: formData.allowedComponentRoles,
      physicalSpecsConfig: {
        cordDiameterMm: formData.cordDiameterMm !== null && !isNaN(Number(formData.cordDiameterMm)) ? Number(formData.cordDiameterMm) : null,
        chainLengthMm: formData.chainLengthMm !== null && !isNaN(Number(formData.chainLengthMm)) ? Number(formData.chainLengthMm) : null,
        wireThicknessMm: formData.wireThicknessMm !== null && !isNaN(Number(formData.wireThicknessMm)) ? Number(formData.wireThicknessMm) : null,
        innerDiameterMm: formData.innerDiameterMm !== null && !isNaN(Number(formData.innerDiameterMm)) ? Number(formData.innerDiameterMm) : null,
        turnsCount: formData.turnsCount !== null && !isNaN(Number(formData.turnsCount)) ? Number(formData.turnsCount) : null,
        beadableLengthMm: formData.beadableLengthMm !== null && !isNaN(Number(formData.beadableLengthMm)) ? Number(formData.beadableLengthMm) : null,
      },
      endpointAConfig: {
        visible: formData.endpointAVisible,
        hasAssembly: formData.endpointAVisible,
        isCustomerSelectable: formData.endpointASelectable,
        isSelectionRequired: formData.endpointARequired,
        label: formData.endpointALabel,
        allowedRoles: ["charm", "end_cap", "bead"],
      },
      endpointBConfig: {
        visible: formData.endpointBVisible,
        hasAssembly: formData.endpointBVisible,
        isCustomerSelectable: formData.endpointBSelectable,
        isSelectionRequired: formData.endpointBRequired,
        label: formData.endpointBLabel,
        allowedRoles: ["charm", "end_cap", "bead"],
      },
    };

    try {
      let targetMethodId = editingId;
      if (editingId) {
        await updateConstructionMethod(editingId, payload);
        toast({ title: "Construction method updated" });
      } else {
        const created = await createConstructionMethod(payload);
        targetMethodId = created.id;
        toast({ title: "Construction method created" });
      }

      // Persist assigned subcategories
      if (targetMethodId) {
        await syncMethodSubcategories(targetMethodId, formData.selectedSubcategoryIds);
      }

      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast({
        title: "Failed to save construction method",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete construction method "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await deleteConstructionMethod(id);
      toast({ title: `Construction method "${name}" deleted` });
      loadData();
    } catch (err: any) {
      toast({
        title: "Failed to delete construction method",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleTogglePublish = async (method: IStudioConstructionMethod) => {
    try {
      await updateConstructionMethod(method.id, { isPublished: !method.isPublished });
      toast({
        title: method.isPublished ? "Method unpublished (draft)" : "Method published",
      });
      loadData();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-card p-5 rounded-2xl border border-[#E6D8D0] dark:border-border">
        <div>
          <h2 className="text-base font-semibold text-[#342824] dark:text-foreground flex items-center gap-2">
            <Wrench className="w-4 h-4 text-[#B66F72]" />
            <span>Studio Construction Methods</span>
          </h2>
          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
            Define independent physical construction techniques (Elastic Cord, Memory Wire, Clasp & Extension) with independent endpoints and specifications.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleOpenCreate}
          className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 rounded-xl flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Construction Method</span>
        </Button>
      </div>

      {/* Method List */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#756861]">Loading construction methods…</div>
      ) : methods.length === 0 ? (
        <Card className="border border-[#E6D8D0] p-8 text-center text-xs text-[#756861] rounded-2xl">
          No construction methods configured yet. Click "New Construction Method" to create one.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {methods.map((method) => {
            const specs = method.physicalSpecsConfig || {};
            const endA = method.endpointAConfig;
            const endB = method.endpointBConfig;
            const baseInfo = BASE_TYPES.find((b) => b.value === method.baseMaterialType);

            return (
              <Card
                key={method.id}
                className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between"
              >
                <CardHeader className="pb-3 border-b border-[#E6D8D0]/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#342824] dark:text-foreground">
                        {method.name}
                      </CardTitle>
                      <span className="text-[11px] font-mono text-[#B99A72] block mt-0.5">
                        {method.slug}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {method.isPublished ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                          Published
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50 text-[10px]">
                          Draft
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-3 pb-4 space-y-3 text-xs text-[#756861] dark:text-muted-foreground flex-1">
                  <div>
                    <span className="font-medium text-[#342824] dark:text-foreground">Base Material: </span>
                    <span>{baseInfo?.label || method.baseMaterialType}</span>
                  </div>

                  {method.description && (
                    <p className="text-[11px] line-clamp-2 italic">{method.description}</p>
                  )}

                  {/* Physical Specs Summary */}
                  <div className="p-2.5 rounded-xl bg-[#FBF7F3] dark:bg-muted/40 space-y-1 text-[11px]">
                    <div className="font-semibold text-[#5C4D44] dark:text-foreground">Specifications:</div>
                    {specs.cordDiameterMm && <div>Cord Diameter: {specs.cordDiameterMm} mm</div>}
                    {specs.innerDiameterMm && <div>Inner Diameter: {specs.innerDiameterMm} mm</div>}
                    {specs.beadableLengthMm && <div>Beadable Length: {specs.beadableLengthMm} mm</div>}
                    {specs.chainLengthMm && <div>Chain Length: {specs.chainLengthMm} mm</div>}
                  </div>

                  {/* Endpoints config */}
                  {(endA?.visible || endB?.visible) && (
                    <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-muted/30 space-y-1 text-[11px] border border-amber-200/40">
                      <div className="font-semibold text-amber-900 dark:text-foreground">Configurable Ends:</div>
                      {endA?.visible && <div>● End A: {endA.label || "Endpoint A"} ({endA.isCustomerSelectable ? "Customer Selectable" : "Fixed"})</div>}
                      {endB?.visible && <div>● End B: {endB.label || "Endpoint B"} ({endB.isCustomerSelectable ? "Customer Selectable" : "Fixed"})</div>}
                    </div>
                  )}

                  {/* Allowed Components */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(method.allowedComponentRoles || []).map((role) => (
                      <Badge key={role} variant="secondary" className="text-[9px] px-1.5 py-0.2">
                        {role}
                      </Badge>
                    ))}
                  </div>

                  {/* Applicable Subcategories */}
                  <div className="pt-2 border-t border-[#E6D8D0]/60 space-y-1">
                    <span className="font-semibold text-[#5C4D44] dark:text-foreground text-[11px] flex items-center gap-1">
                      <Layers className="w-3 h-3 text-[#B66F72]" />
                      <span>Applicable Subcategories:</span>
                    </span>
                    {method.assignedSubcategories && method.assignedSubcategories.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {method.assignedSubcategories.map((subcat) => (
                          <Badge
                            key={subcat.id}
                            variant="outline"
                            className="text-[10px] px-2 py-0.5 bg-[#FBF7F3] dark:bg-muted text-[#5C4D44] dark:text-foreground border-[#E6D8D0] dark:border-border font-medium"
                          >
                            {subcat.parentName ? `${subcat.parentName} › ` : ""}{subcat.name}
                            {!subcat.isPublished && (
                              <span className="ml-1 text-[9px] text-amber-600 font-normal">(unpublished)</span>
                            )}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-lg border border-amber-200 dark:border-amber-900 inline-block">
                        No subcategories assigned
                      </span>
                    )}
                  </div>
                </CardContent>

                <div className="p-3 border-t border-[#E6D8D0]/60 flex items-center justify-between bg-stone-50/50 dark:bg-muted/20">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePublish(method)}
                    className="h-7 px-2 text-[11px] text-[#756861] hover:text-[#342824]"
                  >
                    {method.isPublished ? <EyeOff className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                    <span>{method.isPublished ? "Unpublish" : "Publish"}</span>
                  </Button>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(method)}
                      className="h-7 px-2 text-[11px] text-[#B66F72] hover:bg-[#B66F72]/10"
                    >
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(method.id, method.name)}
                      className="h-7 w-7 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-card border border-[#E6D8D0] dark:border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6D8D0]">
              <h3 className="text-base font-semibold text-[#342824] dark:text-foreground">
                {editingId ? "Edit Construction Method" : "New Construction Method"}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                className="h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSave} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Method Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Memory Wire Bracelet"
                    className="h-8 text-xs rounded-xl mt-1"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">Slug (URL / Internal ID)</Label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="e.g. memory-wire-bracelet"
                    className="h-8 text-xs rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Base Material Architecture *</Label>
                <select
                  value={formData.baseMaterialType}
                  onChange={(e) => setFormData({ ...formData, baseMaterialType: e.target.value })}
                  className="w-full h-8 text-xs rounded-xl border border-input bg-background px-3 py-1 mt-1"
                >
                  {BASE_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Explain how this construction behaves, physical feel, and components it accepts."
                  rows={2}
                  className="text-xs rounded-xl mt-1"
                />
              </div>

              {/* Physical Specifications */}
              <div className="p-4 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3] dark:bg-muted/30 space-y-3">
                <div className="font-semibold text-xs text-[#5C4D44] dark:text-foreground flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-[#B66F72]" />
                  <span>Physical & Calibration Measurements (mm)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-[11px]">Cord Diameter (Optional, mm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 0.8"
                      value={formData.cordDiameterMm ?? ""}
                      onChange={(e) => setFormData({ ...formData, cordDiameterMm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Inner Diameter (Optional, mm)</Label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="e.g. 55"
                      value={formData.innerDiameterMm ?? ""}
                      onChange={(e) => setFormData({ ...formData, innerDiameterMm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Beadable Length (Optional, mm)</Label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="e.g. 160"
                      value={formData.beadableLengthMm ?? ""}
                      onChange={(e) => setFormData({ ...formData, beadableLengthMm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Wire Thickness (Optional, mm)</Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 0.6"
                      value={formData.wireThicknessMm ?? ""}
                      onChange={(e) => setFormData({ ...formData, wireThicknessMm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Chain Length (Optional, mm)</Label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="e.g. 50"
                      value={formData.chainLengthMm ?? ""}
                      onChange={(e) => setFormData({ ...formData, chainLengthMm: e.target.value === "" ? null : parseFloat(e.target.value) })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Wire Turns (Optional)</Label>
                    <Input
                      type="number"
                      step="1"
                      placeholder="e.g. 1"
                      value={formData.turnsCount ?? ""}
                      onChange={(e) => setFormData({ ...formData, turnsCount: e.target.value === "" ? null : parseInt(e.target.value) })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Endpoint A & B Config (e.g. Memory Wire / Custom Clasps) */}
              <div className="p-4 rounded-xl border border-[#E6D8D0] bg-white dark:bg-card space-y-4">
                <div className="font-semibold text-xs text-[#5C4D44] dark:text-foreground">
                  Configurable Structural Endpoints (e.g. Memory Wire End A & B, Securing Beads)
                </div>

                {/* Endpoint A */}
                <div className="p-3 rounded-lg border border-dashed border-[#E6D8D0] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">Endpoint A (Start of Strand)</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.endpointAVisible}
                        onChange={(e) => setFormData({ ...formData, endpointAVisible: e.target.checked })}
                      />
                      <span className="text-[11px]">Enable Endpoint A</span>
                    </label>
                  </div>
                  {formData.endpointAVisible && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label className="text-[11px]">Label</Label>
                        <Input
                          value={formData.endpointALabel}
                          onChange={(e) => setFormData({ ...formData, endpointALabel: e.target.value })}
                          className="h-7 text-xs mt-1"
                        />
                      </div>
                      <div className="flex flex-col justify-end gap-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.endpointASelectable}
                            onChange={(e) => setFormData({ ...formData, endpointASelectable: e.target.checked })}
                          />
                          <span className="text-[11px]">Customer Selectable</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.endpointARequired}
                            onChange={(e) => setFormData({ ...formData, endpointARequired: e.target.checked })}
                          />
                          <span className="text-[11px]">Selection Mandatory</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {/* Endpoint B */}
                <div className="p-3 rounded-lg border border-dashed border-[#E6D8D0] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">Endpoint B (End of Strand)</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.endpointBVisible}
                        onChange={(e) => setFormData({ ...formData, endpointBVisible: e.target.checked })}
                      />
                      <span className="text-[11px]">Enable Endpoint B</span>
                    </label>
                  </div>
                  {formData.endpointBVisible && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label className="text-[11px]">Label</Label>
                        <Input
                          value={formData.endpointBLabel}
                          onChange={(e) => setFormData({ ...formData, endpointBLabel: e.target.value })}
                          className="h-7 text-xs mt-1"
                        />
                      </div>
                      <div className="flex flex-col justify-end gap-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.endpointBSelectable}
                            onChange={(e) => setFormData({ ...formData, endpointBSelectable: e.target.checked })}
                          />
                          <span className="text-[11px]">Customer Selectable</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.endpointBRequired}
                            onChange={(e) => setFormData({ ...formData, endpointBRequired: e.target.checked })}
                          />
                          <span className="text-[11px]">Selection Mandatory</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Allowed Component Roles */}
              <div>
                <Label className="text-xs mb-1.5 block">Allowed Component Roles in this Method</Label>
                {componentTypes.length === 0 ? (
                  <p className="text-[11px] text-[#756861]">No active component types found. Add them in Component Types Management.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {componentTypes.map((type) => {
                      const active = formData.allowedComponentRoles.includes(type.typeId);
                      return (
                        <button
                          key={type.typeId}
                          type="button"
                          onClick={() => handleToggleRole(type.typeId)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                            active
                              ? "bg-[#B66F72] text-white border-[#B66F72]"
                              : "bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300"
                          }`}
                        >
                          {type.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Applicable Subcategories */}
              <div className="p-4 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3] dark:bg-muted/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-[#5C4D44] dark:text-foreground flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-[#B66F72]" />
                    <span>Applicable Subcategories</span>
                  </div>
                  <span className="text-[10px] text-[#756861] dark:text-muted-foreground font-medium">
                    {formData.selectedSubcategoryIds.length} subcategor{formData.selectedSubcategoryIds.length === 1 ? "y" : "ies"} selected
                  </span>
                </div>
                <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                  Select which jewellery subcategories can be crafted using this construction method. Only subcategories can be assigned.
                </p>

                {subcategories.length === 0 ? (
                  <div className="p-3 rounded-lg border border-dashed border-[#E6D8D0] text-center text-[11px] text-[#756861]">
                    No subcategories found. Create subcategories under Categories &amp; Subcategories first.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {subcategories.map((subcat) => {
                      const checked = formData.selectedSubcategoryIds.includes(subcat.id);
                      const breadcrumb = getCategoryBreadcrumb(subcat);
                      return (
                        <label
                          key={subcat.id}
                          className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                            checked
                              ? "bg-white dark:bg-card border-[#B66F72] text-[#342824] dark:text-foreground shadow-xs font-medium"
                              : "bg-white/60 dark:bg-card/60 border-[#E6D8D0]/80 text-[#756861] dark:text-muted-foreground hover:border-[#B66F72]/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleSubcategory(subcat.id)}
                            className="rounded text-[#B66F72] focus:ring-[#B66F72]"
                          />
                          <span className="text-xs">{breadcrumb}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status Toggles */}
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isPublished}
                    onChange={(e) => setFormData({ ...formData, isPublished: e.target.checked })}
                  />
                  <span>Publish to Customer Studio</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#E6D8D0]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl"
                >
                  {editingId ? "Save Changes" : "Create Method"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

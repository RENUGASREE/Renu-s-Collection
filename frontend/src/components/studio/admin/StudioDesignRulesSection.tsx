import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  fetchStudioDesignRules,
  createStudioDesignRule,
  updateStudioDesignRule,
  duplicateStudioDesignRule,
  deleteStudioDesignRule,
  fetchStudioCategories,
  fetchConstructionMethods,
} from "@/lib/studio/independentStudioApi";
import type {
  IStudioDesignRule,
  IStudioCategory,
  IStudioConstructionMethod,
} from "@/types/studio.types";
import {
  Ruler,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Check,
  X,
  Eye,
  EyeOff,
  Sliders,
  CheckCircle2,
  Layers,
  Sparkles,
} from "lucide-react";

export const StudioDesignRulesSection: React.FC = () => {
  const { toast } = useToast();
  const [rules, setRules] = useState<IStudioDesignRule[]>([]);
  const [categories, setCategories] = useState<IStudioCategory[]>([]);
  const [methods, setMethods] = useState<IStudioConstructionMethod[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    categoryId: "" as string,
    constructionMethodId: "" as string,
    minWristMm: 140,
    maxWristMm: 220,
    minComponents: 15,
    maxComponents: 35,
    maxCharms: 3,
    charmCountMode: "total_units" as "total_units" | "distinct_types",
    fitAllowanceMm: 10,
    permittedBeadSizesMm: [6, 8, 10] as number[],
    isPublished: true,
    isActive: true,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedRules, flatCategories, fetchedMethods] = await Promise.all([
        fetchStudioDesignRules(),
        fetchStudioCategories(false),
        fetchConstructionMethods(false),
      ]);
      setRules(fetchedRules);
      setCategories(flatCategories);
      setMethods(fetchedMethods);
    } catch (err: any) {
      toast({
        title: "Failed to load design rules",
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
      description: "",
      categoryId: categories[0]?.id || "",
      constructionMethodId: methods[0]?.id || "",
      minWristMm: 140,
      maxWristMm: 220,
      minComponents: 15,
      maxComponents: 35,
      maxCharms: 3,
      charmCountMode: "total_units",
      fitAllowanceMm: 10,
      permittedBeadSizesMm: [6, 8, 10],
      isPublished: true,
      isActive: true,
    });
    setShowForm(true);
  };

  const handleOpenEdit = (rule: IStudioDesignRule) => {
    setEditingId(rule.id);
    setFormData({
      name: rule.name,
      description: rule.description || "",
      categoryId: rule.categoryId || "",
      constructionMethodId: rule.constructionMethodId || "",
      minWristMm: rule.minWristMm ?? 140,
      maxWristMm: rule.maxWristMm ?? 220,
      minComponents: rule.minComponents ?? 15,
      maxComponents: rule.maxComponents ?? 35,
      maxCharms: rule.maxCharms ?? 3,
      charmCountMode: rule.charmCountMode || "total_units",
      fitAllowanceMm: rule.fitAllowanceMm ?? 10,
      permittedBeadSizesMm: rule.permittedBeadSizesMm || [6, 8, 10],
      isPublished: rule.isPublished,
      isActive: rule.isActive,
    });
    setShowForm(true);
  };

  const handleDuplicate = async (rule: IStudioDesignRule) => {
    try {
      await duplicateStudioDesignRule(rule.id, `${rule.name} (Copy)`);
      toast({ title: `Duplicated rule "${rule.name}"` });
      loadData();
    } catch (err: any) {
      toast({ title: "Failed to duplicate rule", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete design rule "${name}"?`)) return;
    try {
      await deleteStudioDesignRule(id);
      toast({ title: `Rule "${name}" deleted` });
      loadData();
    } catch (err: any) {
      toast({ title: "Failed to delete rule", description: err.message, variant: "destructive" });
    }
  };

  const handleTogglePublish = async (rule: IStudioDesignRule) => {
    try {
      await updateStudioDesignRule(rule.id, { isPublished: !rule.isPublished });
      toast({ title: rule.isPublished ? "Rule set to draft" : "Rule published" });
      loadData();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const handleToggleActive = async (rule: IStudioDesignRule) => {
    try {
      await updateStudioDesignRule(rule.id, { isActive: !rule.isActive });
      toast({ title: rule.isActive ? "Rule deactivated" : "Rule activated" });
      loadData();
    } catch (err: any) {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({ title: "Rule name is required", variant: "destructive" });
      return;
    }

    const payload: Partial<IStudioDesignRule> = {
      name: formData.name.trim(),
      description: formData.description.trim() || null,
      categoryId: formData.categoryId || null,
      constructionMethodId: formData.constructionMethodId || null,
      minWristMm: Number(formData.minWristMm),
      maxWristMm: Number(formData.maxWristMm),
      minComponents: Number(formData.minComponents),
      maxComponents: Number(formData.maxComponents),
      maxCharms: Number(formData.maxCharms),
      charmCountMode: formData.charmCountMode,
      fitAllowanceMm: Number(formData.fitAllowanceMm),
      permittedBeadSizesMm: formData.permittedBeadSizesMm,
      isPublished: formData.isPublished,
      isActive: formData.isActive,
    };

    try {
      if (editingId) {
        await updateStudioDesignRule(editingId, payload);
        toast({ title: "Design rule updated" });
      } else {
        await createStudioDesignRule(payload);
        toast({ title: "Design rule created" });
      }
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast({ title: "Failed to save rule", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-card p-5 rounded-2xl border border-[#E6D8D0] dark:border-border">
        <div>
          <h2 className="text-base font-semibold text-[#342824] dark:text-foreground flex items-center gap-2">
            <Ruler className="w-4 h-4 text-[#B66F72]" />
            <span>Independent Design Rules & Calibration</span>
          </h2>
          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
            Configure flexible physical constraints (wrist ranges, component bounds, charm limits, safety allowances) per category and construction method.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleOpenCreate}
          className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 rounded-xl flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Design Rule</span>
        </Button>
      </div>

      {/* Rules Grid */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#756861]">Loading design rules…</div>
      ) : rules.length === 0 ? (
        <Card className="border border-[#E6D8D0] p-8 text-center text-xs text-[#756861] rounded-2xl">
          No design rules created yet. Click "New Design Rule" to create one.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rules.map((rule) => {
            const cat = categories.find((c) => c.id === rule.categoryId);
            const method = methods.find((m) => m.id === rule.constructionMethodId);

            return (
              <Card
                key={rule.id}
                className={`border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-2xl shadow-xs overflow-hidden flex flex-col justify-between ${
                  !rule.isActive ? "opacity-60 bg-stone-50/50" : ""
                }`}
              >
                <CardHeader className="pb-3 border-b border-[#E6D8D0]/60">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold text-[#342824] dark:text-foreground">
                        {rule.name}
                      </CardTitle>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {cat && (
                          <Badge variant="outline" className="text-[10px] text-[#B99A72] border-[#B99A72]/30">
                            {cat.name}
                          </Badge>
                        )}
                        {method && (
                          <Badge variant="secondary" className="text-[10px]">
                            {method.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {rule.isPublished ? (
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
                  {rule.description && (
                    <p className="text-[11px] italic line-clamp-2">{rule.description}</p>
                  )}

                  {/* Calibration details */}
                  <div className="p-2.5 rounded-xl bg-[#FBF7F3] dark:bg-muted/40 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-[#5C4D44] font-medium">Wrist Circumference:</span>
                      <span className="font-mono">{rule.minWristMm ?? 140} – {rule.maxWristMm ?? 220} mm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5C4D44] font-medium">Component Range:</span>
                      <span className="font-mono">{rule.minComponents ?? 15} – {rule.maxComponents ?? 35} pcs</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5C4D44] font-medium">Max Charms:</span>
                      <span className="font-mono">{rule.maxCharms ?? 3} ({rule.charmCountMode || "total_units"})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#5C4D44] font-medium">Fit Allowance:</span>
                      <span className="font-mono">+{rule.fitAllowanceMm ?? 10} mm</span>
                    </div>
                  </div>

                  {/* Permitted Bead Sizes */}
                  {rule.permittedBeadSizesMm && rule.permittedBeadSizesMm.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="text-[10px] font-medium">Bead Sizes:</span>
                      {rule.permittedBeadSizesMm.map((size) => (
                        <Badge key={size} variant="outline" className="text-[9px] px-1 py-0 font-mono">
                          {size}mm
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>

                <div className="p-3 border-t border-[#E6D8D0]/60 flex items-center justify-between bg-stone-50/50 dark:bg-muted/20">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePublish(rule)}
                      className="h-7 px-2 text-[11px] text-[#756861]"
                      title={rule.isPublished ? "Set to Draft" : "Publish"}
                    >
                      {rule.isPublished ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDuplicate(rule)}
                      className="h-7 px-2 text-[11px] text-[#756861] hover:text-[#342824]"
                      title="Duplicate Rule"
                    >
                      <Copy className="w-3 h-3 mr-1" /> Duplicate
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(rule)}
                      className="h-7 px-2 text-[11px] text-[#B66F72] hover:bg-[#B66F72]/10"
                    >
                      <Pencil className="w-3 h-3 mr-1" /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(rule.id, rule.name)}
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

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-card border border-[#E6D8D0] dark:border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6D8D0]">
              <h3 className="text-base font-semibold text-[#342824] dark:text-foreground">
                {editingId ? "Edit Design Rule" : "New Design Rule"}
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

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <Label className="text-xs">Rule Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Standard Elastic Bracelet (6mm - 10mm)"
                  className="h-8 text-xs rounded-xl mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Explain when this rule is applied and customer experience notes."
                  rows={2}
                  className="text-xs rounded-xl mt-1"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Jewellery Category</Label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                    className="w-full h-8 text-xs rounded-xl border border-input bg-background px-3 py-1 mt-1"
                  >
                    <option value="">(All Categories)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Construction Method</Label>
                  <select
                    value={formData.constructionMethodId}
                    onChange={(e) => setFormData({ ...formData, constructionMethodId: e.target.value })}
                    className="w-full h-8 text-xs rounded-xl border border-input bg-background px-3 py-1 mt-1"
                  >
                    <option value="">(All Methods)</option>
                    {methods.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Physical Calibration Constraints */}
              <div className="p-4 rounded-xl border border-[#E6D8D0] bg-[#FBF7F3] dark:bg-muted/30 space-y-3">
                <div className="font-semibold text-xs text-[#5C4D44] dark:text-foreground">
                  Physical Wrist & Component Calibration
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px]">Min Wrist (mm)</Label>
                    <Input
                      type="number"
                      value={formData.minWristMm}
                      onChange={(e) => setFormData({ ...formData, minWristMm: parseInt(e.target.value) || 0 })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Max Wrist (mm)</Label>
                    <Input
                      type="number"
                      value={formData.maxWristMm}
                      onChange={(e) => setFormData({ ...formData, maxWristMm: parseInt(e.target.value) || 0 })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px]">Min Components (Beads)</Label>
                    <Input
                      type="number"
                      value={formData.minComponents}
                      onChange={(e) => setFormData({ ...formData, minComponents: parseInt(e.target.value) || 0 })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Max Components (Beads)</Label>
                    <Input
                      type="number"
                      value={formData.maxComponents}
                      onChange={(e) => setFormData({ ...formData, maxComponents: parseInt(e.target.value) || 0 })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px]">Max Charms Allowed</Label>
                    <Input
                      type="number"
                      value={formData.maxCharms}
                      onChange={(e) => setFormData({ ...formData, maxCharms: parseInt(e.target.value) || 0 })}
                      className="h-7 text-xs rounded-lg mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px]">Charm Limit Enforcement</Label>
                    <select
                      value={formData.charmCountMode}
                      onChange={(e) => setFormData({ ...formData, charmCountMode: e.target.value as any })}
                      className="w-full h-7 text-xs rounded-lg border border-input bg-background px-2 py-0.5 mt-1"
                    >
                      <option value="total_units">Total Charm Units (e.g. 3 max)</option>
                      <option value="distinct_types">Distinct Charm Designs</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-[11px]">Fit Allowance Margin (mm)</Label>
                  <Input
                    type="number"
                    value={formData.fitAllowanceMm}
                    onChange={(e) => setFormData({ ...formData, fitAllowanceMm: parseInt(e.target.value) || 0 })}
                    className="h-7 text-xs rounded-lg mt-1"
                  />
                </div>
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
                  {editingId ? "Save Changes" : "Create Rule"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

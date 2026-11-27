import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  fetchMaterialLinks,
  createMaterialLink,
  updateMaterialLink,
  deleteMaterialLink,
} from "@/lib/studio/independentStudioApi";
import type { IStudioMaterialLink } from "@/types/studio.types";
import {
  Link as LinkIcon,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Layers,
  Search,
  AlertCircle,
  Database,
} from "lucide-react";

interface StudioMaterialLinksSectionProps {
  studioMaterials: any[];
}

export const StudioMaterialLinksSection: React.FC<StudioMaterialLinksSectionProps> = ({
  studioMaterials,
}) => {
  const { toast } = useToast();
  const [links, setLinks] = useState<IStudioMaterialLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    studioMaterialId: "",
    studioVariantSku: "",
    customizationMaterialId: "",
    customizationVariantSku: "",
    authoritativeSource: "studio" as "studio" | "customization" | "inventory",
    consumptionQty: 1,
    notes: "",
  });

  const loadLinks = async () => {
    setLoading(true);
    try {
      const fetched = await fetchMaterialLinks();
      setLinks(fetched);
    } catch (err: any) {
      toast({
        title: "Failed to load material links",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      studioMaterialId: studioMaterials[0]?.id || "",
      studioVariantSku: "",
      customizationMaterialId: "",
      customizationVariantSku: "",
      authoritativeSource: "studio",
      consumptionQty: 1,
      notes: "",
    });
    setShowModal(true);
  };

  const handleOpenEdit = (link: IStudioMaterialLink) => {
    setEditingId(link.id);
    setFormData({
      studioMaterialId: link.studioMaterialId,
      studioVariantSku: link.studioVariantSku || "",
      customizationMaterialId: link.customizationMaterialId,
      customizationVariantSku: link.customizationVariantSku || "",
      authoritativeSource: link.authoritativeSource || "studio",
      consumptionQty: link.consumptionQty || 1,
      notes: link.notes || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this explicit material link?")) return;
    try {
      await deleteMaterialLink(id);
      toast({ title: "Material link removed" });
      loadLinks();
    } catch (err: any) {
      toast({ title: "Failed to delete link", description: err.message, variant: "destructive" });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.studioMaterialId) {
      toast({ title: "Please select a Studio material", variant: "destructive" });
      return;
    }
    if (!formData.customizationMaterialId) {
      toast({ title: "Customization Material ID is required", variant: "destructive" });
      return;
    }

    const payload: Partial<IStudioMaterialLink> = {
      studioMaterialId: formData.studioMaterialId,
      studioVariantSku: formData.studioVariantSku.trim() || null,
      customizationMaterialId: formData.customizationMaterialId.trim(),
      customizationVariantSku: formData.customizationVariantSku.trim() || null,
      authoritativeSource: formData.authoritativeSource,
      consumptionQty: Number(formData.consumptionQty) || 1,
      notes: formData.notes.trim() || null,
    };

    try {
      if (editingId) {
        await updateMaterialLink(editingId, payload);
        toast({ title: "Material link updated" });
      } else {
        await createMaterialLink(payload);
        toast({ title: "Explicit material link established" });
      }
      setShowModal(false);
      loadLinks();
    } catch (err: any) {
      toast({ title: "Failed to save link", description: err.message, variant: "destructive" });
    }
  };

  const filteredLinks = links.filter((l) => {
    const term = search.toLowerCase();
    return (
      l.studioMaterialId.toLowerCase().includes(term) ||
      (l.studioVariantSku && l.studioVariantSku.toLowerCase().includes(term)) ||
      l.customizationMaterialId.toLowerCase().includes(term) ||
      (l.customizationVariantSku && l.customizationVariantSku.toLowerCase().includes(term)) ||
      (l.notes && l.notes.toLowerCase().includes(term))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-card p-5 rounded-2xl border border-[#E6D8D0] dark:border-border">
        <div>
          <h2 className="text-base font-semibold text-[#342824] dark:text-foreground flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-[#B66F72]" />
            <span>Explicit Material Linking</span>
          </h2>
          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
            Explicitly link Studio materials and variants with Store customization materials and inventory items.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleOpenCreate}
          className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 rounded-xl flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Material Link</span>
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-3 bg-white dark:bg-card p-3 rounded-xl border border-[#E6D8D0]">
        <Search className="w-4 h-4 text-[#756861]" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter links by Studio Material, Variant SKU or Store Material ID…"
          className="h-8 text-xs border-none shadow-none focus-visible:ring-0"
        />
      </div>

      {/* Links Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#756861]">Loading material links…</div>
      ) : filteredLinks.length === 0 ? (
        <Card className="border border-[#E6D8D0] p-8 text-center text-xs text-[#756861] rounded-2xl">
          {search ? "No material links match your search." : "No explicit material links created yet."}
        </Card>
      ) : (
        <div className="border border-[#E6D8D0] dark:border-border rounded-2xl overflow-hidden bg-white dark:bg-card shadow-xs">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#FBF7F3] dark:bg-muted/40 border-b border-[#E6D8D0] text-[#756861] font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Studio Material / Variant</th>
                <th className="py-3 px-4">Store Customization Target</th>
                <th className="py-3 px-4">Authoritative Source</th>
                <th className="py-3 px-4">Consumption Qty</th>
                <th className="py-3 px-4">Notes</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6D8D0]/60">
              {filteredLinks.map((link) => {
                const sMat = studioMaterials.find((m) => m.id === link.studioMaterialId);
                return (
                  <tr key={link.id} className="hover:bg-stone-50/50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-[#342824] dark:text-foreground">
                        {sMat ? sMat.name : link.studioMaterialId}
                      </div>
                      {link.studioVariantSku && (
                        <span className="text-[10px] font-mono text-[#B99A72]">
                          SKU: {link.studioVariantSku}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px]">
                      <div>{link.customizationMaterialId}</div>
                      {link.customizationVariantSku && (
                        <span className="text-[10px] text-stone-500">
                          Variant: {link.customizationVariantSku}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {link.authoritativeSource}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 font-medium">{link.consumptionQty}x</td>
                    <td className="py-3 px-4 text-stone-500 italic max-w-xs truncate">
                      {link.notes || "—"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(link)}
                          className="h-7 w-7 p-0 text-[#B66F72] hover:bg-[#B66F72]/10"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(link.id)}
                          className="h-7 w-7 p-0 text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Link Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card border border-[#E6D8D0] dark:border-border rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6D8D0]">
              <h3 className="text-sm font-semibold text-[#342824] dark:text-foreground">
                {editingId ? "Edit Material Link" : "Establish Explicit Material Link"}
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowModal(false)}
                className="h-7 w-7 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <Label className="text-xs">Studio Material *</Label>
                <select
                  value={formData.studioMaterialId}
                  onChange={(e) => setFormData({ ...formData, studioMaterialId: e.target.value })}
                  className="w-full h-8 text-xs rounded-xl border border-input bg-background px-3 py-1 mt-1"
                  required
                >
                  <option value="">Select Studio Material…</option>
                  {studioMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.componentType || "material"})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">Studio Variant SKU (Optional)</Label>
                <Input
                  value={formData.studioVariantSku}
                  onChange={(e) => setFormData({ ...formData, studioVariantSku: e.target.value })}
                  placeholder="e.g. BEAD-CRK-LBL-01"
                  className="h-8 text-xs rounded-xl mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Store Customization Material ID *</Label>
                <Input
                  value={formData.customizationMaterialId}
                  onChange={(e) => setFormData({ ...formData, customizationMaterialId: e.target.value })}
                  placeholder="e.g. 64b8a1c901..."
                  className="h-8 text-xs rounded-xl mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Store Variant SKU (Optional)</Label>
                <Input
                  value={formData.customizationVariantSku}
                  onChange={(e) => setFormData({ ...formData, customizationVariantSku: e.target.value })}
                  placeholder="e.g. CH-SHELL-PURPLE"
                  className="h-8 text-xs rounded-xl mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Authoritative Source</Label>
                  <select
                    value={formData.authoritativeSource}
                    onChange={(e) => setFormData({ ...formData, authoritativeSource: e.target.value as any })}
                    className="w-full h-8 text-xs rounded-xl border border-input bg-background px-3 py-1 mt-1"
                  >
                    <option value="studio">Studio (Authoritative)</option>
                    <option value="customization">Store Customization</option>
                    <option value="inventory">Inventory Pool</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Consumption Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.consumptionQty}
                    onChange={(e) => setFormData({ ...formData, consumptionQty: parseInt(e.target.value) || 1 })}
                    className="h-8 text-xs rounded-xl mt-1"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Notes / Description</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes regarding this link"
                  className="h-8 text-xs rounded-xl mt-1"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E6D8D0]">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl"
                >
                  {editingId ? "Save Changes" : "Link Materials"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

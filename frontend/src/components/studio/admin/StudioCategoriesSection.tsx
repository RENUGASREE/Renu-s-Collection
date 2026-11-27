import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import ImageUploadField from "@/components/ImageUploadField";
import {
  fetchStudioCategoriesTree,
  fetchStudioCategories,
  createStudioCategory,
  updateStudioCategory,
  deleteStudioCategory,
} from "@/lib/studio/independentStudioApi";
import type { IStudioCategory } from "@/types/studio.types";
import {
  FolderTree,
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
} from "lucide-react";

export const StudioCategoriesSection: React.FC = () => {
  const { toast } = useToast();
  const [categoriesTree, setCategoriesTree] = useState<IStudioCategory[]>([]);
  const [flatCategories, setFlatCategories] = useState<IStudioCategory[]>([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    parentId: "" as string,
    description: "",
    coverImageUrl: "",
    displayOrder: 0,
    isActive: true,
    isPublished: true,
  });

  const loadCategories = async () => {
    setLoading(true);
    try {
      const [tree, flat] = await Promise.all([
        fetchStudioCategoriesTree(false),
        fetchStudioCategories(false),
      ]);
      setCategoriesTree(tree);
      setFlatCategories(flat);
    } catch (err: any) {
      toast({
        title: "Failed to load categories",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleOpenCreate = (parentId?: string) => {
    setEditingId(null);
    setFormData({
      name: "",
      slug: "",
      parentId: parentId || "",
      description: "",
      coverImageUrl: "",
      displayOrder: flatCategories.length + 1,
      isActive: true,
      isPublished: true,
    });
    setShowForm(true);
  };

  const handleOpenEdit = (category: IStudioCategory) => {
    setEditingId(category.id);
    setFormData({
      name: category.name,
      slug: category.slug,
      parentId: category.parentId || "",
      description: category.description || "",
      coverImageUrl: category.coverImageUrl || "",
      displayOrder: category.displayOrder || 0,
      isActive: category.isActive,
      isPublished: category.isPublished,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.slug.trim()) {
      toast({ title: "Name and Slug are required", variant: "destructive" });
      return;
    }

    try {
      if (editingId) {
        await updateStudioCategory(editingId, {
          name: formData.name.trim(),
          slug: formData.slug.trim().toLowerCase(),
          parentId: formData.parentId || null,
          description: formData.description.trim() || null,
          coverImageUrl: formData.coverImageUrl || null,
          displayOrder: Number(formData.displayOrder),
          isActive: formData.isActive,
          isPublished: formData.isPublished,
        });
        toast({ title: "Category Updated", description: "Studio category saved successfully." });
      } else {
        await createStudioCategory({
          name: formData.name.trim(),
          slug: formData.slug.trim().toLowerCase(),
          parentId: formData.parentId || null,
          description: formData.description.trim() || null,
          coverImageUrl: formData.coverImageUrl || null,
          displayOrder: Number(formData.displayOrder),
          isActive: formData.isActive,
          isPublished: formData.isPublished,
        });
        toast({ title: "Category Created", description: "New studio category added." });
      }
      setShowForm(false);
      loadCategories();
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? Subcategories must be empty.`)) return;
    try {
      await deleteStudioCategory(id);
      toast({ title: "Category Deleted", description: `"${name}" removed.` });
      loadCategories();
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Render a node recursively in tree view
  const renderCategoryNode = (node: IStudioCategory, depth = 0) => {
    const hasChildren = node.subcategories && node.subcategories.length > 0;

    return (
      <div key={node.id} className="space-y-1">
        <div
          className={`flex items-center justify-between p-3 rounded-xl border border-[#E6D8D0] dark:border-border transition-colors ${
            depth === 0 ? "bg-[#FBF7F3] dark:bg-card/70 font-medium" : "bg-white dark:bg-card ml-6"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {depth > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#B0A0A0] shrink-0" />}
            <span className="text-xs text-[#342824] dark:text-foreground font-semibold truncate">
              {node.name}
            </span>
            <span className="font-mono text-[10px] text-[#756861] bg-muted/40 px-1.5 py-0.5 rounded">
              /{node.slug}
            </span>
            {node.isPublished ? (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] border-0">
                Published
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 text-[10px]">
                Draft
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenCreate(node.id)}
              className="h-7 text-xs text-[#B66F72] hover:bg-[#B66F72]/10"
              title="Add child subcategory"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Subcategory
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleOpenEdit(node)}
              className="h-7 w-7 p-0 rounded-lg text-[#756861]"
              title="Edit category"
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(node.id, node.name)}
              className="h-7 w-7 p-0 rounded-lg text-rose-600 hover:bg-rose-50"
              title="Delete category"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {hasChildren && (
          <div className="space-y-1">
            {node.subcategories!.map((child) => renderCategoryNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E6D8D0] pb-4">
        <div>
          <h2 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-[#B66F72]" />
            Studio Jewellery Categories & Nested Subcategories
          </h2>
          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
            Manage jewellery hierarchies completely independent of the ordinary product catalogue.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => handleOpenCreate()}
          className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs px-4 rounded-xl gap-1.5 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Root Category</span>
        </Button>
      </div>

      {/* Form Dialog / Drawer */}
      {showForm && (
        <Card className="border border-[#B66F72]/40 bg-[#FBF7F3] dark:bg-card rounded-2xl shadow-sm p-4">
          <CardHeader className="pb-3 px-0 pt-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-[#342824] dark:text-foreground">
                {editingId ? "Edit Studio Category" : "Add New Studio Category"}
              </CardTitle>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowForm(false)}
                className="h-7 w-7 p-0 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setFormData((prev) => ({
                      ...prev,
                      name,
                      slug: prev.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
                    }));
                  }}
                  placeholder="e.g. Bracelets, Drop Earrings"
                  className="h-8 text-xs rounded-xl mt-1"
                  required
                />
              </div>

              <div>
                <Label className="text-xs">Slug (URL Identifier) *</Label>
                <Input
                  value={formData.slug}
                  onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                  placeholder="e.g. bracelets, drop-earrings"
                  className="h-8 text-xs rounded-xl mt-1 font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Parent Category</Label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, parentId: e.target.value }))}
                  className="mt-1 block w-full rounded-xl border border-[#E6D8D0] dark:border-border bg-white dark:bg-background px-3 py-1.5 text-xs text-[#342824] dark:text-foreground"
                >
                  <option value="">(None — Top Level Root Category)</option>
                  {flatCategories
                    .filter((c) => c.id !== editingId)
                    .map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.slug})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <Label className="text-xs">Display Order</Label>
                <Input
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: Number(e.target.value) }))}
                  className="h-8 text-xs rounded-xl mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description of this jewellery category"
                className="h-8 text-xs rounded-xl mt-1"
              />
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={formData.isPublished}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isPublished: e.target.checked }))}
                  className="rounded accent-[#B66F72]"
                />
                <span>Published (Visible to customers)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="rounded accent-[#B66F72]"
                />
                <span>Active</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E6D8D0]/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowForm(false)}
                className="text-xs rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl">
                {editingId ? "Update Category" : "Save Category"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Categories Tree */}
      {loading ? (
        <div className="py-12 text-center text-xs text-[#756861]">Loading Studio categories...</div>
      ) : categoriesTree.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-[#E6D8D0] bg-white rounded-2xl">
          <FolderTree className="w-10 h-10 text-[#B0A0A0] mx-auto mb-2 opacity-60" />
          <p className="text-xs text-[#756861]">No Studio categories configured yet.</p>
          <Button
            type="button"
            onClick={() => handleOpenCreate()}
            variant="outline"
            size="sm"
            className="mt-3 text-xs"
          >
            Create First Category
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {categoriesTree.map((root) => renderCategoryNode(root, 0))}
        </div>
      )}
    </div>
  );
};

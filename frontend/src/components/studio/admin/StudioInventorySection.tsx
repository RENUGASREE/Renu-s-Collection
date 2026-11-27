import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { fetchStudioInventory } from "@/lib/studio/independentStudioApi";
import type {
  IStudioInventoryResponse,
  IStudioInventoryMaterialItem,
  IStudioInventoryVariantItem,
  IStudioInventoryFilterOptions,
} from "@/types/studio.types";
import {
  Boxes,
  Layers,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Filter,
  Info,
  ShieldCheck,
  Package,
} from "lucide-react";

interface StudioInventorySectionProps {
  onNavigateToMaterial?: (materialId: string) => void;
}

export const StudioInventorySection: React.FC<StudioInventorySectionProps> = ({
  onNavigateToMaterial,
}) => {
  const { toast } = useToast();
  const [data, setData] = useState<IStudioInventoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Set<string>>(new Set());

  // Filter state
  const [filters, setFilters] = useState<IStudioInventoryFilterOptions>({
    search: "",
    category: "all",
    componentType: "all",
    stockStatus: "all",
    inventorySource: "all",
    status: "all",
    published: "all",
  });

  const loadInventory = async (currentFilters = filters) => {
    setLoading(true);
    try {
      const res = await fetchStudioInventory(currentFilters);
      setData(res);
    } catch (err: any) {
      toast({
        title: "Failed to load Studio Inventory",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory(filters);
  }, [
    filters.category,
    filters.componentType,
    filters.stockStatus,
    filters.inventorySource,
    filters.status,
    filters.published,
  ]);

  // Handle search debouncing or direct submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadInventory(filters);
  };

  const toggleExpand = (materialId: string) => {
    setExpandedMaterialIds((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!data?.materials) return;
    setExpandedMaterialIds(new Set(data.materials.map((m) => m.id)));
  };

  const collapseAll = () => {
    setExpandedMaterialIds(new Set());
  };

  const resetFilters = () => {
    const defaultFilters: IStudioInventoryFilterOptions = {
      search: "",
      category: "all",
      componentType: "all",
      stockStatus: "all",
      inventorySource: "all",
      status: "all",
      published: "all",
    };
    setFilters(defaultFilters);
    loadInventory(defaultFilters);
  };

  const summary = data?.summary;
  const materials = data?.materials || [];
  const categories = data?.categories || [];
  const componentTypes = data?.componentTypes || [];

  return (
    <div className="space-y-6">
      {/* HEADER / INFORMATION BANNER */}
      <div className="bg-white dark:bg-card p-6 rounded-2xl border border-[#E6D8D0] dark:border-border shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-[#B66F72]/10 text-[#B66F72] rounded-xl">
                <Boxes className="w-5 h-5" />
              </span>
              <div>
                <h2 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
                  Studio Inventory Dashboard
                </h2>
                <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                  Authoritative stock and reservation tracking for materials used in Create Your Own Studio.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadInventory(filters)}
              disabled={loading}
              className="text-xs rounded-xl border-[#E6D8D0] dark:border-border flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>Refresh Stock</span>
            </Button>
            {materials.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={expandAll}
                  className="text-xs text-[#756861] hover:text-[#342824]"
                >
                  Expand All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={collapseAll}
                  className="text-xs text-[#756861] hover:text-[#342824]"
                >
                  Collapse All
                </Button>
              </>
            )}
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
          <Card className="bg-[#FBF7F3] dark:bg-muted/20 border-[#E6D8D0] dark:border-border">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-[#756861] uppercase tracking-wider block">
                Total Materials
              </span>
              <div className="text-2xl font-bold font-playfair text-[#342824] dark:text-foreground mt-1">
                {summary ? summary.totalMaterials : "—"}
              </div>
              <span className="text-[10px] text-[#756861] mt-0.5 block">
                Active & draft Studio materials
              </span>
            </CardContent>
          </Card>

          <Card className="bg-[#FBF7F3] dark:bg-muted/20 border-[#E6D8D0] dark:border-border">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-[#756861] uppercase tracking-wider block">
                Total Variants
              </span>
              <div className="text-2xl font-bold font-playfair text-[#342824] dark:text-foreground mt-1">
                {summary ? summary.totalVariants : "—"}
              </div>
              <span className="text-[10px] text-[#756861] mt-0.5 block">
                Tracked SKUs across all materials
              </span>
            </CardContent>
          </Card>

          <Card className="bg-[#FBF7F3] dark:bg-muted/20 border-[#E6D8D0] dark:border-border">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-[#756861] uppercase tracking-wider block">
                Available Units
              </span>
              <div className="text-2xl font-bold font-playfair text-emerald-700 dark:text-emerald-400 mt-1">
                {summary ? summary.totalAvailableUnits.toLocaleString() : "—"}
              </div>
              <span className="text-[10px] text-[#756861] mt-0.5 block">
                Authoritative ready-to-use units
              </span>
            </CardContent>
          </Card>

          <Card className="bg-[#FBF7F3] dark:bg-muted/20 border-[#E6D8D0] dark:border-border">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-[#756861] uppercase tracking-wider block">
                Reserved Units
              </span>
              <div className="text-2xl font-bold font-playfair text-amber-600 dark:text-amber-400 mt-1">
                {summary ? summary.totalReservedUnits.toLocaleString() : "—"}
              </div>
              <span className="text-[10px] text-[#756861] mt-0.5 block">
                Held in pending checkout orders
              </span>
            </CardContent>
          </Card>

          <Card className="bg-[#FBF7F3] dark:bg-muted/20 border-[#E6D8D0] dark:border-border col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <span className="text-[11px] font-medium text-[#756861] uppercase tracking-wider block">
                Out-of-Stock Variants
              </span>
              <div
                className={`text-2xl font-bold font-playfair mt-1 ${
                  summary && summary.outOfStockVariants > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-stone-700 dark:text-foreground"
                }`}
              >
                {summary ? summary.outOfStockVariants : "—"}
              </div>
              <span className="text-[10px] text-[#756861] mt-0.5 block">
                {summary && summary.lowStockVariants > 0
                  ? `+ ${summary.lowStockVariants} low stock`
                  : "0 units remaining"}
              </span>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="bg-white dark:bg-card p-5 rounded-2xl border border-[#E6D8D0] dark:border-border space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#756861] uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            <span>Search & Filter Materials</span>
          </div>
          {(filters.search ||
            filters.category !== "all" ||
            filters.componentType !== "all" ||
            filters.stockStatus !== "all" ||
            filters.inventorySource !== "all" ||
            filters.status !== "all" ||
            filters.published !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="text-xs text-[#B66F72] hover:text-[#8D484B] h-7 px-2"
            >
              Reset Filters
            </Button>
          )}
        </div>

        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="space-y-1">
            <Label className="text-xs">Search by Name or SKU</Label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <Input
                placeholder="e.g. Gold Bead, CH-001..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="h-9 pl-8 text-xs rounded-xl"
              />
            </div>
          </div>

          {/* Studio Category Filter */}
          <div className="space-y-1">
            <Label className="text-xs">Studio Category</Label>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="w-full h-9 px-3 rounded-xl border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
            >
              <option value="all">All Studio Categories</option>
              {categories.map((c) => (
                <option key={c.id || c.slug} value={c.slug || c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Component Type Filter */}
          <div className="space-y-1">
            <Label className="text-xs">Component Type</Label>
            <select
              value={filters.componentType}
              onChange={(e) => setFilters({ ...filters, componentType: e.target.value })}
              className="w-full h-9 px-3 rounded-xl border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
            >
              <option value="all">All Component Types</option>
              {componentTypes.map((t) => (
                <option key={t.typeId} value={t.typeId}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>

          {/* Stock Status Filter */}
          <div className="space-y-1">
            <Label className="text-xs">Stock Level</Label>
            <select
              value={filters.stockStatus}
              onChange={(e) => setFilters({ ...filters, stockStatus: e.target.value as any })}
              className="w-full h-9 px-3 rounded-xl border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
            >
              <option value="all">All Stock Levels</option>
              <option value="in_stock">In Stock (&gt; 0)</option>
              <option value="low_stock">Low Stock (≤ threshold)</option>
              <option value="out_of_stock">Out of Stock (0 units)</option>
            </select>
          </div>

          {/* Inventory Source Filter */}
          <div className="space-y-1">
            <Label className="text-xs">Inventory Source</Label>
            <select
              value={filters.inventorySource}
              onChange={(e) => setFilters({ ...filters, inventorySource: e.target.value })}
              className="w-full h-9 px-3 rounded-xl border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
            >
              <option value="all">All Sources</option>
              <option value="independent">Independent Studio</option>
              <option value="studio_direct">Studio Direct</option>
              <option value="store_customization">Store Customization (Linked)</option>
              <option value="inventory_pool">Inventory Pool (Linked)</option>
            </select>
          </div>

          {/* Active / Inactive Status */}
          <div className="space-y-1">
            <Label className="text-xs">Active Status</Label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
              className="w-full h-9 px-3 rounded-xl border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Published Status */}
          <div className="space-y-1">
            <Label className="text-xs">Storefront Published</Label>
            <select
              value={filters.published}
              onChange={(e) => setFilters({ ...filters, published: e.target.value as any })}
              className="w-full h-9 px-3 rounded-xl border border-[#E6D8D0] bg-white text-xs dark:bg-card dark:border-border"
            >
              <option value="all">All (Published & Drafts)</option>
              <option value="published">Published to Studio</option>
              <option value="unpublished">Draft / Unpublished</option>
            </select>
          </div>

          {/* Apply button */}
          <div className="flex items-end">
            <Button
              type="submit"
              size="sm"
              className="w-full h-9 bg-[#B66F72] hover:bg-[#8D484B] text-white text-xs rounded-xl"
            >
              Apply Search
            </Button>
          </div>
        </form>
      </div>

      {/* MATERIALS & VARIANTS TABLE */}
      <div className="bg-white dark:bg-card rounded-2xl border border-[#E6D8D0] dark:border-border overflow-hidden shadow-xs">
        <div className="p-4 border-b border-[#E6D8D0] dark:border-border flex items-center justify-between">
          <div className="text-xs font-semibold text-[#342824] dark:text-foreground">
            Materials ({materials.length})
          </div>
          <div className="text-[11px] text-[#756861]">
            Click any material row to inspect its variant breakdown and reserve logs.
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-[#756861] flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-[#B66F72]" />
            <span>Calculating authoritative Studio inventory...</span>
          </div>
        ) : materials.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#756861]">
            No studio materials matched your current search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FBF7F3] dark:bg-muted/30 text-[#756861] uppercase tracking-wider text-[10px] font-semibold border-b border-[#E6D8D0] dark:border-border">
                <tr>
                  <th className="py-3 px-4 w-8"></th>
                  <th className="py-3 px-4">Material Name & Code</th>
                  <th className="py-3 px-4">Component Type</th>
                  <th className="py-3 px-4">Studio Category</th>
                  <th className="py-3 px-4 text-center">Variants</th>
                  <th className="py-3 px-4 text-right">Available Units</th>
                  <th className="py-3 px-4 text-right">Reserved Units</th>
                  <th className="py-3 px-4">Inventory Source</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6D8D0]/60 dark:divide-border/60">
                {materials.map((mat) => {
                  const isExpanded = expandedMaterialIds.has(mat.id);
                  return (
                    <React.Fragment key={mat.id}>
                      <tr
                        onClick={() => toggleExpand(mat.id)}
                        className={`hover:bg-stone-50/70 dark:hover:bg-muted/10 cursor-pointer transition-colors ${
                          isExpanded ? "bg-stone-50/40 dark:bg-muted/5" : ""
                        }`}
                      >
                        {/* Expand Chevron */}
                        <td className="py-3 px-4 text-stone-400">
                          {mat.variantCount > 0 ? (
                            isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-[#B66F72]" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )
                          ) : (
                            <span className="w-4 h-4 block" />
                          )}
                        </td>

                        {/* Name & Code */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {mat.imageUrl ? (
                              <img
                                src={mat.imageUrl}
                                alt={mat.name}
                                className="w-9 h-9 rounded-lg object-cover border border-[#E6D8D0]/60 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-stone-100 dark:bg-muted/40 border border-[#E6D8D0]/60 flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4 text-stone-400" />
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-[#342824] dark:text-foreground text-xs flex items-center gap-2">
                                <span>{mat.name}</span>
                                {mat.selectionPolicy === "seller_random_variant" && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] py-0 px-1.5 border-purple-200 bg-purple-50 text-purple-700"
                                    title="Seller-Random Assortment: reserved from pool, allocated by admin after order"
                                  >
                                    Assortment Pool
                                  </Badge>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-[#756861] dark:text-muted-foreground">
                                {mat.code}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Component Type */}
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-wider font-semibold border-[#B99A72]/30 text-[#B99A72]"
                          >
                            {mat.componentType}
                          </Badge>
                        </td>

                        {/* Categories */}
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap gap-1 max-w-[180px]">
                            {mat.categories.length > 0 ? (
                              mat.categories.map((catSlug) => {
                                const catObj = categories.find(
                                  (c) => c.slug === catSlug || c.id === catSlug
                                );
                                return (
                                  <Badge
                                    key={catSlug}
                                    variant="secondary"
                                    className="text-[9px] py-0 px-1 bg-stone-100 text-stone-700"
                                  >
                                    {catObj?.name || catSlug}
                                  </Badge>
                                );
                              })
                            ) : (
                              <span className="text-[10px] text-stone-400">All Categories</span>
                            )}
                          </div>
                        </td>

                        {/* Variants Count */}
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              mat.variantCount > 0
                                ? "bg-stone-100 text-[#342824]"
                                : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {mat.variantCount}
                          </span>
                        </td>

                        {/* Available Stock */}
                        <td className="py-3 px-4 text-right">
                          {mat.variantCount === 0 ? (
                            <span className="text-stone-400 text-[11px] italic">Not Tracked</span>
                          ) : (
                            <div className="font-semibold text-xs">
                              <span
                                className={
                                  mat.totalAvailableStock === 0
                                    ? "text-rose-600 dark:text-rose-400 font-bold"
                                    : mat.isLowStock
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-emerald-700 dark:text-emerald-400"
                                }
                              >
                                {mat.totalAvailableStock.toLocaleString()}
                              </span>
                              <span className="text-[10px] text-stone-400 ml-1">units</span>
                            </div>
                          )}
                        </td>

                        {/* Reserved Stock */}
                        <td className="py-3 px-4 text-right">
                          {mat.totalReservedStock > 0 ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px] font-mono">
                              {mat.totalReservedStock} reserved
                            </Badge>
                          ) : (
                            <span className="text-stone-300 dark:text-stone-600">—</span>
                          )}
                        </td>

                        {/* Inventory Source */}
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              mat.authoritativeSource === "customization"
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : mat.authoritativeSource === "inventory"
                                ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                : "bg-stone-50 text-stone-700 border-stone-200"
                            }`}
                          >
                            {mat.inventorySource}
                          </Badge>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex flex-col items-center gap-1">
                            {mat.isActive ? (
                              <Badge className="text-[9px] py-0 px-1 bg-emerald-100 text-emerald-800 border-emerald-200">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 text-stone-400 border-stone-300">
                                Inactive
                              </Badge>
                            )}

                            {mat.isPublished ? (
                              <span className="text-[9px] text-emerald-700 flex items-center gap-0.5">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Published
                              </span>
                            ) : (
                              <span className="text-[9px] text-amber-600 flex items-center gap-0.5">
                                <Clock className="w-2.5 h-2.5" /> Draft
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Action: Edit Material */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {onNavigateToMaterial && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onNavigateToMaterial(mat.id)}
                              className="h-7 text-xs text-[#B66F72] hover:text-[#8D484B] hover:bg-[#F1E6DF]/50 px-2"
                              title="Edit material details and variants"
                            >
                              <span>Edit</span>
                              <ExternalLink className="w-3 h-3 ml-1" />
                            </Button>
                          )}
                        </td>
                      </tr>

                      {/* EXPANDED ROW: VARIANTS LIST */}
                      {isExpanded && (
                        <tr className="bg-stone-50/50 dark:bg-muted/10 border-b border-[#E6D8D0]/60">
                          <td colSpan={10} className="p-4 pl-12">
                            {mat.variants.length === 0 ? (
                              <div className="py-4 text-center text-xs text-stone-400 bg-white dark:bg-card rounded-xl border border-dashed border-[#E6D8D0]">
                                No variants created for this material yet. Stock is not tracked until at least one variant is configured.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="text-[11px] font-semibold text-[#756861] uppercase tracking-wider flex items-center justify-between">
                                  <span>Variant Breakdown ({mat.variants.length})</span>
                                  {mat.selectionPolicy === "seller_random_variant" && (
                                    <span className="text-[10px] text-purple-700 lowercase font-normal italic">
                                      * Assortment pool eligible units are deducted upon admin variant allocation.
                                    </span>
                                  )}
                                </div>
                                <div className="bg-white dark:bg-card rounded-xl border border-[#E6D8D0] overflow-hidden shadow-2xs">
                                  <table className="w-full text-left text-xs">
                                    <thead className="bg-[#FBF7F3] dark:bg-muted/20 text-[#756861] text-[10px] font-semibold border-b border-[#E6D8D0]">
                                      <tr>
                                        <th className="py-2 px-3">Variant / Size</th>
                                        <th className="py-2 px-3">SKU</th>
                                        <th className="py-2 px-3 text-right">Available Stock</th>
                                        <th className="py-2 px-3 text-right">Reserved Units</th>
                                        <th className="py-2 px-3 text-center">Low Stock Alert</th>
                                        <th className="py-2 px-3">Inventory Source</th>
                                        <th className="py-2 px-3 text-center">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E6D8D0]/40">
                                      {mat.variants.map((v) => (
                                        <tr key={v.id} className="hover:bg-stone-50/40">
                                          <td className="py-2 px-3 font-medium text-[#342824]">
                                            {v.sizeLabel || v.name}
                                            {v.color && (
                                              <span className="text-[10px] text-stone-400 ml-1">
                                                ({v.color})
                                              </span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 font-mono text-[11px] text-[#B99A72]">
                                            {v.sku}
                                          </td>
                                          <td className="py-2 px-3 text-right font-semibold">
                                            <span
                                              className={
                                                v.isOutOfStock
                                                  ? "text-rose-600 font-bold"
                                                  : v.isLowStock
                                                  ? "text-amber-600"
                                                  : "text-emerald-700"
                                              }
                                            >
                                              {v.availableQuantity}
                                            </span>
                                            <span className="text-[10px] text-stone-400 ml-1">
                                              units
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-right">
                                            {v.reservedQuantity > 0 ? (
                                              <Badge className="bg-amber-50 text-amber-800 border-amber-200 text-[9px] font-mono">
                                                {v.reservedQuantity}
                                              </Badge>
                                            ) : (
                                              <span className="text-stone-300">—</span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-center">
                                            {v.isOutOfStock ? (
                                              <Badge className="bg-rose-100 text-rose-800 border-rose-200 text-[9px]">
                                                Out of Stock
                                              </Badge>
                                            ) : v.isLowStock ? (
                                              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px] flex items-center gap-1 inline-flex">
                                                <AlertTriangle className="w-2.5 h-2.5" />
                                                <span>Low (≤ {v.lowStockThreshold})</span>
                                              </Badge>
                                            ) : (
                                              <span className="text-[10px] text-stone-400">Normal</span>
                                            )}
                                          </td>
                                          <td className="py-2 px-3 text-[10px] text-stone-500">
                                            {v.inventorySource}
                                          </td>
                                          <td className="py-2 px-3 text-center">
                                            {v.isActive ? (
                                              <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200 text-[9px]">
                                                Active
                                              </Badge>
                                            ) : (
                                              <Badge variant="outline" className="text-[9px] text-stone-400">
                                                Inactive
                                              </Badge>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

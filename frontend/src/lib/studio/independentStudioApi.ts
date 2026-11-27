import { apiRequest } from "@/lib/queryClient";
import type {
  IStudioCategory,
  IStudioConstructionMethod,
  IStudioDesignRule,
  IStudioAssemblyStructure,
  IStudioMaterialLink,
  PhysicalSpecsConfig,
} from "@/types/studio.types";

// ============================================================================
// CATEGORIES & SUBCATEGORIES
// ============================================================================

export async function fetchStudioCategoriesTree(onlyPublished = false): Promise<IStudioCategory[]> {
  const res = await apiRequest("GET", `/api/v1/studio/categories/tree${onlyPublished ? "?published=true" : ""}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchStudioCategories(onlyPublished = false): Promise<IStudioCategory[]> {
  const res = await apiRequest("GET", `/api/v1/studio/categories${onlyPublished ? "?published=true" : ""}`);
  const json = await res.json();
  return json.data || [];
}

export async function createStudioCategory(data: Partial<IStudioCategory>): Promise<IStudioCategory> {
  const res = await apiRequest("POST", "/api/v1/studio/admin/categories", data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to create category");
  return json.data;
}

export async function updateStudioCategory(id: string, data: Partial<IStudioCategory>): Promise<IStudioCategory> {
  const res = await apiRequest("PATCH", `/api/v1/studio/admin/categories/${id}`, data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to update category");
  return json.data;
}

export async function deleteStudioCategory(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/admin/categories/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to delete category");
}

// ============================================================================
// CONSTRUCTION METHODS
// ============================================================================

export async function fetchConstructionMethods(onlyPublished = false): Promise<IStudioConstructionMethod[]> {
  const res = await apiRequest("GET", `/api/v1/studio/methods${onlyPublished ? "?published=true" : ""}`);
  const json = await res.json();
  return json.data || [];
}

export async function fetchMethodsForSubcategory(subcategoryId: string, onlyPublished = true): Promise<IStudioConstructionMethod[]> {
  const res = await apiRequest("GET", `/api/v1/studio/subcategories/${subcategoryId}/methods${onlyPublished ? "?published=true" : "?published=false"}`);
  const json = await res.json();
  return json.data || [];
}

export async function createConstructionMethod(data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
  const res = await apiRequest("POST", "/api/v1/studio/admin/methods", data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to create construction method");
  return json.data;
}

export async function updateConstructionMethod(id: string, data: Partial<IStudioConstructionMethod>): Promise<IStudioConstructionMethod> {
  const res = await apiRequest("PATCH", `/api/v1/studio/admin/methods/${id}`, data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to update construction method");
  return json.data;
}

export async function deleteConstructionMethod(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/admin/methods/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to delete construction method");
}

export async function assignMethodToSubcategory(subcategoryId: string, methodId: string, isPublished = true): Promise<void> {
  const res = await apiRequest("POST", `/api/v1/studio/admin/subcategories/${subcategoryId}/methods/${methodId}`, { isPublished });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to assign method to subcategory");
}

export async function removeMethodFromSubcategory(subcategoryId: string, methodId: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/admin/subcategories/${subcategoryId}/methods/${methodId}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to remove method from subcategory");
}

// ============================================================================
// DESIGN RULES
// ============================================================================

export async function fetchStudioDesignRules(params?: { categoryId?: string; constructionMethodId?: string; onlyPublished?: boolean }): Promise<IStudioDesignRule[]> {
  const q = new URLSearchParams();
  if (params?.categoryId) q.set("categoryId", params.categoryId);
  if (params?.constructionMethodId) q.set("constructionMethodId", params.constructionMethodId);
  if (params?.onlyPublished) q.set("published", "true");
  const res = await apiRequest("GET", `/api/v1/studio/design-rules?${q.toString()}`);
  const json = await res.json();
  return json.data || [];
}

export async function createStudioDesignRule(data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
  const res = await apiRequest("POST", "/api/v1/studio/admin/design-rules", data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to create design rule");
  return json.data;
}

export async function updateStudioDesignRule(id: string, data: Partial<IStudioDesignRule>): Promise<IStudioDesignRule> {
  const res = await apiRequest("PATCH", `/api/v1/studio/admin/design-rules/${id}`, data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to update design rule");
  return json.data;
}

export async function duplicateStudioDesignRule(id: string, name?: string): Promise<IStudioDesignRule> {
  const res = await apiRequest("POST", `/api/v1/studio/admin/design-rules/${id}/duplicate`, { name });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to duplicate design rule");
  return json.data;
}

export async function deleteStudioDesignRule(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/admin/design-rules/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to delete design rule");
}

// ============================================================================
// VISUAL ASSEMBLY STRUCTURES
// ============================================================================

export async function fetchAssemblyStructure(methodId: string, subcategoryId?: string): Promise<IStudioAssemblyStructure | null> {
  const url = `/api/v1/studio/methods/${methodId}/assembly${subcategoryId ? `?subcategoryId=${subcategoryId}` : ""}`;
  const res = await apiRequest("GET", url);
  const json = await res.json();
  return json.data || null;
}

export async function saveAssemblyStructure(data: Partial<IStudioAssemblyStructure>): Promise<IStudioAssemblyStructure> {
  const res = await apiRequest("POST", "/api/v1/studio/admin/assembly", data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to save visual assembly structure");
  return json.data;
}

export async function deleteAssemblyStructure(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/admin/assembly/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to delete assembly structure");
}

// ============================================================================
// MATERIAL LINKS
// ============================================================================

export async function fetchMaterialLinks(): Promise<IStudioMaterialLink[]> {
  const res = await apiRequest("GET", "/api/v1/studio/admin/material-links");
  const json = await res.json();
  return json.data || [];
}

export async function createMaterialLink(data: Partial<IStudioMaterialLink>): Promise<IStudioMaterialLink> {
  const res = await apiRequest("POST", "/api/v1/studio/admin/material-links", data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to create material link");
  return json.data;
}

export async function updateMaterialLink(id: string, data: Partial<IStudioMaterialLink>): Promise<IStudioMaterialLink> {
  const res = await apiRequest("PATCH", `/api/v1/studio/admin/material-links/${id}`, data);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to update material link");
  return json.data;
}

export async function deleteMaterialLink(id: string): Promise<void> {
  const res = await apiRequest("DELETE", `/api/v1/studio/admin/material-links/${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Failed to delete material link");
}

// ============================================================================
// PHYSICAL CALIBRATION PROBE
// ============================================================================

export async function probePhysicalFit(specs: PhysicalSpecsConfig, components: Array<{ diameterMm?: number; widthMm?: number }>) {
  const res = await apiRequest("POST", "/api/v1/studio/physical-fit", { specs, components });
  const json = await res.json();
  return json.data;
}

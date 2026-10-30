import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest, API_BASE_URL, refreshAccessToken, getAssetUrl } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AdminNav from "@/components/AdminNav";
import {
  ArrowLeft,
  Package,
  ImageIcon,
  Star,
  ChevronUp,
  ChevronDown,
  X,
  Plus,
  AlertCircle,
  Upload,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

interface MediaItem {
  url: string;
  alt?: string;
  type: "image" | "video";
  isPrimary: boolean;
  sortOrder: number;
}

interface ProductFormData {
  name: string;
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  categoryId: string;
  subcategoryId: string | null;
  isActive: boolean;
  isCustomizable: boolean;
  isSignaturePiece: boolean;
  signatureCategory: string;
  badge: string | null;
  description: string;
  additionalInfo: string;
  imageUrl: string;
  media: MediaItem[];
}

export default function AdminProductForm() {
  const { token } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId?: string }>();
  const isEditing = !!productId;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    name: "",
    sku: "",
    price: 0,
    salePrice: null,
    stock: 0,
    categoryId: "",
    subcategoryId: null,
    isActive: true,
    isCustomizable: true,
    isSignaturePiece: false,
    signatureCategory: "none",
    badge: null,
    description: "",
    additionalInfo: "",
    imageUrl: "",
    media: [],
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await apiRequest("GET", "/api/v1/categories");
        const data = await response.json();
        const allCategories = data.data || [];
        console.log("All categories:", allCategories);
        setCategories(allCategories);
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      }
    };
    fetchCategories();

    if (isEditing) {
      const fetchProduct = async () => {
        try {
          const response = await apiRequest("GET", `/api/v1/products/${productId}`);
          const data = await response.json();
          const product = data.data;
          console.log("Product data:", product);

          // Normalize media items
          let initialMedia: MediaItem[] = [];
          if (Array.isArray(product.media) && product.media.length > 0) {
            initialMedia = product.media.map((m: any, idx: number) => ({
              url: m.url,
              alt: m.alt || "",
              type: m.type || "image",
              isPrimary: m.isPrimary ?? idx === 0,
              sortOrder: m.sortOrder ?? idx,
            }));
          } else if (product.imageUrl) {
            initialMedia = [
              {
                url: product.imageUrl,
                alt: product.name || "",
                type: "image",
                isPrimary: true,
                sortOrder: 0,
              },
            ];
          }

          // Ensure exactly one primary image if media is not empty
          if (initialMedia.length > 0 && !initialMedia.some((m) => m.isPrimary)) {
            initialMedia[0].isPrimary = true;
          }

          setFormData({
            name: product.name || "",
            sku: product.sku || "",
            price: product.price || 0,
            salePrice: product.salePrice || null,
            stock: product.stock || 0,
            categoryId: product.categoryId || "",
            subcategoryId: product.subcategoryId || null,
            isActive: product.isActive ?? true,
            isCustomizable: product.isCustomizable ?? true,
            isSignaturePiece: product.isSignaturePiece ?? false,
            signatureCategory: product.signatureCategory || "none",
            badge: product.badge || null,
            description: product.description || "",
            additionalInfo: product.additionalInfo || "",
            imageUrl: initialMedia.find((m) => m.isPrimary)?.url || product.imageUrl || "",
            media: initialMedia,
          });
        } catch (error) {
          console.error("Failed to fetch product:", error);
        }
      };
      fetchProduct();
    }
  }, [productId, isEditing]);

  // Load subcategories when category changes
  useEffect(() => {
    if (formData.categoryId) {
      const subs = categories.filter((c: any) => {
        const parentId = c.parentId ? String(c.parentId) : null;
        return parentId === formData.categoryId;
      });
      console.log("Subcategories for category", formData.categoryId, ":", subs);
      setSubcategories(subs);
    } else {
      setSubcategories([]);
    }
  }, [formData.categoryId, categories]);

  const handleAddImage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = newImageUrl.trim();
    if (!url) return;

    setFormData((prev) => {
      const nextMedia = [...prev.media];
      const isFirst = nextMedia.length === 0;
      nextMedia.push({
        url,
        alt: prev.name || "",
        type: "image",
        isPrimary: isFirst,
        sortOrder: nextMedia.length,
      });

      return {
        ...prev,
        imageUrl: isFirst ? url : prev.imageUrl,
        media: nextMedia,
      };
    });

    setNewImageUrl("");
  };

  const handleRemoveImage = (index: number) => {
    setFormData((prev) => {
      const filtered = prev.media.filter((_, idx) => idx !== index);
      let updated = filtered.map((item, idx) => ({ ...item, sortOrder: idx }));

      if (updated.length > 0 && !updated.some((m) => m.isPrimary)) {
        updated[0].isPrimary = true;
      }

      const primaryUrl = updated.find((m) => m.isPrimary)?.url || "";
      return {
        ...prev,
        imageUrl: primaryUrl,
        media: updated,
      };
    });
  };

  const handleSetPrimary = (index: number) => {
    setFormData((prev) => {
      const updated = prev.media.map((item, idx) => ({
        ...item,
        isPrimary: idx === index,
      }));
      const primaryUrl = updated[index]?.url || prev.imageUrl;
      return {
        ...prev,
        imageUrl: primaryUrl,
        media: updated,
      };
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Validate client-side
    const validFiles: File[] = [];
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowedTypes.includes(file.type.toLowerCase())) {
        toast({
          title: "Unsupported file type",
          description: `"${file.name}" is not a JPEG, PNG, or WebP image.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `"${file.name}" exceeds the 20MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      validFiles.push(file);
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadError(null);

    try {
      const uploadFormData = new FormData();
      validFiles.forEach((file) => {
        uploadFormData.append("images", file);
      });

      let currentToken = localStorage.getItem("authToken");

      const doUpload = (authToken: string | null): Promise<any> => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `${API_BASE_URL}/api/v1/products/images/upload`);
          xhr.withCredentials = true;

          if (authToken) {
            xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
          }

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 90);
              setUploadProgress(Math.max(10, percent));
            }
          };

          xhr.onload = () => {
            let json: any = null;
            try {
              json = JSON.parse(xhr.responseText);
            } catch (_) {
              // ignore
            }

            if (xhr.status >= 200 && xhr.status < 300 && json?.success) {
              resolve(json);
            } else {
              const msg =
                json?.message ||
                json?.error ||
                `Upload failed with HTTP status ${xhr.status}`;
              reject(new Error(msg));
            }
          };

          xhr.onerror = () => {
            reject(new Error("Network error during image upload. Check server connection."));
          };

          xhr.send(uploadFormData);
        });
      };

      let uploadResult: any;
      try {
        uploadResult = await doUpload(currentToken);
      } catch (firstErr: any) {
        // If 401, try token refresh once
        if (firstErr?.message?.includes("401") || firstErr?.message?.includes("Authentication")) {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            currentToken = localStorage.getItem("authToken");
            uploadResult = await doUpload(currentToken);
          } else {
            throw firstErr;
          }
        } else {
          throw firstErr;
        }
      }

      setUploadProgress(100);

      const uploadedItems = uploadResult.data || [];
      if (uploadedItems.length > 0) {
        setFormData((prev) => {
          const nextMedia = [...prev.media];
          uploadedItems.forEach((uploaded: any) => {
            const isFirst = nextMedia.length === 0;
            nextMedia.push({
              url: uploaded.secureUrl || uploaded.url,
              alt: prev.name || uploaded.originalFilename || "",
              type: "image",
              isPrimary: isFirst,
              sortOrder: nextMedia.length,
            });
          });

          const primaryUrl = nextMedia.find((m) => m.isPrimary)?.url || prev.imageUrl;
          return {
            ...prev,
            imageUrl: primaryUrl,
            media: nextMedia,
          };
        });

        toast({
          title: "Images uploaded successfully",
          description: `Added ${uploadedItems.length} image(s) to the gallery.`,
        });
      }
    } catch (err: any) {
      console.error("Direct upload error:", err);
      const errMsg = err?.message || "Failed to upload images. Please try again.";
      setUploadError(errMsg);
      toast({
        title: "Upload Failed",
        description: errMsg,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleMoveImage = (index: number, direction: "up" | "down") => {
    setFormData((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.media.length) return prev;

      const items = [...prev.media];
      const temp = items[index];
      items[index] = items[targetIndex];
      items[targetIndex] = temp;

      const reordered = items.map((item, idx) => ({ ...item, sortOrder: idx }));
      const primaryUrl = reordered.find((m) => m.isPrimary)?.url || prev.imageUrl;

      return {
        ...prev,
        imageUrl: primaryUrl,
        media: reordered,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const primaryMedia = formData.media.find((m) => m.isPrimary);
      const primaryUrl = primaryMedia?.url || formData.media[0]?.url || formData.imageUrl;

      const payload = {
        ...formData,
        imageUrl: primaryUrl || undefined,
        media: formData.media.length > 0 ? formData.media : undefined,
        salePrice: formData.salePrice || undefined,
        badge: formData.badge || undefined,
        subcategoryId: formData.subcategoryId || undefined,
        additionalInfo: formData.additionalInfo ? formData.additionalInfo.trim() : (isEditing ? "" : undefined),
      };

      let response;
      if (isEditing) {
        response = await apiRequest("PATCH", `/api/v1/products/${productId}`, payload);
      } else {
        response = await apiRequest("POST", "/api/v1/products", payload);
      }

      if (response.ok) {
        navigate("/admin/products");
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.errors
          ? JSON.stringify(errorData.errors, null, 2)
          : errorData.message || "Failed to save product";
        alert(`Failed to save product: ${errorMessage}`);
      }
    } catch (error) {
      console.error("Failed to save product:", error);
      alert("Failed to save product");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : type === "number"
          ? parseFloat(value) || 0
          : value,
    }));
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex items-center justify-center">
        <div className="text-center p-6">
          <AlertCircle className="h-10 w-10 text-[#B66F72] dark:text-primary mx-auto mb-3" />
          <p className="font-playfair text-lg text-[#342824] dark:text-foreground">Please log in to access the admin panel</p>
        </div>
      </div>
    );
  }

  const inputCls =
    "border-[#E6D8D0] dark:border-border bg-white dark:bg-background focus-visible:ring-[#B66F72]/30 text-[#342824] dark:text-foreground";
  const labelCls = "text-sm font-medium text-[#342824] dark:text-foreground";
  const selectCls =
    "w-full px-3 py-2 border border-[#E6D8D0] dark:border-border rounded-md bg-white dark:bg-background text-[#342824] dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-[#B66F72]/30";

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO
        title={isEditing ? "Edit Product — Renu's Collections" : "Add Product — Renu's Collections"}
        noindex
      />
      <main className="container mx-auto px-4 py-8 pt-20 max-w-4xl">
        <AdminNav className="mb-6" />

        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/products")}
            className="text-[#756861] hover:text-[#342824] dark:hover:text-foreground hover:bg-[#F1E6DF] dark:hover:bg-muted -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Products
          </Button>
          <span className="text-[#E6D8D0] dark:text-border">/</span>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#B66F72] dark:text-primary" />
            <h1 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
              {isEditing ? "Edit Product" : "Add New Product"}
            </h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Details */}
          <Card className="bg-white dark:bg-card border-[#E6D8D0] dark:border-border shadow-sm">
            <CardHeader className="pb-4 border-b border-[#E6D8D0] dark:border-border">
              <CardTitle className="font-playfair text-base text-[#342824] dark:text-foreground">
                Basic Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className={labelCls}>Product Name <span className="text-[#B66F72]">*</span></Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} required className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sku" className={labelCls}>SKU <span className="text-[#B66F72]">*</span></Label>
                  <Input id="sku" name="sku" value={formData.sku} onChange={handleChange} required className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="price" className={labelCls}>Price (₹) <span className="text-[#B66F72]">*</span></Label>
                  <Input id="price" name="price" type="number" step="0.01" value={formData.price} onChange={handleChange} required className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="salePrice" className={labelCls}>Sale Price (₹)</Label>
                  <Input id="salePrice" name="salePrice" type="number" step="0.01" value={formData.salePrice || ""} onChange={handleChange} className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="stock" className={labelCls}>Stock <span className="text-[#B66F72]">*</span></Label>
                  <Input id="stock" name="stock" type="number" value={formData.stock} onChange={handleChange} required className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="badge" className={labelCls}>Badge</Label>
                  <Input id="badge" name="badge" value={formData.badge || ""} onChange={handleChange} placeholder="e.g., New, Sale, Best Seller" className={inputCls} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="categoryId" className={labelCls}>Category <span className="text-[#B66F72]">*</span></Label>
                  <select id="categoryId" name="categoryId" value={formData.categoryId} onChange={handleChange} required className={selectCls}>
                    <option value="">Select a category</option>
                    {categories.filter((c) => !c.parentId).map((cat, idx) => (
                      <option key={cat._id || `cat-${idx}`} value={cat._id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="subcategoryId" className={labelCls}>Subcategory</Label>
                  <select id="subcategoryId" name="subcategoryId" value={formData.subcategoryId || ""} onChange={handleChange} className={selectCls}>
                    <option value="">None</option>
                    {subcategories.map((sub, idx) => (
                      <option key={sub._id || `sub-${idx}`} value={sub._id}>{sub.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-1.5">
                <Label htmlFor="description" className={labelCls}>Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                  className={`${inputCls} resize-none`}
                  placeholder="Describe the product for customers..."
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <Label htmlFor="additionalInfo" className={labelCls}>
                  Additional Product Information
                </Label>
                <Textarea
                  id="additionalInfo"
                  name="additionalInfo"
                  value={formData.additionalInfo}
                  onChange={handleChange}
                  rows={4}
                  className={`${inputCls} resize-y min-h-[100px]`}
                  placeholder="Add optional product-specific information, notices, care instructions, material details or special notes..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Product Gallery */}
          <Card className="bg-white dark:bg-card border-[#E6D8D0] dark:border-border shadow-sm">
            <CardHeader className="pb-4 border-b border-[#E6D8D0] dark:border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="font-playfair text-base text-[#342824] dark:text-foreground flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-[#B66F72] dark:text-primary" />
                    Product Gallery
                  </CardTitle>
                  <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                    Upload images directly from your computer or enter image URLs. Set primary, reorder, or remove images.
                  </p>
                </div>

                {/* Direct Upload Button */}
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="bg-[#B66F72] hover:bg-[#95565A] text-white shadow-sm text-xs h-9 px-3.5 gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        <span>Upload Images</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {/* Upload Progress Bar */}
              {isUploading && (
                <div className="p-3 rounded-xl border border-[#B66F72]/30 bg-[#B66F72]/5 dark:bg-primary/5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#B66F72] dark:text-primary font-medium">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading images to secure storage...
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-1.5" />
                </div>
              )}

              {/* Upload Error Banner */}
              {uploadError && !isUploading && (
                <div className="p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{uploadError}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadError(null)}
                    className="h-6 w-6 p-0 text-red-700 dark:text-red-400 hover:bg-red-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Manual URL input option */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="Or enter image URL (e.g. /assets/... or https://...)"
                  className={`flex-1 ${inputCls}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddImage();
                    }
                  }}
                />
                <Button
                  type="button"
                  onClick={() => handleAddImage()}
                  variant="outline"
                  className="border-[#B66F72] text-[#B66F72] hover:bg-[#B66F72]/5 dark:border-primary dark:text-primary shrink-0"
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add URL
                </Button>
              </div>

              {formData.media.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {formData.media.map((item, index) => (
                    <div
                      key={index}
                      className={`relative rounded-xl border p-3 flex flex-col gap-2 transition-all ${
                        item.isPrimary
                          ? "border-[#B66F72] ring-2 ring-[#B66F72]/20 bg-[#B66F72]/5 dark:border-primary dark:ring-primary/20 dark:bg-primary/5"
                          : "border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background hover:border-[#B66F72]/40"
                      }`}
                    >
                      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-[#F1E6DF]/30 dark:bg-muted/30 border border-[#E6D8D0] dark:border-border">
                        <img
                          src={getAssetUrl(item.url)}
                          alt={item.alt || `Product image ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getAssetUrl(null);
                          }}
                        />
                        {item.isPrimary && (
                          <span className="absolute top-2 left-2 bg-[#B66F72] text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm flex items-center gap-1">
                            <Star className="h-2.5 w-2.5 fill-current" />
                            Primary
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-[#756861] dark:text-muted-foreground font-mono truncate" title={item.url}>
                        {item.url}
                      </p>

                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#E6D8D0] dark:border-border">
                        <Button
                          type="button"
                          size="sm"
                          variant={item.isPrimary ? "default" : "outline"}
                          className={`h-7 text-xs px-2 ${
                            item.isPrimary
                              ? "bg-[#B66F72] hover:bg-[#95565A] text-white dark:bg-primary"
                              : "border-[#E6D8D0] dark:border-border hover:bg-[#F1E6DF] dark:hover:bg-muted text-[#756861] dark:text-muted-foreground"
                          }`}
                          onClick={() => handleSetPrimary(index)}
                        >
                          {item.isPrimary ? "Primary" : "Set Primary"}
                        </Button>

                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#756861] dark:text-muted-foreground hover:text-[#342824] dark:hover:text-foreground hover:bg-[#F1E6DF] dark:hover:bg-muted"
                            disabled={index === 0}
                            onClick={() => handleMoveImage(index, "up")}
                            title="Move earlier"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#756861] dark:text-muted-foreground hover:text-[#342824] dark:hover:text-foreground hover:bg-[#F1E6DF] dark:hover:bg-muted"
                            disabled={index === formData.media.length - 1}
                            onClick={() => handleMoveImage(index, "down")}
                            title="Move later"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-[#756861] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            onClick={() => handleRemoveImage(index)}
                            title="Remove image"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border-2 border-dashed border-[#E6D8D0] dark:border-border p-8 text-center">
                  <ImageIcon className="h-8 w-8 text-[#B66F72]/20 dark:text-primary/20 mx-auto mb-2" />
                  <p className="text-sm text-[#756861] dark:text-muted-foreground">
                    No images added yet. Enter a URL above and click "Add Image".
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings */}
          <Card className="bg-white dark:bg-card border-[#E6D8D0] dark:border-border shadow-sm">
            <CardHeader className="pb-4 border-b border-[#E6D8D0] dark:border-border">
              <CardTitle className="font-playfair text-base text-[#342824] dark:text-foreground">
                Product Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* isActive */}
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background cursor-pointer hover:border-[#B66F72]/40 transition-colors group">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 rounded accent-[#B66F72]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[#342824] dark:text-foreground">Active</span>
                    <p className="text-xs text-[#756861] dark:text-muted-foreground">Visible in store</p>
                  </div>
                  {formData.isActive && (
                    <Badge className="ml-auto text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">Live</Badge>
                  )}
                </label>

                {/* isCustomizable */}
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background cursor-pointer hover:border-[#B66F72]/40 transition-colors">
                  <input
                    type="checkbox"
                    name="isCustomizable"
                    checked={formData.isCustomizable}
                    onChange={handleChange}
                    className="w-4 h-4 rounded accent-[#B66F72]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[#342824] dark:text-foreground">Customizable</span>
                    <p className="text-xs text-[#756861] dark:text-muted-foreground">Allow customer options</p>
                  </div>
                </label>

                {/* isSignaturePiece */}
                <label className="flex items-center gap-3 p-3.5 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-background cursor-pointer hover:border-[#B66F72]/40 transition-colors">
                  <input
                    type="checkbox"
                    name="isSignaturePiece"
                    checked={formData.isSignaturePiece}
                    onChange={handleChange}
                    className="w-4 h-4 rounded accent-[#B66F72]"
                  />
                  <div>
                    <span className="text-sm font-medium text-[#342824] dark:text-foreground">Signature Piece</span>
                    <p className="text-xs text-[#756861] dark:text-muted-foreground">Feature on homepage</p>
                  </div>
                </label>
              </div>

              {formData.isSignaturePiece && (
                <div className="space-y-1.5">
                  <Label htmlFor="signatureCategory" className={labelCls}>Signature Category</Label>
                  <select
                    id="signatureCategory"
                    name="signatureCategory"
                    value={formData.signatureCategory}
                    onChange={handleChange}
                    className={selectCls}
                  >
                    <option value="none">None</option>
                    <option value="fashion">Fashion</option>
                    <option value="trending">Trending</option>
                    <option value="latest">Latest</option>
                  </select>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex gap-3 justify-end pb-8">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/admin/products")}
              className="border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF] dark:hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="bg-[#B66F72] hover:bg-[#95565A] text-white dark:bg-primary dark:hover:bg-primary/90 min-w-[140px]"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving…
                </span>
              ) : isEditing ? (
                "Update Product"
              ) : (
                "Add Product"
              )}
            </Button>
          </div>
        </form>
      </main>
      <Footer />
    </div>
  );
}

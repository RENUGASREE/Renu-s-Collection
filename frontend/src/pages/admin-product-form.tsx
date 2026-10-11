import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

interface MediaItem {
  url: string;
  alt?: string;
  type: 'image' | 'video';
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
  imageUrl: string;
  media: MediaItem[];
}

export default function AdminProductForm() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId?: string }>();
  const isEditing = !!productId;

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [newImageUrl, setNewImageUrl] = useState('');
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    sku: '',
    price: 0,
    salePrice: null,
    stock: 0,
    categoryId: '',
    subcategoryId: null,
    isActive: true,
    isCustomizable: true,
    isSignaturePiece: false,
    signatureCategory: 'none',
    badge: null,
    description: '',
    imageUrl: '',
    media: [],
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await apiRequest('GET', '/api/v1/categories');
        const data = await response.json();
        const allCategories = data.data || [];
        console.log('All categories:', allCategories);
        setCategories(allCategories);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };
    fetchCategories();

    if (isEditing) {
      const fetchProduct = async () => {
        try {
          const response = await apiRequest('GET', `/api/v1/products/${productId}`);
          const data = await response.json();
          const product = data.data;
          console.log('Product data:', product);

          // Normalize media items
          let initialMedia: MediaItem[] = [];
          if (Array.isArray(product.media) && product.media.length > 0) {
            initialMedia = product.media.map((m: any, idx: number) => ({
              url: m.url,
              alt: m.alt || '',
              type: m.type || 'image',
              isPrimary: m.isPrimary ?? (idx === 0),
              sortOrder: m.sortOrder ?? idx,
            }));
          } else if (product.imageUrl) {
            initialMedia = [{
              url: product.imageUrl,
              alt: product.name || '',
              type: 'image',
              isPrimary: true,
              sortOrder: 0,
            }];
          }

          // Ensure exactly one primary image if media is not empty
          if (initialMedia.length > 0 && !initialMedia.some(m => m.isPrimary)) {
            initialMedia[0].isPrimary = true;
          }

          setFormData({
            name: product.name || '',
            sku: product.sku || '',
            price: product.price || 0,
            salePrice: product.salePrice || null,
            stock: product.stock || 0,
            categoryId: product.categoryId || '',
            subcategoryId: product.subcategoryId || null,
            isActive: product.isActive ?? true,
            isCustomizable: product.isCustomizable ?? true,
            isSignaturePiece: product.isSignaturePiece ?? false,
            signatureCategory: product.signatureCategory || 'none',
            badge: product.badge || null,
            description: product.description || '',
            imageUrl: initialMedia.find(m => m.isPrimary)?.url || product.imageUrl || '',
            media: initialMedia,
          });
        } catch (error) {
          console.error('Failed to fetch product:', error);
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
      console.log('Subcategories for category', formData.categoryId, ':', subs);
      setSubcategories(subs);
    } else {
      setSubcategories([]);
    }
  }, [formData.categoryId, categories]);

  const handleAddImage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const url = newImageUrl.trim();
    if (!url) return;

    setFormData(prev => {
      const nextMedia = [...prev.media];
      const isFirst = nextMedia.length === 0;
      nextMedia.push({
        url,
        alt: prev.name || '',
        type: 'image',
        isPrimary: isFirst,
        sortOrder: nextMedia.length,
      });

      return {
        ...prev,
        imageUrl: isFirst ? url : prev.imageUrl,
        media: nextMedia,
      };
    });

    setNewImageUrl('');
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => {
      const filtered = prev.media.filter((_, idx) => idx !== index);
      // Re-assign sortOrder
      let updated = filtered.map((item, idx) => ({ ...item, sortOrder: idx }));
      
      // If the removed item was primary, designate the first remaining item as primary
      if (updated.length > 0 && !updated.some(m => m.isPrimary)) {
        updated[0].isPrimary = true;
      }
      
      const primaryUrl = updated.find(m => m.isPrimary)?.url || '';
      return {
        ...prev,
        imageUrl: primaryUrl,
        media: updated,
      };
    });
  };

  const handleSetPrimary = (index: number) => {
    setFormData(prev => {
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

  const handleMoveImage = (index: number, direction: 'up' | 'down') => {
    setFormData(prev => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.media.length) return prev;

      const items = [...prev.media];
      const temp = items[index];
      items[index] = items[targetIndex];
      items[targetIndex] = temp;

      const reordered = items.map((item, idx) => ({ ...item, sortOrder: idx }));
      const primaryUrl = reordered.find(m => m.isPrimary)?.url || prev.imageUrl;

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
      const primaryMedia = formData.media.find(m => m.isPrimary);
      const primaryUrl = primaryMedia?.url || formData.media[0]?.url || formData.imageUrl;

      const payload = {
        ...formData,
        imageUrl: primaryUrl || undefined,
        media: formData.media.length > 0 ? formData.media : undefined,
        salePrice: formData.salePrice || undefined,
        badge: formData.badge || undefined,
        subcategoryId: formData.subcategoryId || undefined,
      };

      let response;
      if (isEditing) {
        response = await apiRequest('PATCH', `/api/v1/products/${productId}`, payload);
      } else {
        response = await apiRequest('POST', '/api/v1/products', payload);
      }

      if (response.ok) {
        navigate('/admin/products');
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.errors ? JSON.stringify(errorData.errors, null, 2) : errorData.message || 'Failed to save product';
        alert(`Failed to save product: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Failed to save product:', error);
      alert('Failed to save product');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
              type === 'number' ? parseFloat(value) || 0 : value,
    }));
  };

  if (!token) {
    return <div className="text-center py-20">Please login to access admin panel</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title={isEditing ? "Edit Product - Renu's Collections" : "Add Product - Renu's Collections"} noindex />
      <main className="container mx-auto px-4 py-8 pt-20 max-w-4xl">
        <div className="mb-6">
          <Button variant="outline" onClick={() => navigate('/admin/products')}>
            ← Back to Products
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">
              {isEditing ? 'Edit Product' : 'Add New Product'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Product Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    name="sku"
                    value={formData.sku}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="price">Price (₹) *</Label>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="salePrice">Sale Price (₹)</Label>
                  <Input
                    id="salePrice"
                    name="salePrice"
                    type="number"
                    step="0.01"
                    value={formData.salePrice || ''}
                    onChange={handleChange}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="stock">Stock *</Label>
                  <Input
                    id="stock"
                    name="stock"
                    type="number"
                    value={formData.stock}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoryId">Category *</Label>
                  <select
                    id="categoryId"
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">Select a category</option>
                    {categories.filter(c => !c.parentId).map((cat, idx) => (
                      <option key={cat._id || `cat-${idx}`} value={cat._id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subcategoryId">Subcategory</Label>
                  <select
                    id="subcategoryId"
                    name="subcategoryId"
                    value={formData.subcategoryId || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="">None</option>
                    {subcategories.map((sub, idx) => (
                      <option key={sub._id || `sub-${idx}`} value={sub._id}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="badge">Badge</Label>
                  <Input
                    id="badge"
                    name="badge"
                    value={formData.badge || ''}
                    onChange={handleChange}
                    placeholder="e.g., New, Sale, Best Seller"
                  />
                </div>
              </div>

              {/* Product Gallery & Multiple Images Manager */}
              <div className="space-y-4 pt-2 border-t border-border/40">
                <div>
                  <h3 className="text-lg font-medium text-foreground">Product Gallery Images</h3>
                  <p className="text-sm text-muted-foreground">
                    Add multiple image URLs for this product. You can preview, designate the primary photo, reorder, or remove images.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={newImageUrl}
                    onChange={(e) => setNewImageUrl(e.target.value)}
                    placeholder="Enter image URL (e.g. /assets/... or https://...)"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddImage();
                      }
                    }}
                  />
                  <Button type="button" onClick={() => handleAddImage()} variant="secondary">
                    Add Image
                  </Button>
                </div>

                {formData.media.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                    {formData.media.map((item, index) => (
                      <div
                        key={index}
                        className={`relative rounded-lg border p-3 flex flex-col gap-2 transition-all ${
                          item.isPrimary
                            ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                            : 'border-border/60 bg-card hover:border-border'
                        }`}
                      >
                        <div className="relative aspect-square w-full rounded-md overflow-hidden bg-muted/30 border border-border/40 flex items-center justify-center">
                          <img
                            src={item.url}
                            alt={item.alt || `Product image ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/assets/placeholder-jewel.jpg';
                            }}
                          />
                          {item.isPrimary && (
                            <span className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm">
                              Primary
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-muted-foreground font-mono truncate" title={item.url}>
                          {item.url}
                        </p>

                        <div className="flex items-center justify-between gap-1 pt-1 border-t border-border/40">
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={item.isPrimary ? 'default' : 'outline'}
                              className="h-7 text-xs px-2"
                              onClick={() => handleSetPrimary(index)}
                            >
                              {item.isPrimary ? 'Primary' : 'Set Primary'}
                            </Button>
                          </div>

                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-xs"
                              disabled={index === 0}
                              onClick={() => handleMoveImage(index, 'up')}
                              title="Move earlier"
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-xs"
                              disabled={index === formData.media.length - 1}
                              onClick={() => handleMoveImage(index, 'down')}
                              title="Move later"
                            >
                              ↓
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleRemoveImage(index)}
                              title="Remove image"
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    No images added yet. Enter a URL above and click "Add Image".
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={4}
                />
              </div>

              <div className="flex flex-wrap gap-6 pt-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4 rounded text-primary"
                  />
                  <span className="text-sm font-medium">Active (Visible in Store)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isCustomizable"
                    checked={formData.isCustomizable}
                    onChange={handleChange}
                    className="w-4 h-4 rounded text-primary"
                  />
                  <span className="text-sm font-medium">Allow Customization</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="isSignaturePiece"
                    checked={formData.isSignaturePiece}
                    onChange={handleChange}
                    className="w-4 h-4 rounded text-primary"
                  />
                  <span className="text-sm font-medium">Signature Piece</span>
                </label>
              </div>

              {formData.isSignaturePiece && (
                <div className="space-y-2">
                  <Label htmlFor="signatureCategory">Signature Category</Label>
                  <select
                    id="signatureCategory"
                    name="signatureCategory"
                    value={formData.signatureCategory}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="none">None</option>
                    <option value="fashion">Fashion</option>
                    <option value="trending">Trending</option>
                    <option value="latest">Latest</option>
                  </select>
                </div>
              )}

              <div className="flex gap-4">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Saving...' : (isEditing ? 'Update Product' : 'Add Product')}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate('/admin/products')}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}

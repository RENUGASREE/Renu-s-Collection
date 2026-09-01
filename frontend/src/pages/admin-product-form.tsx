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

interface ProductFormData {
  name: string;
  sku: string;
  price: number;
  salePrice: number | null;
  stock: number;
  categoryId: string;
  subcategoryId: string | null;
  isActive: boolean;
  isSignaturePiece: boolean;
  signatureCategory: string;
  badge: string | null;
  description: string;
  imageUrl: string;
}

export default function AdminProductForm() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { productId } = useParams<{ productId?: string }>();
  const isEditing = !!productId;

  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    sku: '',
    price: 0,
    salePrice: null,
    stock: 0,
    categoryId: '',
    subcategoryId: null,
    isActive: true,
    isSignaturePiece: false,
    signatureCategory: 'none',
    badge: null,
    description: '',
    imageUrl: '',
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
          setFormData({
            name: product.name || '',
            sku: product.sku || '',
            price: product.price || 0,
            salePrice: product.salePrice || null,
            stock: product.stock || 0,
            categoryId: product.categoryId || '',
            subcategoryId: product.subcategoryId || null,
            isActive: product.isActive ?? true,
            isSignaturePiece: product.isSignaturePiece ?? false,
            signatureCategory: product.signatureCategory || 'none',
            badge: product.badge || null,
            description: product.description || '',
            imageUrl: product.imageUrl || '',
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...formData,
        salePrice: formData.salePrice || undefined,
        badge: formData.badge || undefined,
        subcategoryId: formData.subcategoryId || undefined,
        imageUrl: formData.imageUrl || undefined,
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
                    {categories.filter(c => !c.parentId).map(cat => (
                      <option key={cat._id} value={cat._id}>{cat.name}</option>
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
                    {subcategories.map(sub => (
                      <option key={sub._id} value={sub._id}>{sub.name}</option>
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

                <div className="space-y-2">
                  <Label htmlFor="imageUrl">Image URL</Label>
                  <Input
                    id="imageUrl"
                    name="imageUrl"
                    value={formData.imageUrl}
                    onChange={handleChange}
                    placeholder="https://..."
                  />
                </div>
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

              <div className="flex gap-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleChange}
                    className="w-4 h-4"
                  />
                  <span>Active</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    name="isSignaturePiece"
                    checked={formData.isSignaturePiece}
                    onChange={handleChange}
                    className="w-4 h-4"
                  />
                  <span>Signature Piece</span>
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

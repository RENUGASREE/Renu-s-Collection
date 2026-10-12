import { useState, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import AdminNav from "@/components/AdminNav";
import { 
  Layers, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  XCircle,
  FolderTree
} from "lucide-react";

interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentId: string | null;
  productType: string;
  isActive: boolean;
  showInMenu: boolean;
  sortOrder: number;
  imageUrl?: string;
}

export default function AdminCategories() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    parentId: '',
    productType: 'other',
    isActive: true,
    showInMenu: true,
    sortOrder: 0,
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', '/api/v1/categories');
      const data = await response.json();
      setCategories(data.data || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parentId: category.parentId || '',
      productType: category.productType || 'other',
      isActive: category.isActive,
      showInMenu: category.showInMenu,
      sortOrder: category.sortOrder || 0,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        parentId: formData.parentId ? formData.parentId : null,
      };

      if (editingCategory) {
        const response = await apiRequest('PUT', `/api/v1/categories/${editingCategory._id}`, payload);
        if (response.ok) {
          setShowForm(false);
          setEditingCategory(null);
          fetchCategories();
        }
      } else {
        const response = await apiRequest('POST', '/api/v1/categories', payload);
        if (response.ok) {
          setShowForm(false);
          fetchCategories();
        }
      }
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Are you sure you wish to delete this category?')) return;
    try {
      const response = await apiRequest('DELETE', `/api/v1/categories/${categoryId}`);
      if (response.ok) {
        fetchCategories();
      }
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  if (!token) {
    return <div className="text-center py-20">Please login to access admin panel</div>;
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Categories Management - Renu's Collections Admin" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-7xl">
        <AdminNav className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Classification & Hierarchy</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Category Management
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Structure jewelry categories, subcategories, and menu display rules.
            </p>
          </div>

          <Button 
            onClick={() => {
              setEditingCategory(null);
              setFormData({
                name: '',
                slug: '',
                description: '',
                parentId: '',
                productType: 'other',
                isActive: true,
                showInMenu: true,
                sortOrder: 0,
              });
              setShowForm(!showForm);
            }}
            className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl shadow-xs text-xs px-4"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            <span>{showForm ? 'Close Form' : 'Add Category'}</span>
          </Button>
        </div>

        {/* Create/Edit Category Form Card */}
        {showForm && (
          <Card className="border-2 border-[#B66F72] bg-white dark:bg-card rounded-xl p-6 mb-8 shadow-md">
            <h3 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground mb-4">
              {editingCategory ? `Edit Category: ${editingCategory.name}` : 'Create New Category'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Category Name *</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">URL Slug *</label>
                  <Input
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="mt-1 border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Description</label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Parent Category</label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-[#E6D8D0] dark:border-border rounded-lg text-xs bg-white dark:bg-card"
                  >
                    <option value="">None (Top Level Category)</option>
                    {categories.filter(c => !editingCategory || c._id !== editingCategory._id).map((c) => (
                      <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Product Type</label>
                  <select
                    value={formData.productType}
                    onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                    className="w-full mt-1 px-3 py-2 border border-[#E6D8D0] dark:border-border rounded-lg text-xs bg-white dark:bg-card"
                  >
                    <option value="bracelet">Bracelet</option>
                    <option value="chain">Chain</option>
                    <option value="necklace">Necklace</option>
                    <option value="earring">Earring</option>
                    <option value="ring">Ring</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Sort Order</label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                    className="mt-1 border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="accent-[#B66F72]"
                  />
                  <span>Active & Visible</span>
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.showInMenu}
                    onChange={(e) => setFormData({ ...formData, showInMenu: e.target.checked })}
                    className="accent-[#B66F72]"
                  />
                  <span>Display in Store Navigation Menu</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowForm(false)}
                  className="text-xs rounded-lg"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-lg"
                >
                  Save Category
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#756861] dark:text-muted-foreground" />
          <Input
            placeholder="Search by category name or slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-xs sm:text-sm rounded-xl focus-visible:ring-[#B66F72] max-w-md"
          />
        </div>

        {/* Categories List */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">Loading categories...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCategories.map((c) => (
              <Card 
                key={c._id}
                className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:shadow-sm transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-playfair font-semibold text-base text-[#342824] dark:text-foreground">
                      {c.name}
                    </h3>
                    <span className="font-mono text-xs text-[#756861] dark:text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/40">
                      /{c.slug}
                    </span>
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-[#B99A72]/15 text-[#95565A] dark:text-[#B99A72]">
                      {c.productType}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 line-clamp-1">
                      {c.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => handleEdit(c)}
                    size="sm"
                    variant="outline"
                    className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8"
                  >
                    <Edit3 className="w-3.5 h-3.5 mr-1" />
                    <span>Edit</span>
                  </Button>
                  <Button
                    onClick={() => handleDelete(c._id)}
                    size="sm"
                    variant="destructive"
                    className="text-xs rounded-lg h-8"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

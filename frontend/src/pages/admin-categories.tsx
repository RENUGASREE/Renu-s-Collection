import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";

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
    const fetchCategories = async () => {
      try {
        const response = await apiRequest('GET', '/api/v1/categories');
        const data = await response.json();
        setCategories(data.data);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchCategories();
  }, []);

  const filteredCategories = categories.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        parentId: formData.parentId || null,
        sortOrder: Number(formData.sortOrder),
      };

      let response;
      if (editingCategory) {
        response = await apiRequest('PATCH', `/api/v1/categories/${editingCategory._id}`, payload);
      } else {
        response = await apiRequest('POST', '/api/v1/categories', payload);
      }

      if (response.ok) {
        const data = await response.json();
        if (editingCategory) {
          setCategories(categories.map(c => c._id === editingCategory._id ? data.data : c));
        } else {
          setCategories([...categories, data.data]);
        }
        setShowForm(false);
        setEditingCategory(null);
        resetForm();
      }
    } catch (error) {
      console.error('Failed to save category:', error);
    }
  };

  const resetForm = () => {
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
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      parentId: category.parentId || '',
      productType: category.productType,
      isActive: category.isActive,
      showInMenu: category.showInMenu,
      sortOrder: category.sortOrder,
    });
    setShowForm(true);
  };

  const handleDelete = async (categoryId: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      const response = await apiRequest('DELETE', `/api/v1/categories/${categoryId}`);
      if (response.ok) {
        setCategories(categories.filter(c => c._id !== categoryId));
      }
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  const toggleActive = async (categoryId: string, currentStatus: boolean) => {
    try {
      const response = await apiRequest('PATCH', `/api/v1/categories/${categoryId}`, {
        isActive: !currentStatus
      });
      if (response.ok) {
        setCategories(categories.map(c => 
          c._id === categoryId ? { ...c, isActive: !currentStatus } : c
        ));
      }
    } catch (error) {
      console.error('Failed to update category:', error);
    }
  };

  if (!token) {
    return <div className="text-center py-20">Please login to access admin panel</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title="Admin Categories - Renu's Collections" noindex />
      <main className="container mx-auto px-4 py-8 pt-20">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold">Category Management</h1>
          <Button onClick={() => { setShowForm(true); setEditingCategory(null); resetForm(); }}>
            Add New Category
          </Button>
        </div>

        <Input
          placeholder="Search categories..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md mb-6"
        />

        {showForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{editingCategory ? 'Edit Category' : 'Add New Category'}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Name</label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Slug</label>
                    <Input
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <Input
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Parent Category</label>
                    <select
                      value={formData.parentId}
                      onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="">None (Main Category)</option>
                      {categories.filter(c => !c.parentId).map(cat => (
                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Product Type</label>
                    <select
                      value={formData.productType}
                      onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="bracelet">Bracelet</option>
                      <option value="earring">Earring</option>
                      <option value="bangle">Bangle</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Sort Order</label>
                    <Input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                    <label htmlFor="isActive" className="text-sm">Active</label>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="showInMenu"
                      checked={formData.showInMenu}
                      onChange={(e) => setFormData({ ...formData, showInMenu: e.target.checked })}
                    />
                    <label htmlFor="showInMenu" className="text-sm">Show in Menu</label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">{editingCategory ? 'Update' : 'Create'}</Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingCategory(null); resetForm(); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <p>Loading categories...</p>
        ) : (
          <div className="grid gap-4">
            {filteredCategories.map(category => (
              <Card key={category._id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{category.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">Slug: {category.slug}</p>
                      {category.parentId && (
                        <p className="text-xs text-muted-foreground">
                          Parent: {categories.find(c => c._id === category.parentId)?.name || 'Unknown'}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(category._id, category.isActive)}
                      >
                        {category.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(category)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(category._id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <span className="ml-2 capitalize">{category.productType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sort Order:</span>
                      <span className="ml-2">{category.sortOrder}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Menu:</span>
                      <span className={`ml-2 ${category.showInMenu ? 'text-green-600' : 'text-red-600'}`}>
                        {category.showInMenu ? 'Visible' : 'Hidden'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className={`ml-2 ${category.isActive ? 'text-green-600' : 'text-red-600'}`}>
                        {category.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  {category.description && (
                    <p className="text-sm mt-2 text-muted-foreground">{category.description}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredCategories.length === 0 && !loading && (
          <p className="text-center text-muted-foreground">No categories found.</p>
        )}
      </main>
      <Footer />
    </div>
  );
}

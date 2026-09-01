import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";

interface Product {
  _id: string;
  name: string;
  sku: string;
  price: number;
  effectivePrice: number;
  salePrice: number | null;
  stock: number;
  isInStock: boolean;
  categoryId: string;
  subcategoryId: string | null;
  isActive: boolean;
  isSignaturePiece: boolean;
  badge: string | null;
}

interface Category {
  _id: string;
  name: string;
  slug: string;
}

export default function AdminProducts() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [productsRes, categoriesRes] = await Promise.all([
          apiRequest('GET', '/api/v1/products?isActive=all'),
          apiRequest('GET', '/api/v1/categories')
        ]);
        const productsData = await productsRes.json();
        const categoriesData = await categoriesRes.json();
        setProducts(productsData.data);
        setCategories(categoriesData.data);
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || p.categoryId === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find(c => c._id === categoryId);
    return cat?.name || 'Unknown';
  };

  const toggleActive = async (productId: string, currentStatus: boolean) => {
    try {
      const response = await apiRequest('PATCH', `/api/v1/products/${productId}`, {
        isActive: !currentStatus
      });
      if (response.ok) {
        setProducts(products.map(p =>
          p._id === productId ? { ...p, isActive: !currentStatus } : p
        ));
      } else {
        const errorData = await response.json();
        console.error('Failed to update product:', errorData);
        alert(`Failed to update product: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to update product:', error);
      alert('Failed to update product');
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const response = await apiRequest('DELETE', `/api/v1/products/${productId}`);
      if (response.ok) {
        setProducts(products.filter(p => p._id !== productId));
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
    }
  };

  if (!token) {
    return <div className="text-center py-20">Please login to access admin panel</div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title="Admin Products - Renu's Collections" noindex />
      <main className="container mx-auto px-4 py-8 pt-20">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold">Product Management</h1>
          <Link to="/admin/products/new">
            <Button>Add New Product</Button>
          </Link>
        </div>

        <div className="flex gap-4 mb-6">
          <Input
            placeholder="Search by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat._id} value={cat._id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <p>Loading products...</p>
        ) : (
          <div className="grid gap-4">
            {filteredProducts.map(product => (
              <Card key={product._id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>{product.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">SKU: {product.sku}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleActive(product._id, product.isActive)}
                      >
                        {product.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Link to={`/admin/products/${product._id}/edit`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteProduct(product._id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Price:</span>
                      <span className="ml-2">₹{product.price}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Stock:</span>
                      <span className={`ml-2 ${product.isInStock ? 'text-green-600' : 'text-red-600'}`}>
                        {product.stock}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Category:</span>
                      <span className="ml-2">{getCategoryName(product.categoryId)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className={`ml-2 ${product.isActive ? 'text-green-600' : 'text-red-600'}`}>
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                  {product.badge && (
                    <div className="mt-2">
                      <span className="bg-primary text-primary-foreground px-2 py-1 text-xs rounded">
                        {product.badge}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {filteredProducts.length === 0 && !loading && (
          <p className="text-center text-muted-foreground">No products found.</p>
        )}
      </main>
      <Footer />
    </div>
  );
}

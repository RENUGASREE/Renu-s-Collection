import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import AdminNav from "@/components/AdminNav";
import { 
  Package, 
  Search, 
  Plus, 
  Edit3, 
  Trash2, 
  Power, 
  CheckCircle2, 
  XCircle,
  ExternalLink,
  Layers
} from "lucide-react";

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
        setProducts(productsData.data || []);
        setCategories(categoriesData.data || []);
      } catch (error) {
        console.error('Failed to fetch products:', error);
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
    return cat?.name || 'Uncategorized';
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
        alert(`Failed to update product: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to update product status:', error);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('Are you sure you want to delete this jewelry piece? This action is permanent.')) return;
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
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Product Catalog - Renu's Collections Admin" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-7xl">
        <AdminNav className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Catalog & Inventory</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Product Management
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Manage jewelry pricing, stock availability, and catalog visibility.
            </p>
          </div>

          <Button 
            asChild 
            className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl shadow-xs text-xs px-4"
          >
            <Link to="/admin/products/new">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              <span>Add New Product</span>
            </Link>
          </Button>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#756861] dark:text-muted-foreground" />
            <Input
              placeholder="Search by product name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-xs sm:text-sm rounded-xl focus-visible:ring-[#B66F72]"
            />
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3.5 py-2 border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl text-xs sm:text-sm text-[#342824] dark:text-foreground focus:outline-none focus:ring-1 focus:ring-[#B66F72]"
          >
            <option value="all">All Categories</option>
            {categories.map((cat, idx) => (
              <option key={cat._id || `cat-${idx}`} value={cat._id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">Loading catalog...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-8 text-center max-w-md mx-auto">
            <Package className="w-12 h-12 text-[#B66F72] mx-auto mb-3 opacity-60" />
            <h3 className="font-playfair text-xl font-semibold mb-1">No Products Found</h3>
            <p className="text-xs text-[#756861] dark:text-muted-foreground mb-4">No jewelry pieces match your current filter query.</p>
            <Button onClick={() => { setSearchTerm(''); setFilterCategory('all'); }} variant="outline" size="sm" className="text-xs">
              Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product, idx) => (
              <Card 
                key={product._id || `product-${idx}`}
                className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl overflow-hidden shadow-xs hover:shadow-sm transition-all"
              >
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link 
                        to={`/product/${product._id}`}
                        target="_blank"
                        className="font-playfair font-semibold text-base sm:text-lg text-[#342824] dark:text-foreground hover:text-[#B66F72] transition-colors"
                      >
                        {product.name}
                      </Link>
                      <span className="font-mono text-xs text-[#756861] dark:text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/40">
                        {product.sku}
                      </span>
                      {product.badge && (
                        <span className="text-[10px] bg-[#B99A72]/15 text-[#95565A] dark:text-[#B99A72] font-semibold px-2 py-0.5 rounded-full">
                          {product.badge}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mt-2 text-xs text-[#756861] dark:text-muted-foreground">
                      <div>
                        Price: <strong className="text-[#342824] dark:text-foreground">₹{product.price}</strong>
                      </div>
                      <div>
                        Stock: <strong className={product.stock > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>{product.stock}</strong>
                      </div>
                      <div>
                        Category: <strong className="text-[#342824] dark:text-foreground">{getCategoryName(product.categoryId)}</strong>
                      </div>
                      <div>
                        Status: <strong className={product.isActive ? "text-emerald-700 dark:text-emerald-400" : "text-stone-500"}>{product.isActive ? "Active" : "Inactive"}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActive(product._id, product.isActive)}
                      className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8"
                    >
                      {product.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                    <Button 
                      asChild 
                      variant="outline" 
                      size="sm"
                      className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8"
                    >
                      <Link to={`/admin/products/${product._id}/edit`}>
                        <Edit3 className="w-3.5 h-3.5 mr-1" />
                        <span>Edit</span>
                      </Link>
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteProduct(product._id)}
                      className="text-xs rounded-lg h-8"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
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

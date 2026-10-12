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
  Boxes, 
  Search, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight, 
  RefreshCw,
  Plus,
  Minus,
  CheckCircle2
} from "lucide-react";

interface Product {
  _id: string;
  name: string;
  sku: string;
  stock: number;
  isInStock: boolean;
  lowStockThreshold: number;
}

export default function AdminInventory() {
  const { token } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustment, setAdjustment] = useState({ quantityChange: 0, action: 'add', reason: '' });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', '/api/v1/products');
      const data = await response.json();
      setProducts(data.data || []);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock <= (p.lowStockThreshold || 5));
  const outOfStockProducts = products.filter(p => p.stock === 0);

  const handleAdjustStock = async () => {
    if (!adjustingProduct) return;
    try {
      const response = await apiRequest('POST', `/api/v1/products/${adjustingProduct._id}/adjust-stock`, {
        quantityChange: Number(adjustment.quantityChange),
        action: adjustment.action,
        reason: adjustment.reason,
      });
      if (response.ok) {
        const data = await response.json();
        setProducts(products.map(p => 
          p._id === adjustingProduct._id ? { ...p, stock: data.data.newStock, isInStock: data.data.newStock > 0 } : p
        ));
        setAdjustingProduct(null);
        setAdjustment({ quantityChange: 0, action: 'add', reason: '' });
      }
    } catch (error) {
      console.error('Failed to adjust stock:', error);
    }
  };

  if (!token) {
    return <div className="text-center py-20">Please login to access admin panel</div>;
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Inventory Management - Renu's Collections Admin" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-7xl">
        <AdminNav className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Stock & Logistics</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Inventory Management
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Audit piece counts, configure threshold warnings, and execute manual stock adjustments.
            </p>
          </div>

          <Button 
            onClick={fetchProducts}
            variant="outline" 
            size="sm"
            className="border-[#E6D8D0] dark:border-border text-xs rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Summary Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-4 shadow-xs">
            <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Total Products</span>
            <p className="font-playfair text-2xl font-bold text-[#342824] dark:text-foreground mt-1">
              {products.length}
            </p>
            <span className="text-[11px] text-[#756861] dark:text-muted-foreground">Catalog items monitored</span>
          </Card>

          <Card className="border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl p-4 shadow-xs">
            <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">Low Stock Warning</span>
            <p className="font-playfair text-2xl font-bold text-amber-900 dark:text-amber-200 mt-1">
              {lowStockProducts.length}
            </p>
            <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">Stock ≤ threshold</span>
          </Card>

          <Card className="border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 rounded-xl p-4 shadow-xs">
            <span className="text-xs text-rose-800 dark:text-rose-300 font-medium">Out of Stock</span>
            <p className="font-playfair text-2xl font-bold text-rose-900 dark:text-rose-200 mt-1">
              {outOfStockProducts.length}
            </p>
            <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80">Immediately unavailable</span>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#756861] dark:text-muted-foreground" />
          <Input
            placeholder="Search by product name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-xs sm:text-sm rounded-xl focus-visible:ring-[#B66F72] max-w-md"
          />
        </div>

        {/* Stock Adjustment Dialog/Card when selecting a product */}
        {adjustingProduct && (
          <Card className="border-2 border-[#B66F72] bg-white dark:bg-card rounded-xl p-5 mb-6 shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6D8D0] dark:border-border">
              <div>
                <h3 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                  Adjust Stock for: {adjustingProduct.name}
                </h3>
                <span className="text-xs font-mono text-[#756861] dark:text-muted-foreground">SKU: {adjustingProduct.sku} • Current Stock: {adjustingProduct.stock}</span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setAdjustingProduct(null)}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div>
                <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Action</label>
                <select
                  value={adjustment.action}
                  onChange={(e) => setAdjustment({ ...adjustment, action: e.target.value })}
                  className="w-full mt-1 px-3 py-2 border border-[#E6D8D0] dark:border-border rounded-lg text-xs bg-white dark:bg-card"
                >
                  <option value="add">Add Stock (+)</option>
                  <option value="deduct">Deduct Stock (-)</option>
                  <option value="adjust">Override / Audit Adjustment</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Quantity Change</label>
                <Input
                  type="number"
                  value={adjustment.quantityChange}
                  onChange={(e) => setAdjustment({ ...adjustment, quantityChange: parseInt(e.target.value) || 0 })}
                  className="mt-1 border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Reason Note (Optional)</label>
                <Input
                  placeholder="e.g. Workshop restock, damaged piece..."
                  value={adjustment.reason}
                  onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
                  className="mt-1 border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button 
                onClick={handleAdjustStock}
                className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-lg text-xs"
              >
                Confirm Stock Adjustment
              </Button>
            </div>
          </Card>
        )}

        {/* Inventory Table */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">Loading stock levels...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((p) => {
              const isLow = p.stock <= (p.lowStockThreshold || 5);
              const isOut = p.stock === 0;

              return (
                <Card 
                  key={p._id}
                  className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs hover:shadow-sm transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-playfair font-semibold text-base text-[#342824] dark:text-foreground truncate">
                        {p.name}
                      </p>
                      <span className="font-mono text-xs text-[#756861] dark:text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/40">
                        {p.sku}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-[#756861] dark:text-muted-foreground">
                      <span>Low Threshold: <strong className="text-[#342824] dark:text-foreground">{p.lowStockThreshold || 5}</strong></span>
                      <span>Status: <strong className={p.isInStock ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}>{p.isInStock ? "In Stock" : "Unavailable"}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <span className={`font-playfair text-xl font-bold ${isOut ? 'text-rose-700 dark:text-rose-400' : isLow ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                        {p.stock}
                      </span>
                      <span className="text-xs text-[#756861] dark:text-muted-foreground ml-1">units</span>
                    </div>

                    <Button
                      onClick={() => {
                        setAdjustingProduct(p);
                        setAdjustment({ quantityChange: 0, action: 'add', reason: '' });
                      }}
                      size="sm"
                      variant="outline"
                      className="border-[#E6D8D0] dark:border-border text-xs rounded-lg h-8"
                    >
                      Adjust
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

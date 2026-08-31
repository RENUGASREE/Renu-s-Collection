import { useState, useEffect } from "react";
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
    const fetchProducts = async () => {
      try {
        const response = await apiRequest('GET', '/api/v1/products');
        const data = await response.json();
        setProducts(data.data);
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockProducts = products.filter(p => p.stock <= p.lowStockThreshold);

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
    <div className="min-h-screen bg-background text-foreground">
      <SEO title="Admin Inventory - Renu's Collections" noindex />
      <main className="container mx-auto px-4 py-8 pt-20">
        <h1 className="text-4xl font-bold mb-6">Inventory Management</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader><CardTitle>Total Products</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{products.length}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Low Stock</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold text-red-600">{lowStockProducts.length}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Out of Stock</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold text-red-600">
              {products.filter(p => p.stock === 0).length}
            </CardContent>
          </Card>
        </div>

        <Input
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-md mb-6"
        />

        {lowStockProducts.length > 0 && (
          <Card className="mb-6 border-red-500">
            <CardHeader>
              <CardTitle className="text-red-600">Low Stock Alert</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-2">The following products are running low on stock:</p>
              <ul className="list-disc list-inside">
                {lowStockProducts.map(p => (
                  <li key={p._id}>{p.name} (SKU: {p.sku}) - {p.stock} units</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {adjustingProduct && (
          <Card className="mb-6 border-primary">
            <CardHeader>
              <CardTitle>Adjust Stock: {adjustingProduct.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Quantity Change</label>
                    <Input
                      type="number"
                      value={adjustment.quantityChange}
                      onChange={(e) => setAdjustment({ ...adjustment, quantityChange: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Action</label>
                    <select
                      value={adjustment.action}
                      onChange={(e) => setAdjustment({ ...adjustment, action: e.target.value })}
                      className="w-full px-3 py-2 border rounded-md"
                    >
                      <option value="add">Add Stock</option>
                      <option value="deduct">Deduct Stock</option>
                      <option value="adjust">Adjust Stock</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Reason</label>
                  <Input
                    value={adjustment.reason}
                    onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })}
                    placeholder="e.g., Restock, Damaged goods, Sale"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleAdjustStock}>Confirm Adjustment</Button>
                  <Button variant="outline" onClick={() => { setAdjustingProduct(null); setAdjustment({ quantityChange: 0, action: 'add', reason: '' }); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setAdjustingProduct(product); setAdjustment({ quantityChange: 0, action: 'add', reason: '' }); }}
                    >
                      Adjust Stock
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Current Stock:</span>
                      <span className={`ml-2 font-semibold ${product.isInStock ? 'text-green-600' : 'text-red-600'}`}>
                        {product.stock}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Low Stock Threshold:</span>
                      <span className="ml-2">{product.lowStockThreshold}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <span className={`ml-2 ${product.isInStock ? 'text-green-600' : 'text-red-600'}`}>
                        {product.isInStock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </div>
                  </div>
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

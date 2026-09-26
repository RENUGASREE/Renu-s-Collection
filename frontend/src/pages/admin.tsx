import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Footer from "@/components/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";

interface DashboardStats {
  revenue: { total: number; last30Days: number };
  orders: { total: number; pending: number; last30Days: number };
  products: { total: number; active: number; lowStock: number };
  users: { total: number; customers: number; admins: number };
  topProducts: { id: string; name: string; sku: string; reviewCount: number; averageRating: number }[];
}

export default function Admin() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError('Please login to access admin dashboard');
      setLoading(false);
      return;
    }
    
    if (user?.role !== 'admin') {
      setError('Admin access required');
      setLoading(false);
      return;
    }

    const fetchDashboard = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/admin/dashboard`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load admin dashboard: ${response.status} - ${errorText}`);
        }
        
        const json = await response.json();
        
        // Ensure topProducts has proper keys
        if (json.data?.topProducts) {
          json.data.topProducts = json.data.topProducts.map((p: any, idx: number) => ({
            ...p,
            id: p.id || p._id || `product-${idx}`,
            _id: p._id || p.id,
          }));
        }
        
        setStats(json.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load admin dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [token, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SEO title="Admin Dashboard - Renu's Collections" noindex />
        <main className="container mx-auto px-4 py-8 pt-20">
          <div className="text-center text-xl">Loading admin dashboard...</div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <SEO title="Admin Dashboard - Renu's Collections" noindex />
        <main className="container mx-auto px-4 py-8 pt-20">
          <div className="text-center">
            <p className="text-xl text-destructive mb-6">{error}</p>
            <Button onClick={() => navigate('/')}>Return Home</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO title="Admin Dashboard - Renu's Collections" noindex />
      <main className="container mx-auto px-4 py-8 pt-20">
        <h1 className="text-4xl font-bold text-center mb-2">Admin Dashboard</h1>
        <p className="text-center text-muted-foreground mb-8">
          Welcome, {user?.username} ({user?.role ?? "customer"})
        </p>

        {error && (
          <p className="text-center text-destructive mb-6">{error}</p>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card key="revenue">
              <CardHeader><CardTitle>Revenue (30d)</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">₹{stats.revenue.last30Days.toLocaleString()}</CardContent>
            </Card>
            <Card key="orders">
              <CardHeader><CardTitle>Orders</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{stats.orders.total} total · {stats.orders.pending} pending</CardContent>
            </Card>
            <Card key="products">
              <CardHeader><CardTitle>Products</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{stats.products.active} active · {stats.products.lowStock} low stock</CardContent>
            </Card>
            <Card key="users">
              <CardHeader><CardTitle>Users</CardTitle></CardHeader>
              <CardContent className="text-2xl font-bold">{stats.users.total} total</CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card
            key="products"
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/admin/products")}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Products</h3>
              <p className="text-muted-foreground">Manage products</p>
            </CardContent>
          </Card>

          <Card
            key="categories"
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/admin/categories")}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Categories</h3>
              <p className="text-muted-foreground">Manage categories and subcategories</p>
            </CardContent>
          </Card>

          <Card
            key="inventory"
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/admin/inventory")}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Inventory</h3>
              <p className="text-muted-foreground">Manage stock and inventory</p>
            </CardContent>
          </Card>

          <Card
            key="customization"
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/admin/customization")}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Customization</h3>
              <p className="text-muted-foreground">Configure product customization options</p>
            </CardContent>
          </Card>

          <Card
            key="orders"
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/admin/orders")}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Orders</h3>
              <p className="text-muted-foreground">Manage and track customer orders</p>
            </CardContent>
          </Card>

          <Card
            key="reviews"
            className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => navigate("/admin/reviews")}
          >
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Reviews</h3>
              <p className="text-muted-foreground">Approve or reject customer reviews</p>
            </CardContent>
          </Card>
        </div>
        <Card key="account">
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>
            <Link to="/account"><Button variant="secondary" className="w-full">My Account</Button></Link>
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}

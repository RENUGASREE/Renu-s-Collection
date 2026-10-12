import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Footer from "@/components/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { SEO } from "@/components/SEO";
import AdminNav from "@/components/AdminNav";
import { 
  Package, 
  ShoppingBag, 
  Layers, 
  Boxes, 
  Sliders, 
  Star, 
  Users, 
  IndianRupee, 
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Plus
} from "lucide-react";

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
        const response = await apiRequest("GET", "/api/v1/admin/dashboard");
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to load admin dashboard: ${response.status} - ${errorText}`);
        }
        
        const json = await response.json();
        
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
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
        <SEO title="Admin Dashboard - Renu's Collections" noindex />
        <main className="container mx-auto px-4 py-16 pt-28 max-w-6xl text-center">
          <div className="h-10 w-10 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-4" />
          <h1 className="font-playfair text-2xl font-semibold">Loading Boutique Dashboard...</h1>
          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">Retrieving real-time business telemetry.</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
        <SEO title="Admin Dashboard - Renu's Collections" noindex />
        <main className="container mx-auto px-4 py-16 pt-28 max-w-lg text-center">
          <Card className="p-8 border border-[#E6D8D0] dark:border-border rounded-xl">
            <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto mb-3" />
            <h2 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground mb-2">Access Restricted</h2>
            <p className="text-xs text-[#756861] dark:text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate('/')} className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl">
              Return Home
            </Button>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  const managementModules = [
    {
      title: "Products",
      description: "Artisanal catalog, prices, and imagery",
      icon: Package,
      path: "/admin/products",
      stat: stats ? `${stats.products.active} active` : undefined
    },
    {
      title: "Categories",
      description: "Hierarchies and product type groupings",
      icon: Layers,
      path: "/admin/categories"
    },
    {
      title: "Inventory",
      description: "Stock counts, low stock alerts, adjustments",
      icon: Boxes,
      path: "/admin/inventory",
      stat: stats && stats.products.lowStock > 0 ? `${stats.products.lowStock} low stock` : undefined,
      alert: stats ? stats.products.lowStock > 0 : false
    },
    {
      title: "Orders",
      description: "Fulfillment tracking and status transitions",
      icon: ShoppingBag,
      path: "/admin/orders",
      stat: stats ? `${stats.orders.pending} pending` : undefined
    },
    {
      title: "Customization",
      description: "Category templates and options rules",
      icon: Sliders,
      path: "/admin/customization"
    },
    {
      title: "Customer Reviews",
      description: "Ratings, feedback, and moderation",
      icon: Star,
      path: "/admin/reviews"
    }
  ];

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Admin Dashboard - Renu's Collections" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-6xl">
        {/* Navigation Bar */}
        <AdminNav className="mb-6" />

        {/* Header Banner */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Executive Management</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Admin Dashboard
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Logged in as <strong className="text-[#342824] dark:text-foreground">{user?.username}</strong> ({user?.role})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              asChild 
              size="sm" 
              className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl shadow-xs text-xs"
            >
              <Link to="/admin/products/new">
                <Plus className="w-3.5 h-3.5 mr-1" />
                <span>New Product</span>
              </Link>
            </Button>
          </div>
        </div>

        {/* Key Metrics Overview */}
        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Revenue */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden p-5">
              <div className="flex items-center justify-between text-xs text-[#756861] dark:text-muted-foreground">
                <span className="font-medium">Revenue (30d)</span>
                <div className="p-1.5 rounded-lg bg-[#B99A72]/15 text-[#B99A72]">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="font-playfair text-2xl font-bold text-[#B66F72] dark:text-primary">
                  ₹{stats.revenue.last30Days.toLocaleString('en-IN')}
                </span>
              </div>
              <p className="text-[11px] text-[#756861]/80 dark:text-muted-foreground/80 mt-1">
                Total recorded: ₹{stats.revenue.total.toLocaleString('en-IN')}
              </p>
            </Card>

            {/* Orders */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden p-5">
              <div className="flex items-center justify-between text-xs text-[#756861] dark:text-muted-foreground">
                <span className="font-medium">Orders</span>
                <div className="p-1.5 rounded-lg bg-[#B66F72]/15 text-[#B66F72]">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-playfair text-2xl font-bold text-[#342824] dark:text-foreground">
                  {stats.orders.total}
                </span>
                {stats.orders.pending > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                    {stats.orders.pending} pending
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#756861]/80 dark:text-muted-foreground/80 mt-1">
                {stats.orders.last30Days} in the last 30 days
              </p>
            </Card>

            {/* Products */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden p-5">
              <div className="flex items-center justify-between text-xs text-[#756861] dark:text-muted-foreground">
                <span className="font-medium">Products in Catalog</span>
                <div className="p-1.5 rounded-lg bg-[#B99A72]/15 text-[#B99A72]">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-playfair text-2xl font-bold text-[#342824] dark:text-foreground">
                  {stats.products.active}
                </span>
                <span className="text-xs text-[#756861] dark:text-muted-foreground">
                  / {stats.products.total} total
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${stats.products.lowStock > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-[#756861]/80 dark:text-muted-foreground/80'}`}>
                {stats.products.lowStock} pieces below low-stock threshold
              </p>
            </Card>

            {/* Users */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden p-5">
              <div className="flex items-center justify-between text-xs text-[#756861] dark:text-muted-foreground">
                <span className="font-medium">Registered Clients</span>
                <div className="p-1.5 rounded-lg bg-[#B66F72]/15 text-[#B66F72]">
                  <Users className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-playfair text-2xl font-bold text-[#342824] dark:text-foreground">
                  {stats.users.total}
                </span>
              </div>
              <p className="text-[11px] text-[#756861]/80 dark:text-muted-foreground/80 mt-1">
                {stats.users.customers} customers • {stats.users.admins} admin
              </p>
            </Card>
          </div>
        )}

        {/* Management Modules Grid */}
        <div className="mb-8">
          <h2 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground mb-4">
            Management Consoles
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {managementModules.map((mod) => {
              const Icon = mod.icon;

              return (
                <Card
                  key={mod.title}
                  onClick={() => navigate(mod.path)}
                  className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl p-5 hover:shadow-md hover:border-[#B66F72]/50 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-2.5 rounded-xl bg-[#F1E6DF]/60 dark:bg-muted/40 text-[#B66F72] dark:text-primary group-hover:bg-[#B66F72] group-hover:text-white transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[#756861] dark:text-muted-foreground group-hover:text-[#B66F72] transition-colors" />
                  </div>

                  <h3 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground mt-4">
                    {mod.title}
                  </h3>
                  <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                    {mod.description}
                  </p>

                  {mod.stat && (
                    <div className="mt-3 pt-3 border-t border-[#E6D8D0]/60 dark:border-border/60 flex items-center justify-between text-xs">
                      <span className="text-[#756861] dark:text-muted-foreground">Status</span>
                      <span className={`font-semibold ${mod.alert ? 'text-amber-700 dark:text-amber-400' : 'text-[#342824] dark:text-foreground'}`}>
                        {mod.stat}
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Top Products Table if present */}
        {stats && stats.topProducts && stats.topProducts.length > 0 && (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
              <h3 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                Top Rated Jewelry Pieces
              </h3>
              <Link to="/admin/products" className="text-xs text-[#B66F72] hover:underline">
                View All
              </Link>
            </div>
            <CardContent className="p-5">
              <div className="divide-y divide-[#E6D8D0]/40 dark:divide-border/40">
                {stats.topProducts.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between text-xs sm:text-sm">
                    <div>
                      <p className="font-medium text-[#342824] dark:text-foreground">{p.name}</p>
                      <span className="text-[11px] text-[#756861] dark:text-muted-foreground font-mono">SKU: {p.sku}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                        <Star className="w-3.5 h-3.5 fill-current" />
                        <span>{p.averageRating ? p.averageRating.toFixed(1) : '5.0'}</span>
                      </div>
                      <span className="text-xs text-[#756861] dark:text-muted-foreground">({p.reviewCount} reviews)</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
}

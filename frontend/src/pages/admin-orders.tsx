import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import AdminNav from "@/components/AdminNav";
import { 
  Package, 
  Search, 
  Filter, 
  Calendar,
  MapPin,
  Clock,
  RefreshCw,
  ShoppingBag,
  ExternalLink,
  Truck,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";

interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  customization?: {
    selections: Record<string, string | string[]>;
    previewImageUrl?: string;
    engraving?: string;
    breakdown?: { field: string; option: string; modifier?: number }[];
  };
}

interface Order {
  _id: string;
  orderNumber: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  fulfillmentStatus?: 'pending' | 'completed' | 'requires_action';
  items: OrderItem[];
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  shippingAddress: {
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  billingAddress: {
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone: string;
  };
  email: string;
  phone: string;
  notes?: string;
  paymentMethod: string;
  razorpayPaymentId?: string;
  trackingNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminOrders() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', '/api/v1/orders');
      const data = await response.json();
      setOrders(data.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'shipped':
        return 'bg-purple-50 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'processing':
        return 'bg-[#F1E6DF] text-[#95565A] dark:bg-muted dark:text-foreground border-[#E6D8D0] dark:border-border';
      case 'cancelled':
        return 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'refunded':
        return 'bg-stone-100 text-stone-800 dark:bg-stone-900 dark:text-stone-300 border-stone-200 dark:border-stone-800';
      default:
        return 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
  };

  const getPaymentBadge = (status: string, method?: string) => {
    if (method === 'cod') {
      return 'bg-stone-100 text-[#756861] dark:bg-muted dark:text-muted-foreground border-stone-200 dark:border-border';
    }
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'failed':
        return 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.shippingAddress?.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(true);
    try {
      let trackingNumber = undefined;
      if (newStatus === 'shipped') {
        trackingNumber = prompt('Enter tracking number (e.g., FedEx: 123456789012, BlueDart: B123456789):') || undefined;
        if (!trackingNumber) {
          toast({
            title: 'Cancelled',
            description: 'Status update cancelled - tracking number required for shipped status',
            variant: 'destructive',
          });
          setUpdating(false);
          return;
        }
      }

      const response = await apiRequest('PATCH', `/api/v1/orders/admin/${orderId}/status`, {
        status: newStatus,
        trackingNumber,
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: 'Success',
          description: `Order status updated to ${newStatus}`,
        });
        fetchOrders();
        if (selectedOrder?._id === orderId) {
          setSelectedOrder({ ...selectedOrder, status: newStatus as any, trackingNumber });
        }
      } else {
        throw new Error(data.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update order status',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO title="Order Management - Renu's Collections Admin" noindex />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-7xl">
        <AdminNav className="mb-6" />

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Fulfillment & Operations</span>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground mt-0.5">
              Order Management
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Process customer orders, update tracking, and inspect payments.
            </p>
          </div>

          <Button 
            onClick={fetchOrders}
            variant="outline" 
            size="sm"
            className="border-[#E6D8D0] dark:border-border text-xs rounded-xl flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#756861] dark:text-muted-foreground" />
            <Input
              placeholder="Search by order #, client name, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 border-[#E6D8D0] dark:border-border bg-white dark:bg-card text-xs sm:text-sm rounded-xl focus-visible:ring-[#B66F72]"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl text-xs sm:text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Orders Table/Cards */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="h-8 w-8 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-3" />
            <p className="text-xs text-[#756861] dark:text-muted-foreground">Loading orders...</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl p-8 text-center max-w-md mx-auto">
            <ShoppingBag className="w-12 h-12 text-[#B66F72] mx-auto mb-3 opacity-60" />
            <h3 className="font-playfair text-xl font-semibold mb-1">No Orders Match Filter</h3>
            <p className="text-xs text-[#756861] dark:text-muted-foreground mb-4">Try clearing your search query or status filter.</p>
            <Button onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} variant="outline" size="sm" className="text-xs">
              Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });

              return (
                <Card 
                  key={order._id}
                  className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card rounded-xl overflow-hidden shadow-xs hover:shadow-sm transition-all"
                >
                  <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/40 dark:bg-muted/10">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-playfair text-lg font-bold text-[#342824] dark:text-foreground">
                          #{order.orderNumber}
                        </span>
                        <span className="text-xs text-[#756861] dark:text-muted-foreground">
                          • {formattedDate}
                        </span>
                        {order.fulfillmentStatus === 'requires_action' && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                            <AlertCircle className="w-3 h-3" />
                            Requires Action
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                        Client: <strong className="text-[#342824] dark:text-foreground">{order.shippingAddress?.fullName}</strong> ({order.email})
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getOrderStatusBadge(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getPaymentBadge(order.paymentStatus, order.paymentMethod)}`}>
                        {order.paymentMethod === 'cod' ? 'COD' : 'Paid'}: {order.paymentStatus}
                      </span>
                      <span className="font-playfair text-lg font-bold text-[#B66F72] dark:text-primary ml-2">
                        ₹{order.total.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <CardContent className="p-4 sm:p-5">
                    {/* Item list snapshot */}
                    <div className="space-y-1.5 text-xs text-[#756861] dark:text-muted-foreground mb-4">
                      {order.items.map((i, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>
                            {i.name} <strong className="text-[#342824] dark:text-foreground">× {i.quantity}</strong>
                          </span>
                          <span>₹{(i.subtotal || i.unitPrice * i.quantity).toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>

                    {/* Status updater and action controls */}
                    <div className="border-t border-[#E6D8D0]/60 dark:border-border/60 pt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Update Status:</span>
                        <select
                          value={order.status}
                          disabled={updating}
                          onChange={(e) => handleUpdateStatus(order._id, e.target.value)}
                          className="px-2.5 py-1 border border-[#E6D8D0] dark:border-border rounded-lg text-xs bg-white dark:bg-card focus:outline-none focus:ring-1 focus:ring-[#B66F72]"
                        >
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="refunded">Refunded</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button 
                          asChild
                          variant="outline"
                          size="sm"
                          className="text-xs border-[#E6D8D0] dark:border-border rounded-lg h-8"
                        >
                          <Link to={`/orders/${order._id}`} target="_blank">
                            <span>Client Receipt</span>
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
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

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { 
  Package, 
  Search, 
  Filter, 
  IndianRupee, 
  Calendar,
  MapPin,
  Phone,
  Mail,
  Truck,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw
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
  };
}

interface Order {
  _id: string;
  orderNumber: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
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
  const [showDetails, setShowDetails] = useState(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'shipped':
        return 'bg-purple-100 text-purple-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'refunded':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.shippingAddress.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    setUpdating(true);
    try {
      let trackingNumber = undefined;
      if (newStatus === 'shipped') {
        trackingNumber = prompt('Enter tracking number (e.g., FedEx: 123456789012, BlueDart: B123456789):');
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

      console.log('Updating order status:', { orderId, newStatus, trackingNumber });
      const response = await apiRequest('PATCH', `/api/v1/orders/admin/${orderId}/status`, {
        status: newStatus,
        trackingNumber,
      });

      const data = await response.json();
      console.log('Update status response:', data);

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

  const handleRefund = async (orderId: string) => {
    if (!confirm('Are you sure you want to process a refund for this order?')) return;

    const reason = prompt('Enter refund reason (optional):');
    const amountStr = prompt('Enter refund amount (leave empty for full refund):');
    const amount = amountStr ? parseFloat(amountStr) : undefined;

    if (amountStr && isNaN(amount)) {
      toast({
        title: 'Error',
        description: 'Invalid amount',
        variant: 'destructive',
      });
      return;
    }

    setUpdating(true);
    try {
      const response = await apiRequest('POST', '/api/v1/payments/refund', {
        orderId,
        amount,
        reason,
      });
      
      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Refund processed successfully',
        });
        fetchOrders();
        if (selectedOrder?._id === orderId) {
          setSelectedOrder({ ...selectedOrder, paymentStatus: 'refunded' as any, status: 'refunded' as any });
        }
      }
    } catch (error) {
      console.error('Error processing refund:', error);
      toast({
        title: 'Error',
        description: 'Failed to process refund',
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8">
          <h1 className="text-4xl font-bold mb-4">Loading Orders...</h1>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="Order Management - Admin - Renu's Collections"
        description="Manage and track customer orders for Renu's Collections jewelry store."
        keywords="admin orders, order management, renu's collections admin"
        url="https://renucollections.com/admin/orders"
      />
      <main className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Order Management</h1>
          <Button onClick={fetchOrders} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Orders List */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search orders..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-48">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Orders */}
            {filteredOrders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No orders found</p>
                </CardContent>
              </Card>
            ) : (
              filteredOrders.map((order) => (
                <Card 
                  key={order._id} 
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => { setSelectedOrder(order); setShowDetails(true); }}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">#{order.orderNumber}</h3>
                          <Badge className={`${getStatusColor(order.status)} text-xs`}>
                            {order.status}
                          </Badge>
                          <Badge variant="outline" className={`${getPaymentStatusColor(order.paymentStatus)} text-xs`}>
                            {order.paymentStatus}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{order.shippingAddress.fullName}</p>
                        <p className="text-sm text-muted-foreground">{order.items.length} item(s)</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold flex items-center gap-1">
                          <IndianRupee className="h-4 w-4" />
                          {order.total.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Order Details */}
          {showDetails && selectedOrder && (
            <div className="lg:col-span-1">
              <Card className="sticky top-8">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">Order #{selectedOrder.orderNumber}</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setShowDetails(false)}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Status Actions */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Update Status:</p>
                    <div className="flex flex-wrap gap-2">
                      {['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={selectedOrder.status === status ? 'default' : 'outline'}
                          onClick={() => handleUpdateStatus(selectedOrder._id, status)}
                          disabled={updating}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Refund Action */}
                  {selectedOrder.paymentStatus === 'paid' && selectedOrder.status !== 'refunded' && (
                    <div className="pt-2 border-t">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRefund(selectedOrder._id)}
                        disabled={updating}
                        className="w-full"
                      >
                        Process Refund
                      </Button>
                    </div>
                  )}

                  {/* Customer Info */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Customer:</p>
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{selectedOrder.shippingAddress.fullName}</p>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Mail className="h-3 w-3" />
                        <p>{selectedOrder.email}</p>
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <p>{selectedOrder.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Shipping Address */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Shipping Address:</p>
                    <div className="text-sm space-y-1 text-muted-foreground">
                      <p>{selectedOrder.shippingAddress.line1}</p>
                      {selectedOrder.shippingAddress.line2 && <p>{selectedOrder.shippingAddress.line2}</p>}
                      <p>{selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.state} - {selectedOrder.shippingAddress.postalCode}</p>
                      <p>{selectedOrder.shippingAddress.country}</p>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Items:</p>
                    <div className="space-y-2">
                      {selectedOrder.items.map((item, idx) => (
                        <div key={idx} className="text-sm">
                          <p className="font-medium">{item.name}</p>
                          <p className="text-muted-foreground">
                            Qty: {item.quantity} × ₹{item.unitPrice.toFixed(2)}
                          </p>
                          {item.customization && (
                            <p className="text-xs text-primary">Customized</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tracking */}
                  {selectedOrder.trackingNumber && (
                    <div className="p-2 bg-blue-50 rounded">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-blue-600" />
                        <div>
                          <p className="text-xs font-medium">Tracking Number</p>
                          <p className="text-sm text-blue-600">{selectedOrder.trackingNumber}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment Info */}
                  {selectedOrder.razorpayPaymentId && (
                    <div className="text-xs text-muted-foreground">
                      <p>Payment ID: {selectedOrder.razorpayPaymentId}</p>
                    </div>
                  )}

                  {/* Notes */}
                  {selectedOrder.notes && (
                    <div className="p-2 bg-gray-50 rounded">
                      <p className="text-xs font-medium mb-1">Notes:</p>
                      <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-bold">
                      <span>Total:</span>
                      <span className="flex items-center gap-1">
                        <IndianRupee className="h-4 w-4" />
                        {selectedOrder.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Footer from '@/components/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/components/SEO';
import { Package, Calendar, IndianRupee, Clock } from 'lucide-react';

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
  createdAt: string;
  updatedAt: string;
}

export default function Orders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Loading Orders...</h1>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="My Orders - Renu's Collections"
        description="View your order history and track your jewelry purchases from Renu's Collections."
        keywords="my orders, order history, track order, renu's collections orders, jewelry orders"
        url="https://renucollections.com/orders"
      />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-center mb-12">My Orders</h1>

        {orders.length === 0 ? (
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">No orders yet</h2>
              <p className="text-muted-foreground mb-4">
                You haven't placed any orders yet. Start shopping to see your orders here.
              </p>
              <Button asChild>
                <Link to="/products">Browse Products</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {orders.map((order) => (
              <Card key={order._id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">Order #{order.orderNumber}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={getStatusColor(order.status)}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </Badge>
                        <Badge variant="outline" className={getPaymentStatusColor(order.paymentStatus)}>
                          Payment: {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        {new Date(order.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Order Items */}
                    <div className="space-y-3">
                      {order.items.map((item, idx) => (
                        <div key={`${order._id}-${idx}`} className="flex gap-4">
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-16 h-16 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Qty: {item.quantity} × ₹{item.unitPrice.toFixed(2)}
                            </p>
                            {item.customization && (
                              <div className="mt-1 text-xs text-muted-foreground">
                                <p>Customized</p>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-medium">₹{item.subtotal.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Order Summary */}
                    <div className="border-t pt-4 space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>₹{order.subtotal.toFixed(2)}</span>
                      </div>
                      {order.discount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount:</span>
                          <span>-₹{order.discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Shipping:</span>
                        <span>{order.shipping === 0 ? 'Free' : `₹${order.shipping.toFixed(2)}`}</span>
                      </div>
                      {order.tax > 0 && (
                        <div className="flex justify-between">
                          <span>Tax:</span>
                          <span>₹{order.tax.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-bold text-lg pt-2 border-t">
                        <span>Total:</span>
                        <span className="flex items-center gap-1">
                          <IndianRupee className="h-5 w-5" />
                          {order.total.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-4">
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/orders/${order._id}`}>View Details</Link>
                      </Button>
                      {(order.status === 'pending' || order.status === 'processing') && (
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleCancelOrder(order._id)}
                        >
                          Cancel Order
                        </Button>
                      )}
                      {(order.status === 'shipped' || order.status === 'delivered') && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          disabled
                          className="cursor-not-allowed"
                        >
                          Order shipped - Cannot cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );

  async function handleCancelOrder(orderId: string) {
    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
      const response = await apiRequest('POST', `/api/v1/orders/${orderId}/cancel`);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: 'Order Cancelled',
          description: 'Your order has been cancelled successfully',
        });
        fetchOrders();
      }
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel order',
        variant: 'destructive',
      });
    }
  }
}

import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Footer from '@/components/footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/components/SEO';
import { 
  Package, 
  Calendar, 
  IndianRupee, 
  Clock, 
  MapPin, 
  Phone, 
  Mail,
  Truck,
  CheckCircle,
  XCircle
} from 'lucide-react';

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

interface OrderStatusHistory {
  status: string;
  note?: string;
  changedAt: string;
  changedBy?: string;
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
  statusHistory: OrderStatusHistory[];
  createdAt: string;
  updatedAt: string;
}

export default function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && orderId) {
      fetchOrder();
    }
  }, [user, orderId]);

  const fetchOrder = async () => {
    try {
      const response = await apiRequest('GET', `/api/v1/orders/${orderId}`);
      const data = await response.json();
      setOrder(data.data);
    } catch (error) {
      console.error('Error fetching order:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order details',
        variant: 'destructive',
      });
      navigate('/orders');
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'delivered':
        return <CheckCircle className="h-5 w-5" />;
      case 'cancelled':
        return <XCircle className="h-5 w-5" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Loading Order Details...</h1>
        </main>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Order not found</h1>
          <Button asChild>
            <Link to="/orders">Back to Orders</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title={`Order ${order.orderNumber} - Renu's Collections`}
        description={`View details for order ${order.orderNumber} from Renu's Collections.`}
        keywords={`order ${order.orderNumber}, order details, renu's collections`}
        url={`https://renucollections.com/orders/${order._id}`}
      />
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Button asChild variant="ghost" className="mb-4">
            <Link to="/orders">← Back to Orders</Link>
          </Button>
          <h1 className="text-4xl font-bold">Order #{order.orderNumber}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Order Status */}
            <Card>
              <CardHeader>
                <CardTitle>Order Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(order.status)}
                    <Badge className={`${getStatusColor(order.status)} text-sm`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                    </Badge>
                  </div>
                  <Badge variant="outline" className={getPaymentStatusColor(order.paymentStatus)}>
                    Payment: {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
                  </Badge>
                </div>

                {/* Status Timeline */}
                <div className="space-y-3 mt-6">
                  {order.statusHistory.map((history, idx) => (
                    <div key={idx} className="flex gap-3 text-sm">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        {idx < order.statusHistory.length - 1 && (
                          <div className="w-0.5 h-8 bg-border" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium capitalize">{history.status}</p>
                        <p className="text-muted-foreground">{history.note}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(history.changedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {order.trackingNumber && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium">Tracking Number</p>
                        <p className="text-sm text-blue-600">{order.trackingNumber}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Items */}
            <Card>
              <CardHeader>
                <CardTitle>Order Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {order.items.map((item, idx) => (
                    <div key={`${order._id}-${idx}`} className="flex gap-4 pb-4 border-b last:border-0">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-20 h-20 object-cover rounded"
                        />
                      )}
                      <div className="flex-1">
                        <p className="font-medium text-lg">{item.name}</p>
                        <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {item.quantity} × ₹{item.unitPrice.toFixed(2)}
                        </p>
                        {item.customization && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                            <p className="font-medium text-xs text-muted-foreground mb-1">Customization:</p>
                            <ul className="text-xs space-y-1">
                              {Object.entries(item.customization.selections).map(([key, value]) => (
                                <li key={key}>
                                  <span className="text-muted-foreground">{key}:</span>{' '}
                                  {Array.isArray(value) ? value.join(', ') : value}
                                </li>
                              ))}
                            </ul>
                            {item.customization.previewImageUrl && (
                              <img
                                src={item.customization.previewImageUrl}
                                alt="Customization preview"
                                className="mt-2 w-16 h-16 object-cover rounded"
                              />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-lg">₹{item.subtotal.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Shipping & Billing Address */}
            <Card>
              <CardHeader>
                <CardTitle>Shipping & Billing Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Shipping Address */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">Shipping Address</h3>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{order.shippingAddress.fullName}</p>
                      <p>{order.shippingAddress.line1}</p>
                      {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                      <p>
                        {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}
                      </p>
                      <p>{order.shippingAddress.country}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <p>{order.shippingAddress.phone}</p>
                      </div>
                    </div>
                  </div>

                  {/* Billing Address */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">Billing Information</h3>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{order.billingAddress.fullName}</p>
                      <p>{order.billingAddress.line1}</p>
                      {order.billingAddress.line2 && <p>{order.billingAddress.line2}</p>}
                      <p>
                        {order.billingAddress.city}, {order.billingAddress.state} - {order.billingAddress.postalCode}
                      </p>
                      <p>{order.billingAddress.country}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <p>{order.billingAddress.phone}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <p>{order.email}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {order.notes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium mb-1">Order Notes:</p>
                    <p className="text-sm text-muted-foreground">{order.notes}</p>
                  </div>
                )}

                {order.razorpayPaymentId && (
                  <div className="mt-4 p-3 bg-gray-50 rounded">
                    <p className="text-sm font-medium mb-1">Payment Reference:</p>
                    <p className="text-sm text-muted-foreground">{order.razorpayPaymentId}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
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
                  <div className="flex justify-between font-bold text-lg pt-3 border-t">
                    <span>Total:</span>
                    <span className="flex items-center gap-1">
                      <IndianRupee className="h-5 w-5" />
                      {order.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="mt-6 space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>Placed on {new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Payment via {order.paymentMethod === 'razorpay' ? 'Razorpay' : 'Cash on Delivery'}</span>
                  </div>
                </div>

                {order.status === 'pending' && (
                  <div className="mt-6">
                    <Button 
                      className="w-full" 
                      variant="destructive"
                      onClick={() => handleCancelOrder(order._id)}
                    >
                      Cancel Order
                    </Button>
                  </div>
                )}

                <div className="mt-4">
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/products">Continue Shopping</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
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
        fetchOrder();
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

import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Footer from '@/components/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest, getAssetUrl } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/components/SEO';
import OrderProgressTracker from '@/components/OrderProgressTracker';
import { getEstimatedDeliveryWindow } from '@/lib/deliveryEstimate';
import { 
  Package, 
  Calendar, 
  Clock, 
  MapPin, 
  Phone, 
  Mail,
  ArrowLeft,
  CreditCard,
  Banknote,
  CheckCircle,
  XCircle,
  Truck,
  ShieldCheck,
  ShoppingBag
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
    breakdown?: { field: string; option: string; modifier?: number }[];
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
      setLoading(true);
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

  const handleCancelOrder = async (orderIdToCancel: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
      const response = await apiRequest('POST', `/api/v1/orders/${orderIdToCancel}/cancel`);
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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-lg">
          <div className="h-10 w-10 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-4" />
          <h1 className="font-playfair text-2xl text-[#342824] dark:text-foreground">Loading Order Details...</h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mt-2">Retrieving your order invoice and status timeline.</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-[#B66F72] dark:text-primary" />
          </div>
          <h1 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground mb-2">Order Not Found</h1>
          <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mb-6">We could not locate this order in your account.</p>
          <Button asChild className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl">
            <Link to="/orders">Return to Orders</Link>
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO 
        title={`Order #${order.orderNumber} - Renu's Collections`}
        description={`View detailed receipt, timeline and address info for order #${order.orderNumber}.`}
        keywords={`order ${order.orderNumber}, order details, renu's collections jewelry`}
        url={`https://renucollections.com/orders/${order._id}`}
      />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-6xl">
        {/* Navigation Breadcrumb */}
        <div className="mb-6">
          <Link 
            to="/orders" 
            className="inline-flex items-center text-xs font-medium text-[#756861] dark:text-muted-foreground hover:text-[#B66F72] dark:hover:text-primary transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back to My Orders
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-4">
            <div>
              <span className="text-xs uppercase font-semibold text-[#B99A72] tracking-wider">Purchase Receipt</span>
              <h1 className="font-playfair text-2xl sm:text-3xl font-semibold text-[#342824] dark:text-foreground mt-0.5">
                Order #{order.orderNumber}
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${getOrderStatusBadge(order.status)}`}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${getPaymentBadge(order.paymentStatus, order.paymentMethod)}`}>
                {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online'}: {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Column (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Items Card */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#B66F72]" />
                  <h2 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                    Purchased Jewelry ({order.items.length})
                  </h2>
                </div>
              </div>

              <CardContent className="p-5 space-y-4">
                {order.items.map((item, idx) => {
                  const fallbackImg = '/logo.png';
                  const displayImg = item.imageUrl ? getAssetUrl(item.imageUrl) : fallbackImg;

                  return (
                    <div 
                      key={`${order._id}-${idx}`}
                      className="flex items-start gap-4 py-3 border-b border-[#E6D8D0]/40 dark:border-border/40 last:border-b-0"
                    >
                      <img
                        src={displayImg}
                        alt={item.name}
                        className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg object-cover border border-[#E6D8D0]/80 dark:border-border bg-muted/20 shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = fallbackImg;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <Link 
                          to={`/product/${item.productId}`}
                          className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground hover:text-[#B66F72] transition-colors line-clamp-1"
                        >
                          {item.name}
                        </Link>
                        <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                          SKU: {item.sku} • Qty: {item.quantity} × ₹{item.unitPrice.toLocaleString('en-IN')}
                        </p>

                        {/* Customization Details */}
                        {item.customization && (
                          <div className="mt-2 p-2.5 rounded-lg bg-[#FBF7F3]/80 dark:bg-muted/40 border border-[#E6D8D0]/60 dark:border-border/40 text-xs space-y-1">
                            <span className="font-semibold text-[10px] text-[#B99A72] uppercase tracking-wider">Customization Spec</span>
                            {item.customization.breakdown && item.customization.breakdown.length > 0 ? (
                              <div className="space-y-0.5 pt-0.5">
                                {item.customization.breakdown.map((b, bIdx) => (
                                  <div key={bIdx} className="flex justify-between text-xs text-[#756861] dark:text-muted-foreground">
                                    <span>{b.field}: <strong className="text-[#342824] dark:text-foreground font-medium">{b.option}</strong></span>
                                    {b.modifier ? <span className="text-[#B66F72] font-medium">+₹{b.modifier}</span> : null}
                                  </div>
                                ))}
                              </div>
                            ) : item.customization.selections ? (
                              <div className="space-y-0.5 pt-0.5">
                                {Object.entries(item.customization.selections).map(([key, val]) => (
                                  <div key={key} className="text-xs text-[#756861] dark:text-muted-foreground">
                                    <span className="capitalize">{key.replace(/_/g, ' ')}:</span> <strong className="text-[#342824] dark:text-foreground font-medium">{Array.isArray(val) ? val.join(', ') : String(val)}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {item.customization.engraving && (
                              <p className="text-xs text-[#B99A72] pt-1">
                                Engraving: "{item.customization.engraving}"
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <span className="font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground shrink-0">
                        ₹{item.subtotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Order Progress Tracker */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#B66F72]" />
                  <h2 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                    Order Progress
                  </h2>
                </div>
                {/* Delivery estimate inline badge */}
                {(() => {
                  const estimate = getEstimatedDeliveryWindow(order.createdAt);
                  if (!estimate || order.status === 'delivered' || order.status === 'cancelled' || order.status === 'refunded') return null;
                  return (
                    <span className="text-[11px] font-medium text-[#B99A72] dark:text-[#B99A72] bg-[#F1E6DF]/60 dark:bg-muted/40 px-2.5 py-1 rounded-full border border-[#E6D8D0]/80 dark:border-border hidden sm:inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Est. {estimate.formattedShort}
                    </span>
                  );
                })()}
              </div>

              <CardContent className="p-5">
                <OrderProgressTracker
                  status={order.status}
                  statusHistory={order.statusHistory}
                  createdAt={order.createdAt}
                />

                {/* Delivery Estimate Card (visible for active orders) */}
                {(() => {
                  if (order.status === 'cancelled' || order.status === 'refunded') return null;
                  if (order.status === 'delivered') {
                    const deliveredEntry = order.statusHistory.find(h => h.status === 'delivered');
                    if (deliveredEntry) {
                      return (
                        <div className="mt-4 p-3 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900 flex items-center gap-2.5 text-xs">
                          <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <div>
                            <span className="font-medium text-emerald-800 dark:text-emerald-300">Delivered on </span>
                            <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                              {new Date(deliveredEntry.changedAt).toLocaleDateString('en-IN', {
                                timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric'
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }
                  const estimate = getEstimatedDeliveryWindow(order.createdAt);
                  if (!estimate) return null;
                  return (
                    <div className="mt-4 p-3 rounded-lg bg-[#F1E6DF]/50 dark:bg-muted/40 border border-[#E6D8D0]/80 dark:border-border flex items-center gap-2.5 text-xs">
                      <Calendar className="w-4 h-4 text-[#B99A72] shrink-0" />
                      <div>
                        <span className="font-medium text-[#342824] dark:text-foreground">Estimated Delivery: </span>
                        <span className="font-semibold text-[#B66F72] dark:text-primary">{estimate.formatted}</span>
                        <p className="text-[11px] text-[#756861]/70 dark:text-muted-foreground/70 mt-0.5">
                          5–7 business days (excludes weekends)
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Tracking Number */}
                {order.trackingNumber && (
                  <div className="mt-4 p-3 rounded-lg bg-[#F1E6DF]/50 dark:bg-muted/40 border border-[#E6D8D0]/80 dark:border-border flex items-center gap-2.5 text-xs">
                    <Truck className="w-4 h-4 text-[#B99A72] shrink-0" />
                    <div>
                      <span className="font-medium text-[#342824] dark:text-foreground">Courier Tracking Number:</span>{' '}
                      <span className="font-mono text-[#B66F72] dark:text-primary font-semibold">{order.trackingNumber}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status History Timeline */}

            {/* Addresses Card */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#B99A72]" />
                <h2 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                  Fulfillment & Address Information
                </h2>
              </div>

              <CardContent className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs sm:text-sm">
                <div>
                  <h3 className="font-semibold text-xs text-[#756861] dark:text-muted-foreground uppercase tracking-wider mb-2">
                    Shipping Address (Tamil Nadu)
                  </h3>
                  <div className="space-y-0.5 text-[#342824] dark:text-foreground">
                    <p className="font-semibold">{order.shippingAddress.fullName}</p>
                    <p>{order.shippingAddress.line1}</p>
                    {order.shippingAddress.line2 && <p>{order.shippingAddress.line2}</p>}
                    <p>{order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}</p>
                    <p>{order.shippingAddress.country}</p>
                    {order.shippingAddress.phone && (
                      <p className="pt-1 text-[#756861] dark:text-muted-foreground">Phone: {order.shippingAddress.phone}</p>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-xs text-[#756861] dark:text-muted-foreground uppercase tracking-wider mb-2">
                    Contact & Billing Information
                  </h3>
                  <div className="space-y-0.5 text-[#342824] dark:text-foreground">
                    <p className="font-semibold">{order.billingAddress?.fullName || order.shippingAddress.fullName}</p>
                    <p>{order.email}</p>
                    <p>{order.phone || order.shippingAddress.phone}</p>
                    {order.paymentMethod && (
                      <p className="pt-1 text-[#756861] dark:text-muted-foreground capitalize">
                        Method: {order.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment (Razorpay)'}
                      </p>
                    )}
                    {order.razorpayPaymentId && (
                      <p className="font-mono text-[11px] text-[#756861] dark:text-muted-foreground">
                        Ref: {order.razorpayPaymentId}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar Column (4 cols - sticky) */}
          <div className="lg:col-span-4 lg:sticky lg:top-28 space-y-4">
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-sm rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20">
                <h2 className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">
                  Persisted Payment Summary
                </h2>
              </div>

              <CardContent className="p-5 space-y-3.5 text-xs sm:text-sm">
                <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                  <span>Merchandise Subtotal</span>
                  <span className="font-medium text-[#342824] dark:text-foreground">₹{order.subtotal.toLocaleString('en-IN')}</span>
                </div>

                {order.discount > 0 && (
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <span>Applied Discount</span>
                    <span className="font-medium">-₹{order.discount.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                  <span>Shipping & Packaging</span>
                  <span className="font-medium text-[#342824] dark:text-foreground">
                    {order.shipping === 0 ? 'Free' : `₹${order.shipping}`}
                  </span>
                </div>

                {/* Display historical tax only if recorded in the persisted order */}
                {order.tax > 0 && (
                  <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                    <span>Recorded Tax</span>
                    <span className="font-medium text-[#342824] dark:text-foreground">₹{order.tax.toLocaleString('en-IN')}</span>
                  </div>
                )}

                <div className="border-t border-[#E6D8D0] dark:border-border pt-3 flex justify-between items-baseline">
                  <div>
                    <span className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">Total Amount</span>
                    <p className="text-[10px] text-[#756861] dark:text-muted-foreground">Persisted order total</p>
                  </div>
                  <span className="font-playfair text-xl sm:text-2xl font-bold text-[#B66F72] dark:text-primary">
                    ₹{order.total.toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="pt-3 border-t border-[#E6D8D0]/60 dark:border-border/60 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-[#756861] dark:text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 text-[#B99A72]" />
                    <span>Placed on {formattedDate}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#756861] dark:text-muted-foreground">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#B99A72]" />
                    <span>Authentic boutique craftsmanship</span>
                  </div>
                </div>

                {/* Cancellation action if permitted */}
                {order.status === 'pending' && (
                  <Button 
                    variant="outline"
                    onClick={() => handleCancelOrder(order._id)}
                    className="w-full mt-2 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40 text-xs rounded-xl"
                  >
                    Cancel Order
                  </Button>
                )}

                <Button asChild className="w-full bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl text-xs py-5 mt-2">
                  <Link to="/products" className="flex items-center justify-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Continue Shopping</span>
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

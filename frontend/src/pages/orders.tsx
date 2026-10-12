import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Footer from '@/components/footer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiRequest, getAssetUrl } from '@/lib/queryClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { SEO } from '@/components/SEO';
import { getEstimatedDeliveryWindow } from '@/lib/deliveryEstimate';
import { 
  Package, 
  Calendar, 
  CreditCard, 
  Banknote, 
  ChevronRight, 
  ShoppingBag, 
  RefreshCw,
  Sparkles,
  ArrowRight
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

interface Order {
  _id: string;
  orderNumber: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentMethod?: string;
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
      setLoading(true);
      const response = await apiRequest('GET', '/api/v1/orders');
      const data = await response.json();
      setOrders(data.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your orders',
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

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you wish to cancel this order?')) return;

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
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-lg">
          <div className="h-10 w-10 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-4" />
          <h1 className="font-playfair text-2xl text-[#342824] dark:text-foreground">Loading Your Orders...</h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mt-2">Retrieving your boutique jewelry purchase history.</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO 
        title="My Orders - Renu's Collections"
        description="View your handcrafted jewelry orders, review customization details and track purchase status."
        keywords="my orders, order history, track jewelry, renu's collections"
        url="https://renucollections.com/orders"
      />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground">
              My Orders
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Review and track your bespoke jewelry creations.
            </p>
          </div>
          {orders.length > 0 && (
            <span className="text-xs text-[#756861] dark:text-muted-foreground bg-white dark:bg-card px-3 py-1.5 rounded-full border border-[#E6D8D0] dark:border-border shadow-xs w-fit">
              {orders.length} {orders.length === 1 ? 'Order' : 'Orders'} Recorded
            </span>
          )}
        </div>

        {/* Empty State */}
        {orders.length === 0 ? (
          <Card className="max-w-md mx-auto border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ShoppingBag className="w-8 h-8 text-[#B66F72] dark:text-primary" />
            </div>
            <h2 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground mb-2">
              No orders placed yet
            </h2>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mb-6 leading-relaxed">
              When you order personalized bracelets, chains, or boutique jewelry pieces, their tracking and status will appear here.
            </p>
            <Button asChild className="bg-[#B66F72] hover:bg-[#95565A] text-white rounded-xl px-6 py-5">
              <Link to="/products" className="flex items-center gap-2">
                <span>Browse Boutique Collection</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </Card>
        ) : (
          /* Orders List */
          <div className="space-y-6">
            {orders.map((order) => {
              const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
              });

              return (
                <Card 
                  key={order._id}
                  className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
                >
                  {/* Card Header Bar */}
                  <div className="p-4 sm:p-5 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/50 dark:bg-muted/15 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-[#756861] dark:text-muted-foreground tracking-wider">Order</span>
                        <p className="font-playfair text-base sm:text-lg font-bold text-[#342824] dark:text-foreground">
                          #{order.orderNumber}
                        </p>
                      </div>
                      <div className="hidden sm:flex flex-col gap-0.5 pl-3 border-l border-[#E6D8D0] dark:border-border">
                        <div className="flex items-center gap-1.5 text-xs text-[#756861] dark:text-muted-foreground">
                          <Calendar className="w-3.5 h-3.5 text-[#B99A72]" />
                          <span>{formattedDate}</span>
                        </div>
                        {(() => {
                          if (order.status === 'delivered' || order.status === 'cancelled' || order.status === 'refunded') return null;
                          const estimate = getEstimatedDeliveryWindow(order.createdAt);
                          if (!estimate) return null;
                          return (
                            <div className="flex items-center gap-1.5 text-[11px] text-[#B99A72]">
                              <Package className="w-3 h-3" />
                              <span>Est. {estimate.formattedShort}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Status Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getOrderStatusBadge(order.status)}`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                      </span>
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${getPaymentBadge(order.paymentStatus, order.paymentMethod)}`}>
                        {order.paymentMethod === 'cod' ? 'COD' : 'Paid'}: {order.paymentStatus.charAt(0).toUpperCase() + order.paymentStatus.slice(1)}
                      </span>
                    </div>
                  </div>

                  {/* Card Content - Items */}
                  <CardContent className="p-4 sm:p-5 space-y-4">
                    <div className="space-y-3">
                      {order.items.map((item, idx) => {
                        const fallbackImg = '/logo.png';
                        const displayImg = item.imageUrl ? getAssetUrl(item.imageUrl) : fallbackImg;

                        return (
                          <div 
                            key={`${order._id}-${idx}`}
                            className="flex items-start gap-3 sm:gap-4 py-2 border-b border-[#E6D8D0]/40 dark:border-border/40 last:border-b-0"
                          >
                            <img
                              src={displayImg}
                              alt={item.name}
                              className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover border border-[#E6D8D0]/80 dark:border-border bg-muted/20 shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = fallbackImg;
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="font-playfair font-semibold text-sm sm:text-base text-[#342824] dark:text-foreground truncate">
                                {item.name}
                              </p>
                              <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                                Qty: {item.quantity} × ₹{item.unitPrice.toLocaleString('en-IN')}
                              </p>

                              {/* Customization Details */}
                              {item.customization && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {(item.customization as any).breakdown && (item.customization as any).breakdown.length > 0 ? (
                                    (item.customization as any).breakdown.map((b: any, bIdx: number) => (
                                      <span 
                                        key={bIdx}
                                        className="text-[10px] bg-[#F1E6DF]/80 dark:bg-muted text-[#756861] dark:text-muted-foreground px-1.5 py-0.5 rounded border border-[#E6D8D0]/60 dark:border-border/40"
                                      >
                                        {b.field}: <strong className="text-[#342824] dark:text-foreground">{b.option}</strong>
                                      </span>
                                    ))
                                  ) : item.customization.selections && Object.keys(item.customization.selections).length > 0 ? (
                                    Object.entries(item.customization.selections).map(([key, val]) => (
                                      <span 
                                        key={key}
                                        className="text-[10px] bg-[#F1E6DF]/80 dark:bg-muted text-[#756861] dark:text-muted-foreground px-1.5 py-0.5 rounded border border-[#E6D8D0]/60 dark:border-border/40"
                                      >
                                        <span className="capitalize">{key.replace(/_/g, ' ')}:</span> <strong className="text-[#342824] dark:text-foreground">{Array.isArray(val) ? val.join(', ') : String(val)}</strong>
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-[#756861] dark:text-muted-foreground italic">Standard</span>
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
                    </div>

                    {/* Footer Controls & Total */}
                    <div className="pt-3 border-t border-[#E6D8D0] dark:border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-[11px] text-[#756861] dark:text-muted-foreground">Order Total</span>
                        <p className="font-playfair text-xl font-bold text-[#B66F72] dark:text-primary">
                          ₹{order.total.toLocaleString('en-IN')}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {order.status === 'pending' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleCancelOrder(order._id)}
                            className="border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40 text-xs rounded-lg"
                          >
                            Cancel Order
                          </Button>
                        )}
                        <Button 
                          asChild 
                          size="sm"
                          className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-lg px-4 flex items-center gap-1 shadow-xs"
                        >
                          <Link to={`/orders/${order._id}`}>
                            <span>View Details</span>
                            <ChevronRight className="w-3.5 h-3.5" />
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

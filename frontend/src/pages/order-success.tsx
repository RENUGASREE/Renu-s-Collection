import { Link, useLocation } from "react-router-dom";
import { 
  CheckCircle, 
  Package, 
  MapPin, 
  CreditCard, 
  Banknote, 
  ShoppingBag, 
  ArrowRight, 
  Calendar, 
  ShieldCheck, 
  Sparkles,
  ExternalLink,
  Truck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getEstimatedDeliveryWindow } from "@/lib/deliveryEstimate";

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization?: {
    selections?: Record<string, string | string[]>;
    breakdown?: { field: string; option: string; modifier?: number }[];
  };
}

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  createdAt?: string;
  items: OrderItem[];
  subtotal?: number;
  shipping?: number;
  total: number;
  shippingAddress: {
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
    phone?: string;
  };
}

export default function OrderSuccess() {
  const location = useLocation();
  const [order, setOrder] = useState<Order | null>(location.state?.order || null);
  const [loading, setLoading] = useState(!location.state?.order && !!location.state?.orderId);

  useEffect(() => {
    if (location.state?.orderId && !order) {
      fetchOrder(location.state.orderId);
    }
  }, [location.state?.orderId]);

  const fetchOrder = async (orderId: string) => {
    try {
      setLoading(true);
      const response = await apiRequest('GET', `/api/v1/orders/${orderId}`);
      const data = await response.json();
      if (data.data) {
        setOrder(data.data);
      }
    } catch (error) {
      console.error('Error fetching confirmed order:', error);
    } finally {
      setLoading(false);
    }
  };

  const isPaid = order?.paymentStatus === 'paid';
  const isCOD = order?.paymentMethod === 'cod';

  const formattedDate = order?.createdAt 
    ? new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-lg">
          <div className="h-10 w-10 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-4" />
          <h1 className="font-playfair text-2xl text-[#342824] dark:text-foreground">Retrieving Order Details...</h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mt-2">Loading your confirmation snapshot.</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO 
        title="Order Confirmation - Renu's Collections"
        description="Your order has been placed with Renu's Collections. Review your order summary and delivery details."
        keywords="order confirmation, receipt, jewelry purchase, renu's collections"
        url="https://renucollections.com/order-success"
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-3xl">
        {/* Boutique Success Banner */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[#B66F72]/15 dark:bg-primary/20 flex items-center justify-center mx-auto mb-4 ring-8 ring-[#F1E6DF]/60 dark:ring-muted/30">
            <CheckCircle className="h-8 w-8 text-[#B66F72] dark:text-primary" />
          </div>
          <span className="text-xs uppercase tracking-widest font-semibold text-[#B99A72]">
            Purchase Confirmed
          </span>
          <h1 className="font-playfair text-3xl sm:text-4xl font-semibold mt-1.5 text-[#342824] dark:text-foreground">
            Thank You for Your Order
          </h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mt-2 max-w-md mx-auto">
            Your handcrafted jewelry piece has been scheduled for preparation with artisanal care in our studio.
          </p>
        </div>

        {order ? (
          <div className="space-y-6">
            {/* Order Identity & Payment Status Card */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/40 dark:bg-muted/10">
                <div>
                  <span className="text-xs text-[#756861] dark:text-muted-foreground uppercase tracking-wider font-medium">Order Number</span>
                  <p className="font-playfair text-xl font-bold text-[#342824] dark:text-foreground mt-0.5">
                    #{order.orderNumber}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {formattedDate && (
                    <div className="flex items-center gap-1.5 text-xs text-[#756861] dark:text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 text-[#B99A72]" />
                      <span>{formattedDate}</span>
                    </div>
                  )}
                  {/* Status Badge */}
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#F1E6DF] dark:bg-muted text-[#95565A] dark:text-foreground border border-[#E6D8D0] dark:border-border">
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </span>
                </div>
              </div>

              <CardContent className="p-5 sm:p-6 space-y-6">
                {/* Payment Breakdown Notice */}
                <div className="p-4 rounded-xl border border-[#E6D8D0]/80 dark:border-border bg-[#FBF7F3]/70 dark:bg-muted/20 flex items-start gap-3.5">
                  {isCOD ? (
                    <Banknote className="w-5 h-5 text-[#B99A72] shrink-0 mt-0.5" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-[#B99A72] shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-sm text-[#342824] dark:text-foreground">
                      {isCOD ? "Cash on Delivery" : "Online Payment (Razorpay)"}
                    </p>
                    <p className="text-[#756861] dark:text-muted-foreground leading-relaxed">
                      {isCOD 
                        ? "Payment of ₹" + order.total.toLocaleString('en-IN') + " will be collected upon doorstep delivery."
                        : isPaid
                          ? "Payment confirmed. Your transaction is verified and marked paid."
                          : "Payment status: " + (order.paymentStatus || "Processing") + ". Receipt acknowledged."}
                    </p>
                  </div>
                </div>

                {/* Items Summary */}
                <div>
                  <h3 className="font-playfair font-semibold text-base text-[#342824] dark:text-foreground mb-3 flex items-center gap-2">
                    <Package className="w-4 h-4 text-[#B66F72]" />
                    <span>Selected Jewelry Pieces</span>
                  </h3>
                  <div className="space-y-3 border-t border-[#E6D8D0]/60 dark:border-border/60 pt-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start text-sm py-1.5">
                        <div className="flex-1 pr-4">
                          <p className="font-medium text-[#342824] dark:text-foreground">{item.name}</p>
                          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                            Qty: {item.quantity} × ₹{item.unitPrice.toLocaleString('en-IN')}
                          </p>
                          {/* Customization Details */}
                          {item.customization?.breakdown && item.customization.breakdown.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.customization.breakdown.map((b, bIdx) => (
                                <span 
                                  key={bIdx} 
                                  className="text-[10px] bg-[#F1E6DF]/80 dark:bg-muted text-[#756861] dark:text-muted-foreground px-1.5 py-0.5 rounded border border-[#E6D8D0]/60 dark:border-border/40"
                                >
                                  {b.field}: <strong className="text-[#342824] dark:text-foreground">{b.option}</strong>
                                </span>
                              ))}
                            </div>
                          ) : item.customization?.selections && Object.keys(item.customization.selections).length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {Object.entries(item.customization.selections).map(([key, val]) => (
                                <span 
                                  key={key} 
                                  className="text-[10px] bg-[#F1E6DF]/80 dark:bg-muted text-[#756861] dark:text-muted-foreground px-1.5 py-0.5 rounded border border-[#E6D8D0]/60 dark:border-border/40"
                                >
                                  <span className="capitalize">{key.replace(/_/g, ' ')}:</span> <strong className="text-[#342824] dark:text-foreground">{Array.isArray(val) ? val.join(', ') : String(val)}</strong>
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <span className="font-semibold text-[#342824] dark:text-foreground">
                          ₹{item.subtotal.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total & Delivery Address Section */}
                <div className="border-t border-[#E6D8D0] dark:border-border pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Delivery Address */}
                  <div>
                    <h4 className="font-medium text-xs text-[#756861] dark:text-muted-foreground flex items-center gap-1.5 mb-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[#B99A72]" />
                      <span>Delivery Address (Tamil Nadu)</span>
                    </h4>
                    <p className="text-xs text-[#342824] dark:text-foreground font-medium leading-relaxed">
                      {order.shippingAddress.fullName}
                      <br />
                      {order.shippingAddress.line1}
                      {order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}
                      <br />
                      {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}
                    </p>
                  </div>

                  {/* Total Amount */}
                  <div className="sm:text-right flex flex-col sm:justify-end">
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">
                      Total Payable
                    </span>
                    <span className="font-playfair text-2xl font-bold text-[#B66F72] dark:text-primary">
                      ₹{order.total.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[11px] text-[#756861] dark:text-muted-foreground">
                      Boutique packaging included
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Next Steps / Reassurance */}
            <div className="p-4 rounded-xl border border-[#E6D8D0]/60 dark:border-border/60 bg-white dark:bg-card text-center text-xs text-[#756861] dark:text-muted-foreground flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#B99A72]" />
              <span>We will notify you via email and SMS as your jewelry is prepared and dispatched.</span>
            </div>

            {/* Delivery Estimate */}
            {order.createdAt && (() => {
              const estimate = getEstimatedDeliveryWindow(order.createdAt);
              if (!estimate) return null;
              return (
                <div className="p-4 rounded-xl border border-[#E6D8D0]/80 dark:border-border bg-[#FBF7F3]/70 dark:bg-muted/20 flex items-start gap-3.5">
                  <Truck className="w-5 h-5 text-[#B99A72] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[#342824] dark:text-foreground">
                      Estimated Delivery Window
                    </p>
                    <p className="text-base font-bold text-[#B66F72] dark:text-primary mt-0.5">
                      {estimate.formatted}
                    </p>
                    <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1">
                      5–7 business days from order placement (weekends excluded)
                    </p>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          /* Graceful Fallback if page refreshed directly without state */
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl p-8 text-center space-y-4">
            <Sparkles className="w-8 h-8 text-[#B99A72] mx-auto" />
            <h2 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
              Order Confirmed
            </h2>
            <p className="text-sm text-[#756861] dark:text-muted-foreground max-w-sm mx-auto">
              Your order has been recorded. You can view its real-time status anytime in your account order history.
            </p>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
          <Button 
            asChild 
            className="bg-[#B66F72] hover:bg-[#95565A] text-white px-6 py-5 rounded-xl font-medium shadow-xs flex items-center justify-center gap-2"
          >
            <Link to="/orders">
              <span>View My Orders</span>
              <ExternalLink className="w-4 h-4" />
            </Link>
          </Button>
          <Button 
            asChild 
            variant="outline" 
            className="border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50 dark:hover:bg-muted px-6 py-5 rounded-xl font-medium"
          >
            <Link to="/products" className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span>Continue Shopping</span>
            </Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
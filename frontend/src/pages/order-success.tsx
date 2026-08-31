import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Package, IndianRupee, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/queryClient";

interface OrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  customization?: {
    selections: Record<string, string | string[]>;
  };
}

interface Order {
  _id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  items: OrderItem[];
  total: number;
  shippingAddress: {
    fullName: string;
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export default function OrderSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(location.state?.order || null);
  const [loading, setLoading] = useState(!location.state?.order);

  useEffect(() => {
    if (location.state?.orderId && !order) {
      fetchOrder(location.state.orderId);
    }
  }, [location.state?.orderId]);

  const fetchOrder = async (orderId: string) => {
    try {
      const response = await apiRequest('GET', `/api/v1/orders/${orderId}`);
      const data = await response.json();
      setOrder(data.data);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Loading...</h1>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="Order Success - Renu's Collections"
        description="Your order has been placed successfully! Thank you for purchasing from Renu's Collections. Track your order and view order details."
        keywords="order success, order confirmation, purchase complete, renu's collections order, jewelry order"
        url="https://renucollections.com/order-success"
      />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <CheckCircle className="h-24 w-24 text-green-500 mx-auto mb-6" />
            <h1 className="text-5xl font-bold mb-4">Order Placed Successfully!</h1>
            <p className="text-xl text-muted-foreground">
              Thank you for your purchase. Your order has been confirmed.
            </p>
          </div>

          {order && (
            <Card className="mb-8">
              <CardContent className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Order #{order.orderNumber}</h2>
                  <Badge className="bg-green-100 text-green-800">
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                  </Badge>
                </div>

                {/* Order Items */}
                <div className="space-y-3 mb-6">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start">
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
                      <p className="font-medium">₹{item.subtotal.toFixed(2)}</p>
                    </div>
                  ))}
                </div>

                {/* Total */}
                <div className="border-t pt-4 flex justify-between items-center">
                  <span className="font-semibold">Total Amount</span>
                  <span className="text-2xl font-bold flex items-center gap-1">
                    <IndianRupee className="h-5 w-5" />
                    {order.total.toFixed(2)}
                  </span>
                </div>

                {/* Shipping Address */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium text-sm">Shipping to:</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {order.shippingAddress.fullName}, {order.shippingAddress.line1}, {order.shippingAddress.city}, {order.shippingAddress.state} - {order.shippingAddress.postalCode}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link to="/products">Continue Shopping</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/orders">View My Orders</Link>
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
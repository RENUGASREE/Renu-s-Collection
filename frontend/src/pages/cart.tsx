import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  ShoppingBag, 
  Minus, 
  Plus, 
  Trash2, 
  AlertCircle, 
  ArrowLeft, 
  Sparkles, 
  RefreshCw, 
  Truck,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import Footer from "@/components/footer";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";

interface CartItem {
  id: string;
  name: string;
  price: number;
  basePrice: number;
  priceModifier: number;
  quantity: number;
  image: string; // normalized client-side from image_url/imageUrl
  itemType?: "product" | "custom_design";
  studioDesign?: {
    jewelleryType: string;
    wristMm: number;
    beadSequence?: any[];
    charms?: any[];
    breakdown?: any;
  };
  customization?: {
    selections?: Record<string, any>;
    priceModifier?: number;
    breakdown?: { field: string; option: string; modifier?: number }[];
  };
}

export default function Cart() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast: _toast } = useToast();

  const fetchCartItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest('GET', '/api/v1/cart');
      const data = await response.json();
      // Backend returns { success: true, data: items } where data is the items array
      const items = data.data || [];
      const normalized: CartItem[] = items.map((item: any) => {
        const basePrice = Number(item.unitPrice ?? item.price ?? 0);
        const priceModifier = Number(item.customization?.priceModifier ?? 0);
        return {
          id: String(item._id ?? item.productId ?? ''),
          name: item.name ?? '',
          basePrice,
          priceModifier,
          price: basePrice + priceModifier,
          quantity: Number(item.quantity ?? 1),
          image: item.imageUrl || item.image_url || item.image || '',
          itemType: item.itemType || (item.studioDesign ? "custom_design" : "product"),
          studioDesign: item.studioDesign,
          customization: item.customization,
        };
      });
      setCartItems(normalized);
    } catch (err) {
      setError("Failed to fetch cart items.");
      console.error("Error fetching cart items:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }

    fetchCartItems();
  }, [user]);

  const updateQuantity = async (id: string, newQuantity: number) => {
    if (newQuantity < 1) return;
    try {
      const response = await apiRequest('PATCH', `/api/v1/cart/${id}`, { quantity: newQuantity });
      if (response.ok) {
        setCartItems((prevItems) =>
          prevItems.map((item) =>
            item.id === id ? { ...item, quantity: newQuantity } : item
          )
        );
      }
    } catch (error) {
      console.error('Error updating quantity:', error);
    }
  };

  const removeItem = async (id: string) => {
    try {
      const response = await apiRequest('DELETE', `/api/v1/cart/${id}`);
      if (response.ok) {
        setCartItems((prevItems) => prevItems.filter((item) => item.id !== id));
      }
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  const total = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const subtotal = total;
  const shippingThreshold = 1000;
  const estimatedShipping = subtotal >= shippingThreshold || cartItems.length === 0 ? 0 : 50;
  const estimatedTotal = subtotal + estimatedShipping;
  const totalItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const freeShippingProgress = Math.min(100, Math.round((subtotal / shippingThreshold) * 100));
  const amountForFreeShipping = Math.max(0, shippingThreshold - subtotal);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <SEO 
        title="Shopping Cart - Renu's Collections"
        description="Review your selected luxury jewelry items in your shopping cart. Complete your purchase of customized bracelets and chains."
        keywords="shopping cart, luxury jewelry cart, custom jewelry checkout, renu's collections cart"
        url="https://renucollections.com/cart"
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-16 max-w-7xl flex-grow">
        {/* Login Prompt Dialog */}
        <AlertDialog open={showLoginPrompt} onOpenChange={setShowLoginPrompt}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-playfair text-2xl text-[#342824] dark:text-foreground">
                Login Required
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[#756861] dark:text-muted-foreground">
                Please log in to access your shopping bag and proceed to checkout.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction 
                onClick={() => navigate("/login")}
                className="bg-[#B66F72] hover:bg-[#95565A] text-white"
              >
                Login
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Loading State */}
        {loading && user ? (
          <div className="space-y-8 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-9 w-48 bg-[#F1E6DF] dark:bg-muted rounded-md" />
              <div className="h-6 w-32 bg-[#F1E6DF] dark:bg-muted rounded-md" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                {[1, 2, 3].map((idx) => (
                  <div 
                    key={idx} 
                    className="h-36 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FFFFFF] dark:bg-card p-4 flex gap-4"
                  >
                    <div className="w-24 h-24 rounded-lg bg-[#F1E6DF] dark:bg-muted shrink-0" />
                    <div className="flex-1 space-y-3 py-1">
                      <div className="h-5 w-2/3 bg-[#F1E6DF] dark:bg-muted rounded" />
                      <div className="h-4 w-1/4 bg-[#F1E6DF] dark:bg-muted rounded" />
                      <div className="h-4 w-1/2 bg-[#F1E6DF] dark:bg-muted rounded" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="lg:col-span-1">
                <div className="h-80 rounded-xl border border-[#E6D8D0] dark:border-border bg-[#FBF7F3] dark:bg-card p-6" />
              </div>
            </div>
          </div>
        ) : error && user ? (
          /* Error State */
          <div className="min-h-[50vh] flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 rounded-full bg-[#F1E6DF] dark:bg-muted flex items-center justify-center text-[#B66F72] mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground mb-2">
              Unable to Load Cart
            </h2>
            <p className="text-[#756861] dark:text-muted-foreground text-sm max-w-md mb-6">
              {error}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button 
                onClick={() => fetchCartItems()}
                variant="outline"
                className="border-[#E6D8D0] dark:border-border hover:bg-[#FBF7F3] dark:hover:bg-muted text-[#342824] dark:text-foreground"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
              <Button 
                asChild 
                className="bg-[#B66F72] hover:bg-[#95565A] text-white"
              >
                <Link to="/products">Continue Shopping</Link>
              </Button>
            </div>
          </div>
        ) : cartItems.length === 0 ? (
          /* Empty Cart State */
          <div className="min-h-[55vh] flex flex-col items-center justify-center text-center px-4 py-12">
            <div className="w-20 h-20 rounded-full bg-[#FBF7F3] dark:bg-muted/50 border border-[#E6D8D0] dark:border-border flex items-center justify-center text-[#B99A72] mb-6 shadow-sm">
              <ShoppingBag className="w-10 h-10 stroke-[1.5]" />
            </div>
            <h2 className="font-playfair text-3xl font-semibold text-[#342824] dark:text-foreground mb-3">
              Your Shopping Bag is Empty
            </h2>
            <p className="text-[#756861] dark:text-muted-foreground max-w-md mb-8 text-sm sm:text-base leading-relaxed">
              Explore our boutique collection of handcrafted jewellery and timeless customized pieces.
            </p>
            <Button 
              asChild 
              className="bg-[#B66F72] hover:bg-[#95565A] text-white px-8 py-6 rounded-lg text-sm font-medium shadow-sm transition-all"
            >
              <Link to="/products">
                Discover Jewellery
              </Link>
            </Button>
          </div>
        ) : (
          /* Cart Content Grid */
          <div>
            {/* Header: Title, Count Badge & Continue Shopping link */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-semibold font-playfair text-[#342824] dark:text-foreground tracking-tight">
                  Shopping Bag
                </h1>
                <Badge 
                  variant="outline" 
                  className="bg-[#F1E6DF]/60 dark:bg-muted border-[#E6D8D0] dark:border-border text-[#756861] dark:text-foreground font-sans text-xs px-2.5 py-0.5 rounded-full"
                >
                  {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                </Badge>
              </div>

              <Link 
                to="/products" 
                className="inline-flex items-center text-sm font-medium text-[#756861] hover:text-[#95565A] dark:text-muted-foreground dark:hover:text-foreground transition-colors group"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5 transition-transform group-hover:-translate-x-0.5" />
                Continue Shopping
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Cart Items Cards */}
              <div className="lg:col-span-2 space-y-4">
                {cartItems.map((item) => (
                  <Card 
                    key={item.id}
                    className="bg-[#FFFFFF] dark:bg-card border-[#E6D8D0] dark:border-border rounded-xl shadow-xs hover:shadow-sm transition-shadow overflow-hidden"
                  >
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row items-start gap-4">
                        {/* Product Image */}
                        <img
                          src={getAssetUrl(item.image)}
                          alt={item.name}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getAssetUrl(null);
                          }}
                          className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg shrink-0 border border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3] dark:bg-muted"
                        />

                        {/* Product Details */}
                        <div className="flex-1 min-w-0 w-full">
                          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                            <div>
                              <h2 className="font-playfair font-semibold text-base sm:text-lg text-[#342824] dark:text-foreground leading-snug">
                                {item.name}
                              </h2>
                              {item.studioDesign && (
                                <Badge 
                                  variant="outline" 
                                  className="mt-1 text-[10px] uppercase font-semibold border-[#B66F72]/30 text-[#B66F72] dark:text-primary bg-[#B66F72]/5"
                                >
                                  Custom Studio Creation · {item.studioDesign.wristMm / 10} cm
                                </Badge>
                              )}
                            </div>
                            <div className="text-left sm:text-right shrink-0">
                              <span className="text-base sm:text-lg font-semibold text-[#342824] dark:text-foreground">
                                ₹{item.price.toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>

                          {/* Studio Design Breakdown */}
                          {item.studioDesign && (
                            <div className="mt-2.5 text-xs bg-[#FBF7F3] dark:bg-muted/30 p-2.5 sm:p-3 rounded-lg border border-[#E6D8D0]/70 dark:border-border/50 max-w-lg space-y-1">
                              <div className="flex items-center gap-1.5 font-medium text-[#756861] dark:text-muted-foreground uppercase text-[10px] tracking-wider">
                                <Sparkles className="w-3 h-3 text-[#B66F72]" />
                                <span>Bespoke Component Arrangement</span>
                              </div>
                              <div className="flex justify-between items-center text-[#342824] dark:text-foreground">
                                <span>Sequence Composition:</span>
                                <span className="font-medium text-[#756861] dark:text-muted-foreground">
                                  {item.studioDesign.beadSequence?.length || 0} beads
                                  {item.studioDesign.charms?.length ? ` · ${item.studioDesign.charms.length} charm(s)` : ''}
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Price modifier breakdown if customized */}
                          {item.priceModifier > 0 && (
                            <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                              Base: ₹{item.basePrice.toLocaleString('en-IN')} + Customization: ₹{item.priceModifier.toLocaleString('en-IN')}
                            </p>
                          )}

                          {/* Customization Details */}
                          {item.customization && (
                            <div className="mt-2.5 text-xs bg-[#FBF7F3] dark:bg-muted/30 p-2.5 sm:p-3 rounded-lg border border-[#E6D8D0]/70 dark:border-border/50 max-w-lg space-y-1">
                              <div className="flex items-center gap-1.5 font-medium text-[#756861] dark:text-muted-foreground uppercase text-[10px] tracking-wider">
                                <Sparkles className="w-3 h-3 text-[#B99A72]" />
                                <span>Customization Details</span>
                              </div>
                              {item.customization.breakdown && item.customization.breakdown.length > 0 ? (
                                item.customization.breakdown.map((b, bIdx) => (
                                  <div key={bIdx} className="flex justify-between items-center text-[#342824] dark:text-foreground">
                                    <span>
                                      {b.field}: <strong className="font-medium">{b.option}</strong>
                                    </span>
                                    {b.modifier ? (
                                      <span className="text-[#95565A] dark:text-rose-400 font-medium">
                                        +₹{b.modifier.toLocaleString('en-IN')}
                                      </span>
                                    ) : null}
                                  </div>
                                ))
                              ) : item.customization.selections && Object.keys(item.customization.selections).length > 0 ? (
                                Object.entries(item.customization.selections).map(([key, val]) => (
                                  <div key={key} className="text-[#342824] dark:text-foreground">
                                    <span className="capitalize text-[#756861] dark:text-muted-foreground">
                                      {key.replace(/_/g, ' ')}:
                                    </span>{' '}
                                    <strong className="font-medium">
                                      {Array.isArray(val) ? val.join(', ') : String(val)}
                                    </strong>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[#756861] dark:text-muted-foreground italic">Standard specifications</p>
                              )}
                            </div>
                          )}

                          {/* Actions: Quantity Selector & Remove Button */}
                          <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#E6D8D0]/50 dark:border-border/50">
                            {/* Quantity Controls */}
                            <div className="flex items-center border border-[#E6D8D0] dark:border-border rounded-lg bg-[#FBF7F3]/60 dark:bg-muted/40 p-0.5">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                disabled={item.quantity <= 1}
                                aria-label="Decrease quantity"
                                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-[#756861] hover:text-[#342824] hover:bg-white dark:hover:bg-card disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 sm:w-10 text-center font-medium text-sm text-[#342824] dark:text-foreground select-none">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                aria-label="Increase quantity"
                                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md text-[#756861] hover:text-[#342824] hover:bg-white dark:hover:bg-card transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Remove button */}
                            <button
                              type="button"
                              onClick={() => removeItem(item.id)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#756861] hover:text-[#B66F72] dark:text-muted-foreground dark:hover:text-rose-400 px-2 py-1.5 rounded-md hover:bg-[#F1E6DF]/50 dark:hover:bg-muted transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Right Column: Sticky Order Summary */}
              <div className="lg:col-span-1">
                <div className="lg:sticky lg:top-28">
                  <Card className="bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border rounded-xl shadow-sm overflow-hidden">
                    <CardContent className="p-6 space-y-6">
                      <div>
                        <h2 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground">
                          Order Summary
                        </h2>
                        <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                          Shipping and taxes calculated at checkout
                        </p>
                      </div>

                      {/* Free shipping eligibility bar */}
                      <div className="p-3.5 rounded-lg bg-white/80 dark:bg-muted/40 border border-[#E6D8D0]/70 dark:border-border text-xs space-y-2">
                        {subtotal >= shippingThreshold ? (
                          <div className="flex items-center gap-2 text-[#95565A] dark:text-rose-300 font-medium">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#B66F72]" />
                            <span>You have unlocked <strong>Free Shipping</strong>!</span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-[#756861] dark:text-muted-foreground">
                              <span className="flex items-center gap-1.5">
                                <Truck className="w-3.5 h-3.5 text-[#B99A72]" />
                                <span>Free shipping</span>
                              </span>
                              <span className="font-medium text-[#342824] dark:text-foreground">
                                Add ₹{amountForFreeShipping.toLocaleString('en-IN')} more
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-[#E6D8D0]/60 dark:bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-[#B66F72] transition-all duration-300 rounded-full"
                                style={{ width: `${freeShippingProgress}%` }}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Items mini breakdown */}
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
                        {cartItems.map((item) => (
                          <div key={item.id} className="flex justify-between items-center text-[#756861] dark:text-muted-foreground">
                            <span className="truncate pr-2 max-w-[190px]">
                              {item.name} <span className="text-[#342824] dark:text-foreground font-medium">× {item.quantity}</span>
                            </span>
                            <span className="font-medium text-[#342824] dark:text-foreground shrink-0">
                              ₹{(item.price * item.quantity).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>

                      <Separator className="bg-[#E6D8D0] dark:bg-border" />

                      {/* Totals Breakdown */}
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                          <span>Subtotal</span>
                          <span className="font-medium text-[#342824] dark:text-foreground">
                            ₹{subtotal.toLocaleString('en-IN')}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-[#756861] dark:text-muted-foreground">
                          <span>Estimated Shipping</span>
                          <span className="font-medium text-[#342824] dark:text-foreground">
                            {estimatedShipping === 0 ? (
                              <span className="text-[#95565A] dark:text-rose-300 font-semibold uppercase text-xs tracking-wider">
                                Free
                              </span>
                            ) : (
                              `₹${estimatedShipping.toLocaleString('en-IN')}`
                            )}
                          </span>
                        </div>

                        <Separator className="bg-[#E6D8D0] dark:bg-border" />

                        <div className="flex justify-between items-baseline pt-1">
                          <div>
                            <span className="text-base font-semibold text-[#342824] dark:text-foreground font-playfair">
                              Estimated Total
                            </span>
                            <p className="text-[11px] text-[#756861] dark:text-muted-foreground">
                              Final amount calculated at checkout
                            </p>
                          </div>
                          <span className="text-xl font-bold text-[#342824] dark:text-foreground">
                            ₹{estimatedTotal.toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Checkout button */}
                      <Button 
                        className="w-full bg-[#B66F72] hover:bg-[#95565A] text-white py-6 rounded-lg text-sm font-medium shadow-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => navigate("/checkout")}
                      >
                        <ShoppingBag className="w-4 h-4" />
                        Proceed to Checkout
                      </Button>

                      <p className="text-[11px] text-center text-[#756861] dark:text-muted-foreground">
                        Secure checkout powered by Razorpay
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
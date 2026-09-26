import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Footer from "@/components/footer";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
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

  useEffect(() => {
    if (!user) {
      setShowLoginPrompt(true);
      return;
    }

    const fetchCartItems = async () => {
      try {
        setLoading(true);
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

    fetchCartItems();
  }, [user]);

  const updateQuantity = async (id: string, newQuantity: number) => {
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

  if (loading && user) return <div className="text-center text-xl mt-10">Loading cart...</div>;
  if (error && user) return <div className="text-center text-xl mt-10 text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="Shopping Cart - Renu's Collections"
        description="Review your selected luxury jewelry items in your shopping cart. Complete your purchase of customized bracelets and chains."
        keywords="shopping cart, luxury jewelry cart, custom jewelry checkout, renu's collections cart"
        url="https://renucollections.com/cart"
      />
      {/* <Navbar /> */}
      <main className="container mx-auto px-4 py-8 pt-20">
        <h1 className="text-5xl font-bold text-center mb-12">Your Cart</h1>

        {showLoginPrompt ? (
          <AlertDialog open={showLoginPrompt} onOpenChange={setShowLoginPrompt}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Login Required</AlertDialogTitle>
                <AlertDialogDescription>
                  Please log in to access your cart.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => navigate("/login")}>
                  Login
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : cartItems.length === 0 ? (
          <div className="text-center">
            <p className="text-xl mb-4">Your cart is empty.</p>
            <Button asChild>
              <Link to="/products">Continue Shopping</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              {cartItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start border-b py-4"
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-24 h-24 object-cover rounded-md mr-4 shrink-0"
                  />
                  <div className="flex-grow">
                    <h2 className="text-xl font-semibold">{item.name}</h2>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-lg font-medium text-foreground">
                        ₹{item.price.toLocaleString()}
                      </span>
                      {item.priceModifier > 0 && (
                        <span className="text-xs text-muted-foreground">
                          (Base: ₹{item.basePrice.toLocaleString()} + Custom: ₹{item.priceModifier.toLocaleString()})
                        </span>
                      )}
                    </div>
                    {item.customization && (
                      <div className="mt-2 text-xs bg-muted/40 p-2.5 rounded-md border border-border/40 max-w-md space-y-1">
                        <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                          Customization:
                        </p>
                        {item.customization.breakdown && item.customization.breakdown.length > 0 ? (
                          item.customization.breakdown.map((b, bIdx) => (
                            <div key={bIdx} className="flex justify-between items-center text-foreground">
                              <span>{b.field}: <strong className="font-medium">{b.option}</strong></span>
                              {b.modifier ? <span className="text-primary font-semibold">+₹{b.modifier}</span> : null}
                            </div>
                          ))
                        ) : item.customization.selections ? (
                          Object.entries(item.customization.selections).map(([key, val]) => (
                            <div key={key} className="text-foreground">
                              <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>{' '}
                              <strong className="font-medium">{Array.isArray(val) ? val.join(', ') : String(val)}</strong>
                            </div>
                          ))
                        ) : null}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                    >
                      -
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateQuantity(item.id, parseInt(e.target.value))
                      }
                      className="w-16 text-center"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      +
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="lg:col-span-1">
              <div className="border p-6 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold mb-4">Order Summary</h2>
                {cartItems.map((item) => (
                  <div key={item.id} className="flex justify-between mb-2">
                    <span>
                      {item.name} (x{item.quantity})
                    </span>
                    <span>₹{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
                <div className="border-t pt-4 mt-4">
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span>₹{total.toLocaleString()}</span>
                  </div>
                  <Button 
                    className="w-full mt-6" 
                    onClick={() => navigate("/checkout")}
                  >
                    Proceed to Checkout
                  </Button>
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
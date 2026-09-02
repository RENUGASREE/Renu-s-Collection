import { useState, useEffect } from "react";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RazorpayCheckout } from "@/components/RazorpayCheckout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useNavigate } from "react-router-dom";
import { SEO } from "@/components/SEO";
import AddressManager from "@/components/AddressManager";

interface CartItem {
  _id: string;
  productId: string;
  sku: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  customization?: {
    selections: Record<string, string | string[]>;
    previewImageUrl?: string;
    priceModifier?: number;
  };
}

interface Address {
  _id: string;
  label?: string;
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

// interface OrderData {
//   shipping_address: string;
//   billing_address: string;
//   phone_number: string;
//   email: string;
//   notes?: string;
//   payment_method: string;
// }

export default function Checkout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderProcessing, setOrderProcessing] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  
  const [newAddress, setNewAddress] = useState({
    label: "",
    fullName: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "India",
    phone: "",
  });
  
  const [paymentMethod, setPaymentMethod] = useState("razorpay");
  const [orderNotes, setOrderNotes] = useState("");

  // Calculate total
  const subtotal = cartItems.reduce((sum, item) => {
    const customizationPrice = item.customization?.priceModifier || 0;
    return sum + ((item.unitPrice + customizationPrice) * item.quantity);
  }, 0);
  const shipping = subtotal >= 1000 ? 0 : 50; // Free shipping over ₹1000
  const total = subtotal + shipping;

  useEffect(() => {
    fetchCartItems();
  }, [user]);

  const fetchCartItems = async () => {
    try {
      const response = await apiRequest('GET', '/api/v1/cart');
      const data = await response.json();
      console.log('Checkout - Cart API response:', data);
      // Backend returns { success: true, data: items } where data is the items array
      const items = data.data || [];
      console.log('Checkout - Items from API:', items);
      setCartItems(items);
    } catch (error) {
      console.error('Error fetching cart items:', error);
      toast({
        title: 'Error',
        description: 'Failed to load cart items',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const createOrder = async () => {
    if (!validateForm()) {
      return null;
    }

    try {
      setOrderProcessing(true);
      
      const shippingAddress = useNewAddress ? newAddress : selectedAddress;
      if (!shippingAddress) {
        toast({
          title: 'Error',
          description: 'Please select or add a shipping address',
          variant: 'destructive',
        });
        return null;
      }

      const orderData = {
        shippingAddress: {
          fullName: shippingAddress.fullName,
          line1: shippingAddress.line1,
          line2: shippingAddress.line2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
          phone: shippingAddress.phone,
        },
        billingAddress: {
          fullName: shippingAddress.fullName,
          line1: shippingAddress.line1,
          line2: shippingAddress.line2,
          city: shippingAddress.city,
          state: shippingAddress.state,
          postalCode: shippingAddress.postalCode,
          country: shippingAddress.country,
          phone: shippingAddress.phone,
        },
        email: user?.email || '',
        phone: shippingAddress.phone,
        notes: orderNotes,
        paymentMethod: paymentMethod,
      };

      const response = await apiRequest('POST', '/api/v1/orders', orderData);
      const data = await response.json();
      
      if (data.success) {
        setCreatedOrderId(data.data._id);
        return data.data;
      } else {
        throw new Error(data.error || 'Failed to create order');
      }
    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: 'Error',
        description: 'Failed to create order',
        variant: 'destructive',
      });
      return null;
    } finally {
      setOrderProcessing(false);
    }
  };

  const validateForm = () => {
    if (!useNewAddress && !selectedAddress) {
      toast({
        title: 'Missing Address',
        description: 'Please select a shipping address',
        variant: 'destructive',
      });
      return false;
    }

    if (useNewAddress) {
      if (!newAddress.fullName || !newAddress.line1 || !newAddress.city || 
          !newAddress.state || !newAddress.postalCode || !newAddress.phone) {
        toast({
          title: 'Missing Information',
          description: 'Please fill in all address fields',
          variant: 'destructive',
        });
        return false;
      }
    }

    if (cartItems.length === 0) {
      toast({
        title: 'Empty Cart',
        description: 'Your cart is empty',
        variant: 'destructive',
      });
      return false;
    }

    return true;
  };

  const handlePlaceOrder = async () => {
    const order = await createOrder();
    if (order && paymentMethod === 'cod') {
      // COD orders are confirmed immediately
      toast({
        title: 'Order Placed',
        description: 'Your order has been placed successfully',
      });
      navigate('/order-success', { state: { order } });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Loading Checkout...</h1>
        </main>
        <Footer />
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Your cart is empty</h1>
          <Button onClick={() => navigate('/products')} className="mt-4">
            Continue Shopping
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="Checkout - Renu's Collections"
        description="Complete your purchase of luxury customized jewelry. Secure checkout process for your bracelets and chains with multiple payment options."
        keywords="checkout, secure payment, jewelry purchase, custom jewelry checkout, renu's collections payment"
        url="https://renucollections.com/checkout"
      />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-5xl font-bold text-center mb-12">Checkout</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Address Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Shipping Address</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="useSavedAddress"
                      checked={!useNewAddress}
                      onChange={() => setUseNewAddress(false)}
                    />
                    <Label htmlFor="useSavedAddress">Use saved address</Label>
                  </div>
                  
                  {!useNewAddress && (
                    <AddressManager
                      onSelectAddress={setSelectedAddress}
                      selectedAddressId={selectedAddress?._id}
                      showSelection={true}
                    />
                  )}
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="useNewAddress"
                      checked={useNewAddress}
                      onChange={() => setUseNewAddress(true)}
                    />
                    <Label htmlFor="useNewAddress">Add new address</Label>
                  </div>
                  
                  {useNewAddress && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <div>
                        <Label htmlFor="newLabel">Label (Optional)</Label>
                        <Input
                          id="newLabel"
                          placeholder="e.g., Home, Office"
                          value={newAddress.label}
                          onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="newFullName">Full Name *</Label>
                        <Input
                          id="newFullName"
                          value={newAddress.fullName}
                          onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                          required
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="newLine1">Address Line 1 *</Label>
                        <Input
                          id="newLine1"
                          value={newAddress.line1}
                          onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                          required
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label htmlFor="newLine2">Address Line 2 (Optional)</Label>
                        <Input
                          id="newLine2"
                          value={newAddress.line2}
                          onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="newCity">City *</Label>
                        <Input
                          id="newCity"
                          value={newAddress.city}
                          onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="newState">State *</Label>
                        <Input
                          id="newState"
                          value={newAddress.state}
                          onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="newPostalCode">PIN Code *</Label>
                        <Input
                          id="newPostalCode"
                          pattern="[0-9]{6}"
                          placeholder="6 digits"
                          value={newAddress.postalCode}
                          onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="newCountry">Country *</Label>
                        <Input
                          id="newCountry"
                          value={newAddress.country}
                          onChange={(e) => setNewAddress({ ...newAddress, country: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <Label htmlFor="newPhone">Phone *</Label>
                        <Input
                          id="newPhone"
                          type="tel"
                          placeholder="10 digits"
                          value={newAddress.phone}
                          onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Payment Method */}
            <Card>
              <CardHeader>
                <CardTitle>Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={setPaymentMethod}
                  className="space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="razorpay" id="razorpay" />
                    <Label htmlFor="razorpay">Razorpay (Credit/Debit Card, UPI, Net Banking)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cod" id="cod" />
                    <Label htmlFor="cod">Cash on Delivery</Label>
                  </div>
                </RadioGroup>
                
                {paymentMethod === 'razorpay' && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      🔒 Secure payment powered by Razorpay. We accept all major credit/debit cards, UPI, and net banking.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Notes */}
            <Card>
              <CardHeader>
                <CardTitle>Order Notes (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Any special instructions for your order..."
                  rows={3}
                />
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
                <div className="space-y-4">
                  {cartItems.map((item) => {
                    const customizationPrice = item.customization?.priceModifier || 0;
                    const itemTotal = (item.unitPrice + customizationPrice) * item.quantity;
                    return (
                      <div key={item._id} className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium">{item.name}</p>
                            <p className="text-sm text-muted-foreground">
                              Qty: {item.quantity} × ₹{item.unitPrice.toFixed(2)}
                            </p>
                            {item.customization && (
                              <div className="mt-1 text-sm">
                                <p className="text-muted-foreground">Customization:</p>
                                <ul className="text-xs text-muted-foreground ml-4">
                                  {Object.entries(item.customization.selections).map(([key, value]) => (
                                    <li key={key}>{key}: {Array.isArray(value) ? value.join(', ') : value}</li>
                                  ))}
                                </ul>
                                {customizationPrice > 0 && (
                                  <p className="text-xs text-primary">+ ₹{customizationPrice.toFixed(2)}</p>
                                )}
                              </div>
                            )}
                          </div>
                          <span className="font-medium">₹{itemTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                  
                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>₹{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Shipping:</span>
                      <span>{shipping === 0 ? 'Free' : `₹${shipping.toFixed(2)}`}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold">
                      <span>Total:</span>
                      <span>₹{total.toFixed(2)}</span>
                    </div>
                  </div>

                  {paymentMethod === 'razorpay' && createdOrderId ? (
                    <RazorpayCheckout
                      orderId={createdOrderId}
                      amount={total}
                      onSuccess={(response) => {
                        toast({
                          title: 'Order Placed Successfully',
                          description: 'Your order has been placed and payment received',
                        });
                        navigate('/order-success', { state: { orderId: createdOrderId } });
                      }}
                      onFailure={(_error) => {
                        toast({
                          title: 'Payment Failed',
                          description: 'Payment failed. Please try again.',
                          variant: 'destructive',
                        });
                      }}
                    />
                  ) : (
                    <Button
                      onClick={handlePlaceOrder}
                      disabled={orderProcessing}
                      className="w-full"
                    >
                      {orderProcessing ? 'Processing...' : `Place Order (${paymentMethod === 'cod' ? 'Cash on Delivery' : 'Pay with Razorpay'})`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}

import { useState, useEffect } from "react";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { RazorpayCheckout } from "@/components/RazorpayCheckout";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getAssetUrl } from "@/lib/queryClient";
import { useNavigate, Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import AddressManager from "@/components/AddressManager";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ShieldCheck, 
  MapPin, 
  CreditCard, 
  Banknote, 
  Sparkles, 
  ShoppingBag, 
  Truck, 
  Lock, 
  ArrowLeft,
  Package,
  Info
} from "lucide-react";

interface CartItem {
  _id: string;
  productId?: string;
  itemType?: "product" | "custom_design";
  sku: string;
  name: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  studioDesign?: {
    savedDesignId?: string;
    name?: string;
    jewelleryType: string;
    constructionType: string;
    wristMm: number;
    beadSequence?: any[];
    charms?: any[];
    breakdown?: any;
  };
  customization?: {
    selections: Record<string, string | string[]>;
    previewImageUrl?: string;
    priceModifier?: number;
    breakdown?: { field: string; option: string; modifier?: number }[];
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
  const [priceChangeMessage, setPriceChangeMessage] = useState<string | null>(null);
  const [showPriceChangeDialog, setShowPriceChangeDialog] = useState(false);
  const generateAttemptKey = () => `chk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const [checkoutIdempotencyKey, setCheckoutIdempotencyKey] = useState<string>(generateAttemptKey);

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
      const items = data.data || [];
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

  const createOrder = async (options?: { confirmPriceChanges?: boolean; expectedTotal?: number }) => {
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

      const shippingAddressObj = {
        fullName: shippingAddress.fullName,
        line1: shippingAddress.line1,
        line2: shippingAddress.line2 || '',
        city: shippingAddress.city,
        state: shippingAddress.state,
        postalCode: shippingAddress.postalCode,
        country: shippingAddress.country || 'India',
        phone: shippingAddress.phone,
      };

      const orderData = {
        shippingAddress: shippingAddressObj,
        billingAddress: shippingAddressObj,
        email: user?.email || '',
        phone: shippingAddress.phone,
        notes: orderNotes,
        paymentMethod: paymentMethod,
        confirmPriceChanges: options?.confirmPriceChanges ?? false,
        expectedTotal: options?.expectedTotal,
        idempotencyKey: checkoutIdempotencyKey,
      };

      const response = await apiRequest('POST', '/api/v1/orders', orderData);
      const data = await response.json();
      
      if (data.success) {
        setCreatedOrderId(data.data._id);
        setShowPriceChangeDialog(false);
        setPriceChangeMessage(null);
        return data.data;
      } else {
        throw new Error(data.message || data.error || 'Failed to create order');
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      const rawMessage = error.message || '';
      const isPriceChange = rawMessage.includes('409') || rawMessage.toLowerCase().includes('price for') || rawMessage.toLowerCase().includes('rates');
      const cleanMessage = rawMessage.replace(/^\d+:\s*/, '');

      // Synchronize cart items to display current prices & total in UI
      await fetchCartItems();

      if (isPriceChange) {
        setPriceChangeMessage(cleanMessage);
        setShowPriceChangeDialog(true);
      } else {
        toast({
          title: 'Order Placement Notice',
          description: cleanMessage || 'Failed to create order. Please verify your address and try again.',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setOrderProcessing(false);
    }
  };

  const handleConfirmPriceChange = async () => {
    setShowPriceChangeDialog(false);
    const order = await createOrder({ confirmPriceChanges: true, expectedTotal: total });
    if (order && paymentMethod === 'cod') {
      toast({
        title: 'Order Placed',
        description: 'Your order has been placed successfully with updated pricing.',
      });
      navigate('/order-success', { state: { order } });
    }
  };

  const isTamilNaduState = (state?: string) => {
    if (!state) return false;
    const normalized = state.trim().toLowerCase().replace(/[\s\-_.]/g, "");
    return normalized === "tamilnadu" || normalized === "tn";
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

    if (!useNewAddress && selectedAddress) {
      if (!isTamilNaduState(selectedAddress.state)) {
        toast({
          title: 'Delivery Unavailable',
          description: 'Delivery is currently available only within Tamil Nadu. Please select or add an address in Tamil Nadu.',
          variant: 'destructive',
        });
        return false;
      }
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

      if (!isTamilNaduState(newAddress.state)) {
        toast({
          title: 'Delivery Restricted',
          description: 'We currently deliver exclusively within Tamil Nadu. Please provide an address located in Tamil Nadu.',
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
      toast({
        title: 'Order Placed',
        description: 'Your order has been placed successfully',
      });
      navigate('/order-success', { state: { order } });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-lg">
          <div className="h-12 w-12 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-4" />
          <h1 className="font-playfair text-2xl text-[#342824] dark:text-foreground">Preparing Secure Checkout...</h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mt-2">Loading your boutique shopping bag and delivery details.</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-[#B66F72]/10 dark:bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="w-8 h-8 text-[#B66F72] dark:text-primary" />
          </div>
          <h1 className="font-playfair text-3xl font-semibold text-[#342824] dark:text-foreground mb-3">Your shopping bag is empty</h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mb-6">Explore our handcrafted jewelry collection and add your favorite pieces.</p>
          <Button onClick={() => navigate('/products')} className="bg-[#B66F72] hover:bg-[#95565A] text-white">
            Discover Collection
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO 
        title="Boutique Checkout - Renu's Collections"
        description="Complete your order for exquisite handcrafted customized jewelry with secure payment and insured Tamil Nadu delivery."
        keywords="checkout, luxury jewelry, secure payment, renu's collections checkout"
        url="https://renucollections.com/checkout"
      />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-7xl">
        {/* Navigation Breadcrumb / Header */}
        <div className="mb-8">
          <Link 
            to="/cart" 
            className="inline-flex items-center text-xs font-medium text-[#756861] dark:text-muted-foreground hover:text-[#B66F72] dark:hover:text-primary transition-colors mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Return to Shopping Bag
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 border-b border-[#E6D8D0] dark:border-border/60 pb-4">
            <div>
              <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground">
                Checkout
              </h1>
              <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
                Finalize your order details and delivery preferences.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#756861] dark:text-muted-foreground bg-white dark:bg-card px-3 py-1.5 rounded-full border border-[#E6D8D0] dark:border-border shadow-xs">
              <Lock className="w-3.5 h-3.5 text-[#B99A72]" />
              <span>256-Bit Encrypted Secure Checkout</span>
            </div>
          </div>
        </div>

        {/* Tamil Nadu Exclusive Delivery Banner */}
        <div className="mb-8 p-4 rounded-xl border border-[#B99A72]/30 bg-white/80 dark:bg-card/80 backdrop-blur-xs flex items-start gap-3.5 shadow-xs">
          <div className="p-2 rounded-lg bg-[#B99A72]/15 text-[#B99A72] shrink-0 mt-0.5">
            <MapPin className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-playfair font-semibold text-sm text-[#342824] dark:text-foreground">
                Handcrafted Delivery Exclusive to Tamil Nadu
              </h3>
              <span className="text-[10px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-[#B99A72]/15 text-[#95565A] dark:text-[#B99A72]">
                State-Only Fulfillment
              </span>
            </div>
            <p className="text-xs text-[#756861] dark:text-muted-foreground mt-1 leading-relaxed">
              To preserve artisanal packaging and personalized jewelry integrity, Renu's Collections currently fulfills orders exclusively to delivery addresses in <strong>Tamil Nadu</strong>. Standard shipping is ₹50 below ₹1,000, and complimentary for orders ₹1,000 and above.
            </p>
          </div>
        </div>

        {/* Two-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Customer Info, Addresses, Payments (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Step 1: Shipping Address */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#B66F72] text-white text-xs font-semibold">
                    1
                  </span>
                  <h2 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                    Delivery Address
                  </h2>
                </div>
                <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">
                  Tamil Nadu Addresses Only
                </span>
              </div>

              <CardContent className="p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-6 pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                    <input
                      type="radio"
                      name="addressMode"
                      className="accent-[#B66F72] w-4 h-4 cursor-pointer"
                      checked={!useNewAddress}
                      onChange={() => setUseNewAddress(false)}
                    />
                    <span>Select Saved Address</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium">
                    <input
                      type="radio"
                      name="addressMode"
                      className="accent-[#B66F72] w-4 h-4 cursor-pointer"
                      checked={useNewAddress}
                      onChange={() => setUseNewAddress(true)}
                    />
                    <span>Add New Address</span>
                  </label>
                </div>

                {!useNewAddress ? (
                  <div className="pt-1">
                    <AddressManager
                      onSelectAddress={setSelectedAddress}
                      selectedAddressId={selectedAddress?._id}
                      showSelection={true}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E6D8D0]/60 dark:border-border/60">
                    <div className="sm:col-span-2">
                      <Label htmlFor="newFullName" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Full Name *</Label>
                      <Input
                        id="newFullName"
                        placeholder="Recipient full name"
                        value={newAddress.fullName}
                        onChange={(e) => setNewAddress({ ...newAddress, fullName: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newPhone" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Contact Phone *</Label>
                      <Input
                        id="newPhone"
                        type="tel"
                        placeholder="10-digit mobile number"
                        value={newAddress.phone}
                        onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newLabel" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Address Label (Optional)</Label>
                      <Input
                        id="newLabel"
                        placeholder="e.g., Home, Studio, Office"
                        value={newAddress.label}
                        onChange={(e) => setNewAddress({ ...newAddress, label: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="newLine1" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Address Line 1 *</Label>
                      <Input
                        id="newLine1"
                        placeholder="Door / Flat No., Building, Street"
                        value={newAddress.line1}
                        onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor="newLine2" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Address Line 2 (Optional)</Label>
                      <Input
                        id="newLine2"
                        placeholder="Area, Landmark"
                        value={newAddress.line2}
                        onChange={(e) => setNewAddress({ ...newAddress, line2: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="newCity" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">City / Town *</Label>
                      <Input
                        id="newCity"
                        placeholder="e.g., Chennai, Coimbatore, Madurai"
                        value={newAddress.city}
                        onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newState" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">State * (Tamil Nadu only)</Label>
                      <Input
                        id="newState"
                        placeholder="Tamil Nadu"
                        value={newAddress.state}
                        onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newPostalCode" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">PIN Code *</Label>
                      <Input
                        id="newPostalCode"
                        pattern="[0-9]{6}"
                        placeholder="6 digits (e.g. 600001)"
                        value={newAddress.postalCode}
                        onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="newCountry" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Country</Label>
                      <Input
                        id="newCountry"
                        value={newAddress.country}
                        disabled
                        className="mt-1 bg-muted/30 border-[#E6D8D0] dark:border-border text-muted-foreground"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 2: Payment Method */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#B66F72] text-white text-xs font-semibold">
                    2
                  </span>
                  <h2 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                    Payment Method
                  </h2>
                </div>
                <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">
                  Authoritative Pricing
                </span>
              </div>

              <CardContent className="p-5 sm:p-6">
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(val) => {
                    setPaymentMethod(val);
                    setCheckoutIdempotencyKey(generateAttemptKey());
                  }}
                  className="space-y-3"
                >
                  {/* Razorpay Option */}
                  <label 
                    htmlFor="pay-razorpay" 
                    className={`flex items-start justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                      paymentMethod === 'razorpay'
                        ? 'border-[#B66F72] bg-[#F1E6DF]/30 dark:bg-primary/5 shadow-xs'
                        : 'border-[#E6D8D0] dark:border-border hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="razorpay" id="pay-razorpay" className="mt-1" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-[#342824] dark:text-foreground">
                            Online Payment (Razorpay)
                          </p>
                          <span className="text-[10px] bg-[#B99A72]/15 text-[#95565A] dark:text-[#B99A72] font-semibold px-2 py-0.5 rounded-full">
                            Recommended
                          </span>
                        </div>
                        <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                          Cards, UPI (Google Pay, PhonePe, Paytm), and Net Banking via secure gateway.
                        </p>
                      </div>
                    </div>
                    <CreditCard className="w-5 h-5 text-[#B99A72] shrink-0 mt-0.5" />
                  </label>

                  {/* Cash on Delivery Option */}
                  <label 
                    htmlFor="pay-cod" 
                    className={`flex items-start justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                      paymentMethod === 'cod'
                        ? 'border-[#B66F72] bg-[#F1E6DF]/30 dark:bg-primary/5 shadow-xs'
                        : 'border-[#E6D8D0] dark:border-border hover:bg-muted/20'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <RadioGroupItem value="cod" id="pay-cod" className="mt-1" />
                      <div>
                        <p className="font-medium text-sm text-[#342824] dark:text-foreground">
                          Cash on Delivery (COD)
                        </p>
                        <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                          Pay upon delivery at your doorstep within Tamil Nadu.
                        </p>
                      </div>
                    </div>
                    <Banknote className="w-5 h-5 text-[#B99A72] shrink-0 mt-0.5" />
                  </label>
                </RadioGroup>

                {paymentMethod === 'razorpay' && (
                  <div className="mt-4 p-3.5 rounded-lg bg-[#FBF7F3] dark:bg-muted/30 border border-[#E6D8D0]/60 dark:border-border/60 flex items-center gap-2.5 text-xs text-[#756861] dark:text-muted-foreground">
                    <ShieldCheck className="w-4 h-4 text-[#B99A72] shrink-0" />
                    <span>Your transaction is verified on the server and encrypted via Razorpay's trusted infrastructure.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Step 3: Order Notes */}
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center gap-2.5">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#B99A72] text-white text-xs font-semibold">
                  3
                </span>
                <h2 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                  Order Notes & Instructions (Optional)
                </h2>
              </div>
              <CardContent className="p-5 sm:p-6">
                <Textarea
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Special delivery notes, gifting instructions, or timing preferences..."
                  rows={2}
                  className="border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72] text-sm resize-none"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Order Summary (5 cols - sticky) */}
          <div className="lg:col-span-5 lg:sticky lg:top-28 space-y-4">
            <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-sm rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-[#B66F72]" />
                  <h2 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                    Order Summary
                  </h2>
                </div>
                <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">
                  {cartItems.length} {cartItems.length === 1 ? 'item' : 'items'}
                </span>
              </div>

              <CardContent className="p-5 sm:p-6 space-y-4">
                {/* Product List */}
                <div className="space-y-3.5 max-h-[340px] overflow-y-auto pr-1">
                  {cartItems.map((item) => {
                    const customizationPrice = item.customization?.priceModifier || 0;
                    const itemUnitTotal = item.unitPrice + customizationPrice;
                    const itemTotal = itemUnitTotal * item.quantity;
                    const fallbackImg = '/logo.png';
                    const displayImg = item.imageUrl ? getAssetUrl(item.imageUrl) : fallbackImg;

                    return (
                      <div key={item._id} className="flex items-start gap-3 py-2 border-b border-[#E6D8D0]/40 dark:border-border/40 last:border-b-0">
                        <img
                          src={displayImg}
                          alt={item.name}
                          className="w-14 h-14 rounded-lg object-cover border border-[#E6D8D0]/80 dark:border-border bg-muted/20 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = fallbackImg;
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-playfair font-semibold text-sm text-[#342824] dark:text-foreground truncate">
                            {item.name}
                          </p>
                          <p className="text-xs text-[#756861] dark:text-muted-foreground mt-0.5">
                            Qty: {item.quantity} × ₹{itemUnitTotal.toLocaleString('en-IN')}
                          </p>

                          {/* Customization Details */}
                          {item.customization?.breakdown && item.customization.breakdown.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {item.customization.breakdown.map((b, idx) => (
                                <span 
                                  key={idx} 
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
                          ) : (
                            <span className="text-[10px] text-[#756861] dark:text-muted-foreground italic">Standard Design</span>
                          )}
                        </div>
                        <span className="font-semibold text-sm text-[#342824] dark:text-foreground shrink-0">
                          ₹{itemTotal.toLocaleString('en-IN')}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Pricing Breakdown */}
                <div className="border-t border-[#E6D8D0] dark:border-border pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-[#756861] dark:text-muted-foreground">
                    <span>Merchandise Subtotal</span>
                    <span className="font-medium text-[#342824] dark:text-foreground">₹{subtotal.toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between items-center text-[#756861] dark:text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span>Delivery Fee</span>
                      {shipping === 0 && (
                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded">
                          Free
                        </span>
                      )}
                    </span>
                    <span className="font-medium text-[#342824] dark:text-foreground">
                      {shipping === 0 ? '₹0' : `₹${shipping}`}
                    </span>
                  </div>

                  {shipping > 0 && (
                    <div className="p-2 rounded bg-[#F1E6DF]/40 dark:bg-muted/40 border border-[#E6D8D0]/60 dark:border-border/60 text-[11px] text-[#756861] dark:text-muted-foreground flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-[#B99A72] shrink-0" />
                      <span>Add ₹{(1000 - subtotal).toLocaleString('en-IN')} more to unlock free shipping in Tamil Nadu.</span>
                    </div>
                  )}

                  <div className="border-t border-[#E6D8D0] dark:border-border pt-3 flex justify-between items-baseline">
                    <div>
                      <span className="font-playfair text-base font-semibold text-[#342824] dark:text-foreground">Final Payable Amount</span>
                      <p className="text-[11px] text-[#756861] dark:text-muted-foreground">Inclusive of handcrafted boutique packaging</p>
                    </div>
                    <span className="font-playfair text-2xl font-bold text-[#B66F72] dark:text-primary">
                      ₹{total.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Primary Action Button */}
                <div className="pt-2">
                  {paymentMethod === 'razorpay' && createdOrderId ? (
                    <RazorpayCheckout
                      orderId={createdOrderId}
                      amount={total}
                      onSuccess={(response) => {
                        toast({
                          title: 'Order Placed Successfully',
                          description: 'Your order has been placed and payment confirmed.',
                        });
                        navigate('/order-success', { state: { orderId: createdOrderId } });
                      }}
                      onFailure={(_error) => {
                        toast({
                          title: 'Payment Incomplete',
                          description: 'Payment was not completed. You can re-attempt payment.',
                          variant: 'destructive',
                        });
                      }}
                    />
                  ) : (
                    <Button
                      onClick={handlePlaceOrder}
                      disabled={orderProcessing}
                      className="w-full bg-[#B66F72] hover:bg-[#95565A] text-white py-6 text-base font-medium rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                    >
                      {orderProcessing ? (
                        <>
                          <div className="h-4 w-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                          <span>Processing Order...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-white/90" />
                          <span>
                            {paymentMethod === 'cod' 
                              ? `Confirm Cash on Delivery (₹${total.toLocaleString('en-IN')})` 
                              : `Proceed to Pay ₹${total.toLocaleString('en-IN')}`}
                          </span>
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {/* Guarantee assurance */}
                <div className="pt-2 text-center text-[11px] text-[#756861] dark:text-muted-foreground flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#B99A72]" />
                  <span>Artisanal guarantee • Hand-inspected before dispatch</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Price Update Confirmation Dialog */}
      <AlertDialog open={showPriceChangeDialog} onOpenChange={setShowPriceChangeDialog}>
        <AlertDialogContent className="bg-[#FBF7F3] dark:bg-card border-[#E6D8D0] dark:border-border max-w-md">
          <AlertDialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <AlertDialogTitle className="font-playfair text-xl text-center text-[#342824] dark:text-foreground">
              Updated Design Pricing
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-[#756861] dark:text-muted-foreground text-center pt-1">
              {priceChangeMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-2 p-3 rounded-lg bg-white dark:bg-background border border-[#E6D8D0] dark:border-border text-xs text-[#756861] dark:text-muted-foreground space-y-1">
            <div className="flex justify-between font-semibold text-sm text-[#342824] dark:text-foreground">
              <span>Updated Total Payable:</span>
              <span className="text-[#B66F72] dark:text-primary font-bold">₹{total.toLocaleString('en-IN')}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Material and gemstone prices are calculated based on live rates. Would you like to confirm and place your order with this updated total?
            </p>
          </div>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel
              disabled={orderProcessing}
              onClick={() => setShowPriceChangeDialog(false)}
              className="border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground"
            >
              Review Shopping Bag
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={orderProcessing}
              onClick={handleConfirmPriceChange}
              className="bg-[#B66F72] hover:bg-[#95565A] text-white"
            >
              Confirm & Place Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}

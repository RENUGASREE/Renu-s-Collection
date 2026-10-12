import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useNavigate, Link } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import Footer from '@/components/footer';
import { 
  User, 
  Package, 
  KeyRound, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  ChevronRight, 
  ShoppingBag,
  Sparkles,
  ShieldCheck,
  Edit3,
  Eye,
  EyeOff
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
  notes?: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: string;
  isEmailVerified: boolean;
  createdAt: string;
}

const AccountPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'password'>('profile');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', firstName: '', lastName: '', phone: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchOrders();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const response = await apiRequest('GET', '/api/v1/users/me');
      const data = await response.json();
      setProfile(data.data);
      setEditForm({
        username: data.data.username || '',
        firstName: data.data.firstName || '',
        lastName: data.data.lastName || '',
        phone: data.data.phone || '',
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profile details',
        variant: 'destructive',
      });
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await apiRequest('GET', '/api/v1/orders');
      const data = await response.json();
      setOrders(data.data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load order history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to cancel this order?')) return;

    try {
      await apiRequest('POST', `/api/v1/orders/${orderId}/cancel`);
      toast({
        title: 'Order Cancelled',
        description: 'Your order has been cancelled successfully',
      });
      fetchOrders();
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({
        title: 'Error',
        description: 'Failed to cancel order',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('PATCH', '/api/v1/users/me', editForm);
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been updated successfully',
      });
      setEditMode(false);
      fetchProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive',
      });
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordForm.currentPassword) {
      toast({
        title: 'Missing Current Password',
        description: 'Please enter your current password.',
        variant: 'destructive',
      });
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast({
        title: 'Password Too Short',
        description: 'New password must be at least 8 characters long.',
        variant: 'destructive',
      });
      return;
    }
    if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword)) {
      toast({
        title: 'Password Complexity Required',
        description: 'New password must contain both letters and numbers.',
        variant: 'destructive',
      });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: 'Password Mismatch',
        description: 'New password and confirmation password do not match.',
        variant: 'destructive',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await apiRequest('POST', '/api/v1/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: 'Password Updated',
          description: 'Your account password has been updated successfully.',
        });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const errorMsg = data.errors
          ? Object.values(data.errors).flat().join(', ')
          : data.message || data.error || 'Failed to update password. Please check your current password.';
        throw new Error(errorMsg);
      }
    } catch (error: any) {
      console.error('Error changing password:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to change password. Please verify your current password.',
        variant: 'destructive',
      });
    } finally {
      setIsChangingPassword(false);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-lg">
          <div className="h-10 w-10 rounded-full border-2 border-[#B66F72] border-t-transparent animate-spin mx-auto mb-4" />
          <h1 className="font-playfair text-2xl text-[#342824] dark:text-foreground">Loading Your Account...</h1>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FBF7F3] dark:bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-16 pt-28 text-center max-w-md">
          <h1 className="font-playfair text-2xl font-semibold text-[#342824] dark:text-foreground mb-4">Please Log In</h1>
          <p className="text-sm text-[#756861] dark:text-muted-foreground mb-6">Log in to view your orders and personal profile.</p>
          <Button onClick={() => navigate('/login')} className="bg-[#B66F72] hover:bg-[#95565A] text-white">
            Go to Login
          </Button>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F3] dark:bg-background text-[#342824] dark:text-foreground">
      <SEO 
        title="My Account - Renu's Collections"
        description="Manage your boutique jewelry account, personal profile and order history."
        keywords="my account, profile, jewelry orders, renu's collections"
        url="https://renucollections.com/account"
      />

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-10 pt-28 max-w-5xl">
        {/* Account Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3 border-b border-[#E6D8D0] dark:border-border/60 pb-6 mb-8">
          <div>
            <h1 className="font-playfair text-3xl sm:text-4xl font-semibold tracking-tight text-[#342824] dark:text-foreground">
              My Account
            </h1>
            <p className="text-xs sm:text-sm text-[#756861] dark:text-muted-foreground mt-1">
              Welcome back, {profile?.firstName || profile?.username || 'Client'}.
            </p>
          </div>
          <div className="text-xs text-[#756861] dark:text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[#B99A72]" />
            <span>Verified Customer Profile</span>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex space-x-2 mb-8 p-1.5 bg-white dark:bg-card border border-[#E6D8D0] dark:border-border rounded-xl shadow-xs overflow-x-auto">
          <Button
            variant="ghost"
            onClick={() => setActiveTab('profile')}
            className={`flex-1 min-w-[130px] rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'profile'
                ? 'bg-[#B66F72] text-white hover:bg-[#95565A] hover:text-white shadow-xs'
                : 'text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50 dark:hover:bg-muted'
            }`}
          >
            <User className="w-4 h-4 mr-1.5" />
            <span>Personal Profile</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => setActiveTab('orders')}
            className={`flex-1 min-w-[130px] rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'orders'
                ? 'bg-[#B66F72] text-white hover:bg-[#95565A] hover:text-white shadow-xs'
                : 'text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50 dark:hover:bg-muted'
            }`}
          >
            <Package className="w-4 h-4 mr-1.5" />
            <span>Order History ({orders.length})</span>
          </Button>

          <Button
            variant="ghost"
            onClick={() => setActiveTab('password')}
            className={`flex-1 min-w-[130px] rounded-lg text-xs sm:text-sm font-medium transition-all ${
              activeTab === 'password'
                ? 'bg-[#B66F72] text-white hover:bg-[#95565A] hover:text-white shadow-xs'
                : 'text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/50 dark:hover:bg-muted'
            }`}
          >
            <KeyRound className="w-4 h-4 mr-1.5" />
            <span>Security</span>
          </Button>
        </div>

        {/* Tab 1: Profile */}
        {activeTab === 'profile' && (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20 flex items-center justify-between">
              <h2 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                Profile Information
              </h2>
              {!editMode && (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => setEditMode(true)}
                  className="border-[#E6D8D0] dark:border-border text-[#756861] dark:text-muted-foreground hover:bg-[#F1E6DF]/40 text-xs rounded-lg flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Details</span>
                </Button>
              )}
            </div>

            <CardContent className="p-6">
              {editMode ? (
                <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-lg">
                  <div>
                    <Label htmlFor="username" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Username</Label>
                    <Input
                      id="username"
                      value={editForm.username}
                      onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                      className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">First Name</Label>
                      <Input
                        id="firstName"
                        value={editForm.firstName}
                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Last Name</Label>
                      <Input
                        id="lastName"
                        value={editForm.lastName}
                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                        className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Phone Number</Label>
                    <Input
                      id="phone"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="mt-1 border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72]"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-lg">
                      Save Changes
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setEditMode(false)}
                      className="border-[#E6D8D0] dark:border-border text-xs rounded-lg"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
                  <div>
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Username</span>
                    <p className="font-semibold text-[#342824] dark:text-foreground mt-0.5">{profile?.username || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Email Address</span>
                    <p className="font-semibold text-[#342824] dark:text-foreground mt-0.5">{profile?.email || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Full Name</span>
                    <p className="font-semibold text-[#342824] dark:text-foreground mt-0.5">
                      {[profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || 'Not specified'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Contact Phone</span>
                    <p className="font-semibold text-[#342824] dark:text-foreground mt-0.5">{profile?.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Account Role</span>
                    <p className="font-semibold text-[#342824] dark:text-foreground capitalize mt-0.5">{profile?.role || 'Customer'}</p>
                  </div>
                  <div>
                    <span className="text-xs text-[#756861] dark:text-muted-foreground font-medium">Client Since</span>
                    <p className="font-semibold text-[#342824] dark:text-foreground mt-0.5">
                      {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'N/A'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Tab 2: Orders */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            {orders.length === 0 ? (
              <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl p-8 text-center">
                <Package className="w-12 h-12 text-[#B66F72] mx-auto mb-3 opacity-60" />
                <h3 className="font-playfair text-xl font-semibold text-[#342824] dark:text-foreground mb-1">No Orders in History</h3>
                <p className="text-xs text-[#756861] dark:text-muted-foreground mb-4">Start your personalized jewelry collection today.</p>
                <Button asChild className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-xl">
                  <Link to="/products">Explore Boutique</Link>
                </Button>
              </Card>
            ) : (
              orders.map((order) => {
                const formattedDate = new Date(order.createdAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                });

                return (
                  <Card 
                    key={order._id}
                    className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden"
                  >
                    <div className="px-5 py-3.5 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/40 dark:bg-muted/10 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-[#756861] dark:text-muted-foreground tracking-wider">Order</span>
                        <p className="font-playfair font-bold text-base text-[#342824] dark:text-foreground">
                          #{order.orderNumber}
                        </p>
                        <span className="text-[11px] text-[#756861] dark:text-muted-foreground">
                          Placed {formattedDate}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${getOrderStatusBadge(order.status)}`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border bg-stone-100 text-[#756861] dark:bg-muted dark:text-muted-foreground border-stone-200 dark:border-border">
                          {order.paymentMethod === 'cod' ? 'COD' : 'Paid'}: {order.paymentStatus}
                        </span>
                      </div>
                    </div>

                    <CardContent className="p-5 space-y-3">
                      {/* Items */}
                      <div className="space-y-1.5 text-xs">
                        {order.items.map((item, idx) => (
                          <div key={`${order._id}-${idx}`} className="flex justify-between text-[#756861] dark:text-muted-foreground">
                            <span>{item.name} <strong className="text-[#342824] dark:text-foreground">× {item.quantity}</strong></span>
                            <span className="font-medium text-[#342824] dark:text-foreground">₹{(item.subtotal || item.unitPrice * item.quantity).toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                      </div>

                      {/* Footer & Total */}
                      <div className="border-t border-[#E6D8D0]/60 dark:border-border/60 pt-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] text-[#756861] dark:text-muted-foreground">Total:</span>{' '}
                          <span className="font-playfair text-base font-bold text-[#B66F72] dark:text-primary">
                            ₹{order.total.toLocaleString('en-IN')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {order.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => cancelOrder(order._id)}
                              className="text-xs border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 rounded-lg h-8"
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            asChild
                            size="sm"
                            className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-lg h-8 px-3"
                          >
                            <Link to={`/orders/${order._id}`}>
                              <span>View Details</span>
                              <ChevronRight className="w-3.5 h-3.5 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Tab 3: Security / Password */}
        {activeTab === 'password' && (
          <Card className="border border-[#E6D8D0] dark:border-border bg-white dark:bg-card shadow-xs rounded-xl overflow-hidden max-w-lg">
            <div className="px-6 py-4 border-b border-[#E6D8D0]/60 dark:border-border/60 bg-[#FBF7F3]/60 dark:bg-muted/20">
              <h2 className="font-playfair text-lg font-semibold text-[#342824] dark:text-foreground">
                Update Account Password
              </h2>
            </div>
            <CardContent className="p-6">
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Current Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72] pr-10"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                      aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="newPassword" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      className="border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72] pr-10"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                      aria-label={showNewPassword ? "Hide new password" : "Show new password"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Must be at least 8 characters and contain letters and numbers.
                  </p>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="text-xs font-semibold text-[#756861] dark:text-muted-foreground">Confirm New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      className="border-[#E6D8D0] dark:border-border focus-visible:ring-[#B66F72] pr-10"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                      aria-label={showConfirmPassword ? "Hide confirm new password" : "Show confirm new password"}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isChangingPassword}
                  className="bg-[#B66F72] hover:bg-[#95565A] text-white text-xs rounded-lg mt-2 min-w-[130px]"
                >
                  {isChangingPassword ? "Updating..." : "Update Password"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default AccountPage;

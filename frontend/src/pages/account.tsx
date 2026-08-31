import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { SEO } from '@/components/SEO';

interface OrderItem {
  id: number;
  product_type: string;
  product_id: number;
  quantity: number;
  price: number;
  product?: {
    name: string;
    image?: string;
  };
}

interface Order {
  id: string;
  order_number: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'completed' | 'failed';
  total_amount: number;
  shipping_address: string;
  billing_address: string;
  phone_number: string;
  email: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  payment_method: string;
  transaction_id?: string;
  items: OrderItem[];
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
        description: 'Failed to load profile',
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
        description: 'Failed to load orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
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
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({
        title: 'Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }
    try {
      await apiRequest('POST', '/api/v1/users/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast({
        title: 'Password Changed',
        description: 'Your password has been updated successfully',
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Error changing password:', error);
      toast({
        title: 'Error',
        description: 'Failed to change password',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'delivered':
        return 'default';
      case 'shipped':
        return 'default';
      case 'confirmed':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'cancelled':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getPaymentStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Loading Account...</h1>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <main className="flex-grow container mx-auto px-4 py-8 text-center">
          <h1 className="text-4xl font-bold mb-4">Please Login</h1>
          <Button onClick={() => navigate('/login')} className="mt-4">
            Login
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO 
        title="My Account - Renu's Collections"
        description="Manage your Renu's Collections account, view order history, track shipments, and update your profile information."
        keywords="my account, order history, account management, renu's collections account, jewelry orders"
        url="https://renucollections.com/account"
      />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-8">My Account</h1>
          
          {/* Tab Navigation */}
          <div className="flex space-x-1 mb-8 bg-muted p-1 rounded-lg">
            <Button
              variant={activeTab === 'profile' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('profile')}
              className="flex-1"
            >
              Profile
            </Button>
            <Button
              variant={activeTab === 'orders' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('orders')}
              className="flex-1"
            >
              Order History
            </Button>
            <Button
              variant={activeTab === 'password' ? 'default' : 'ghost'}
              onClick={() => setActiveTab('password')}
              className="flex-1"
            >
              Change Password
            </Button>
          </div>

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent>
                {editMode ? (
                  <form onSubmit={handleUpdateProfile} className="space-y-4">
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        value={editForm.firstName}
                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        value={editForm.lastName}
                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={editForm.phone}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit">Save Changes</Button>
                      <Button type="button" variant="outline" onClick={() => setEditMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Username</Label>
                      <p className="text-lg">{profile?.username || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Email</Label>
                      <p className="text-lg">{profile?.email || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">First Name</Label>
                      <p className="text-lg">{profile?.firstName || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Last Name</Label>
                      <p className="text-lg">{profile?.lastName || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Phone</Label>
                      <p className="text-lg">{profile?.phone || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Role</Label>
                      <p className="text-lg capitalize">{profile?.role || 'N/A'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Email Verified</Label>
                      <p className="text-lg">{profile?.isEmailVerified ? 'Yes' : 'No'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Member Since</Label>
                      <p className="text-lg">
                        {profile?.createdAt 
                          ? format(new Date(profile.createdAt), 'MMMM d, yyyy')
                          : 'N/A'
                        }
                      </p>
                    </div>
                    
                    <Button onClick={() => setEditMode(true)}>Edit Profile</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit">Change Password</Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Orders Tab */}
          {activeTab === 'orders' && (
            <div className="space-y-6">
              {orders.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No orders found</p>
                    <Button onClick={() => navigate('/products')}>
                      Start Shopping
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                orders.map((order) => (
                  <Card key={order.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle>Order #{order.order_number}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            Placed on {format(new Date(order.created_at), 'MMMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant={getStatusBadgeVariant(order.status)}>
                            {order.status}
                          </Badge>
                          <Badge variant={getPaymentStatusBadgeVariant(order.payment_status)}>
                            Payment: {order.payment_status}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {/* Order Items */}
                        <div>
                          <h4 className="font-medium mb-2">Items</h4>
                          <div className="space-y-2">
                            {order.items.map((item) => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span>
                                  {item.product?.name || `Product ${item.product_id}`} 
                                  (Qty: {item.quantity})
                                </span>
                                <span>₹{(item.price * item.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <Separator />

                        {/* Order Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Shipping Address</h4>
                            <p className="text-sm text-muted-foreground">{order.shipping_address}</p>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Payment Method</h4>
                            <p className="text-sm text-muted-foreground capitalize">{order.payment_method}</p>
                          </div>
                        </div>

                        <Separator />

                        {/* Order Total and Actions */}
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-lg font-bold">Total: ₹{order.total_amount}</p>
                            {order.notes && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Notes: {order.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {order.status === 'pending' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelOrder(order.id)}
                              >
                                Cancel Order
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/order/${order.id}`)}
                            >
                              View Details
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default AccountPage;

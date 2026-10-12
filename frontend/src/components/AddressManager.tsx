import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trash2, Edit, MapPin, Check } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

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

interface AddressManagerProps {
  onSelectAddress?: (address: Address) => void;
  selectedAddressId?: string;
  showSelection?: boolean;
}

export default function AddressManager({ 
  onSelectAddress, 
  selectedAddressId, 
  showSelection = false 
}: AddressManagerProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    label: '',
    fullName: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    phone: '',
    isDefault: false,
  });

  useEffect(() => {
    fetchAddresses();
  }, []);

  const fetchAddresses = async () => {
    try {
      const response = await apiRequest('GET', '/api/v1/addresses');
      const data = await response.json();
      setAddresses(data.data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load addresses',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingAddress) {
        const response = await apiRequest('PATCH', `/api/v1/addresses/${editingAddress._id}`, formData);
        if (response.ok) {
          toast({ title: 'Success', description: 'Address updated' });
        }
      } else {
        const response = await apiRequest('POST', '/api/v1/addresses', formData);
        if (response.ok) {
          toast({ title: 'Success', description: 'Address added' });
        }
      }
      
      setShowForm(false);
      setEditingAddress(null);
      setFormData({
        label: '',
        fullName: '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'India',
        phone: '',
        isDefault: false,
      });
      fetchAddresses();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save address',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (address: Address) => {
    setEditingAddress(address);
    setFormData({
      label: address.label || '',
      fullName: address.fullName,
      line1: address.line1,
      line2: address.line2 || '',
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      phone: address.phone,
      isDefault: address.isDefault,
    });
    setShowForm(true);
  };

  const handleDelete = async (addressId: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    
    try {
      const response = await apiRequest('DELETE', `/api/v1/addresses/${addressId}`);
      if (response.ok) {
        toast({ title: 'Success', description: 'Address deleted' });
        fetchAddresses();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete address',
        variant: 'destructive',
      });
    }
  };

  const handleSetDefault = async (addressId: string) => {
    try {
      const response = await apiRequest('PATCH', `/api/v1/addresses/${addressId}/default`);
      if (response.ok) {
        toast({ title: 'Success', description: 'Default address updated' });
        fetchAddresses();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update default address',
        variant: 'destructive',
      });
    }
  };

  const handleSelect = (address: Address) => {
    if (onSelectAddress) {
      onSelectAddress(address);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading addresses...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Saved Addresses</h3>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Add New Address'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingAddress ? 'Edit Address' : 'Add New Address'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="label">Label (Optional)</Label>
                  <Input
                    id="label"
                    placeholder="e.g., Home, Office"
                    value={formData.label}
                    onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="line1">Address Line 1 *</Label>
                  <Input
                    id="line1"
                    required
                    value={formData.line1}
                    onChange={(e) => setFormData({ ...formData, line1: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="line2">Address Line 2 (Optional)</Label>
                  <Input
                    id="line2"
                    value={formData.line2}
                    onChange={(e) => setFormData({ ...formData, line2: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="city">City *</Label>
                  <Input
                    id="city"
                    required
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="state">State *</Label>
                  <Input
                    id="state"
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="postalCode">PIN Code *</Label>
                  <Input
                    id="postalCode"
                    required
                    pattern="[0-9]{6}"
                    placeholder="6 digits"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="country">Country *</Label>
                  <Input
                    id="country"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    required
                    type="tel"
                    placeholder="10 digits"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                />
                <Label htmlFor="isDefault">Set as default address</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit">
                  {editingAddress ? 'Update Address' : 'Add Address'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setEditingAddress(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {addresses.map((address) => {
          const isEligible = address.state?.trim().toLowerCase().replace(/[\s\-_.]/g, '') === 'tamilnadu' || 
                             address.state?.trim().toLowerCase().replace(/[\s\-_.]/g, '') === 'tn';
          return (
            <Card
              key={address._id}
              className={`cursor-pointer transition-all ${
                showSelection && selectedAddressId === address._id
                  ? 'border-primary ring-2 ring-primary'
                  : 'hover:border-gray-300'
              } ${showSelection && !isEligible ? 'opacity-80 bg-muted/20' : ''}`}
              onClick={() => showSelection && handleSelect(address)}
            >
              <CardContent className="p-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {address.label && (
                        <Badge variant="outline">{address.label}</Badge>
                      )}
                      {address.isDefault && (
                        <Badge variant="default">Default</Badge>
                      )}
                      {showSelection && (
                        isEligible ? (
                          <Badge variant="outline" className="border-emerald-600/40 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-[10px]">
                            Eligible for Delivery
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Out of delivery zone (TN only)
                          </Badge>
                        )
                      )}
                    </div>
                  {!showSelection && (
                    <div className="flex gap-1">
                      {!address.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefault(address._id);
                          }}
                          title="Set as default"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(address);
                        }}
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(address._id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
                <div>
                  <p className="font-medium">{address.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {address.line1}
                    {address.line2 && `, ${address.line2}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {address.city}, {address.state} - {address.postalCode}
                  </p>
                  <p className="text-sm text-muted-foreground">{address.country}</p>
                  <p className="text-sm text-muted-foreground">Phone: {address.phone}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      </div>

      {addresses.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground">
          No saved addresses. Add your first address to get started.
        </div>
      )}
    </div>
  );
}

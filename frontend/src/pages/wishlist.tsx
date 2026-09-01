import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import Navbar from "../components/navbar";
import Footer from "../components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "@/lib/queryClient";

interface WishlistItem {
  id: string;
  productId: string;
  product: ProductInfo;
  createdAt: string;
}

interface ProductInfo {
  _id: string;
  name: string;
  media?: { url: string; isPrimary: boolean }[];
  price: number;
  effectivePrice: number;
}

export default function Wishlist() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const fetchWishlist = async () => {
    if (!user || !token) {
      setError('Please login to view your wishlist');
      setLoading(false);
      return;
    }
    try {
      const response = await apiRequest('GET', '/api/v1/users/wishlist');
      const data = await response.json();
      setItems(data.data?.items || []);
    } catch (e: any) {
      console.error('Wishlist fetch error:', e);
      setError(e.message || 'Failed to load wishlist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, [user, token]);

  const removeItem = async (id: string) => {
    try {
      const response = await apiRequest('DELETE', `/api/v1/users/wishlist/${id}`);
      if (response.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        toast({
          title: 'Removed',
          description: 'Item removed from wishlist',
        });
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove item',
        variant: 'destructive'
      });
    }
  };

  if (loading) return <div className="text-center text-xl mt-10">Loading wishlist...</div>;
  if (error) return (
    <div className="text-center">
      <p className="text-xl mt-10 text-muted-foreground mb-4">{error}</p>
      <Button onClick={() => navigate('/products')}>Browse Products</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container mx-auto px-4 py-8 pt-20">
        <h1 className="text-5xl font-bold text-center mb-12">My Wishlist</h1>

        {items.length === 0 ? (
          <div className="text-center">
            <p className="text-xl mb-4">Your wishlist is empty.</p>
            <Button onClick={() => navigate('/products')}>Browse Products</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map((item) => (
              <WishlistCard key={item.id} item={item} onRemove={removeItem} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function WishlistCard({ item, onRemove }: { item: WishlistItem; onRemove: (id: string) => void }) {
  const navigate = useNavigate();
  const product = item.product;

  const getProductImage = () => {
    if (!product?.media || product.media.length === 0) return '';
    const primary = product.media.find(m => m.isPrimary);
    return primary?.url || product.media[0].url;
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        {getProductImage() && (
          <img src={getProductImage()} alt={product.name} className="w-full h-48 object-cover rounded-md mb-4" />
        )}
        <CardTitle>{product?.name || 'Product'}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col gap-2">
        <p className="text-lg font-semibold">₹{product?.effectivePrice || product?.price || 0}</p>
        <Button onClick={() => navigate(`/product/${item.productId}`)}>View Details</Button>
        <Button variant="outline" onClick={() => onRemove(item.id)}>Remove</Button>
      </CardContent>
    </Card>
  );
}
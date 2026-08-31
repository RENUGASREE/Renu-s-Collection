import { useState, useEffect } from "react";
import { apiRequest, API_BASE_URL } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Footer from "@/components/footer";
import { SEO } from "@/components/SEO";
import { useNavigate, useLocation } from "react-router-dom";

interface Product {
  _id: string;
  name: string;
  description: string;
  price: number;
  effectivePrice: number;
  salePrice: number | null;
  media: { url: string; isPrimary: boolean }[];
  isSignaturePiece: boolean;
  signatureCategory: string;
  categoryId: string;
  subcategoryId: string | null;
  stock: number;
  isInStock: boolean;
  badge: string | null;
}

interface Category {
  _id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productType: string;
  isActive: boolean;
  sortOrder: number;
}

export default function Products() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterLabel, setFilterLabel] = useState("All Categories");
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Handle URL parameters for filtering
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filterParam = params.get('filter');
    if (filterParam) {
      setFilterCategory(filterParam);
      const cat = categories.find(c => c._id === filterParam || c.slug === filterParam);
      setFilterLabel(cat ? cat.name : filterParam);
    }
  }, [location.search, categories]);

  const addToCart = async (productId: string, productName: string, productPrice: number, productImage: string) => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        navigate('/login');
        return;
      }
      
      const response = await apiRequest('POST', '/api/v1/cart', {
        productId,
        quantity: 1,
      });

      if (response.ok) {
        alert('Item added to cart!');
      } else {
        alert('Failed to add to cart. Please try again.');
      }
    } catch (error) {
      console.error('Failed to add to cart:', error);
      alert('Failed to add to cart. Please try again.');
    }
  };

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await apiRequest('GET', '/api/v1/categories?active=true&menu=true');
        const data = await response.json();
        setCategories(data.data);
      } catch (err) {
        console.error('Failed to fetch categories', err);
      }
    };
    fetchCategories();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        let url = '/api/v1/products';
        const params = new URLSearchParams();
        
        if (filterCategory !== 'all') {
          if (filterCategory === 'signature_all') {
            params.append('isSignaturePiece', 'true');
          } else {
            // Check if it's a category ID or slug
            const cat = categories.find(c => c._id === filterCategory || c.slug === filterCategory);
            if (cat) {
              params.append('categoryId', cat._id);
            }
          }
        }
        
        if (searchTerm) {
          params.append('q', searchTerm);
        }
        
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
        
        const response = await apiRequest('GET', url);
        const data = await response.json();
        setAllProducts(data.data);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError('Failed to load products');
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [filterCategory, searchTerm, categories]);

  const getProductImage = (product: Product) => {
    const primaryMedia = product.media.find(m => m.isPrimary);
    return primaryMedia?.url || product.media[0]?.url || '';
  };

  const getCategoryName = (product: Product) => {
    const cat = categories.find(c => c._id === product.categoryId);
    return cat?.name || 'Uncategorized';
  };

  if (loading) return <div className="text-center text-xl mt-10">Loading products...</div>;
  if (error) return <div className="text-center text-xl mt-10 text-red-500">Error: {error}</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SEO 
        title="Our Products - Renu's Collections"
        description="Discover our exquisite collection of luxury jewelry. Shop from our curated selection of premium bracelets, earrings, and bangles."
        keywords="luxury jewelry, bracelets, earrings, bangles, custom jewelry, kundan jewelry"
        url="https://renucollections.com/products"
      />
      <main className="container mx-auto px-4 py-8 pt-20">
        <h1 className="text-5xl font-bold text-center mb-12">Our Products</h1>

        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <Input
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-grow"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-[180px] justify-between">
                {filterLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64">
              <DropdownMenuItem onClick={() => { setFilterCategory("all"); setFilterLabel("All Categories"); }}>
                All Categories
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setFilterCategory("signature_all"); setFilterLabel("Signature Pieces"); }}>
                Signature Pieces
              </DropdownMenuItem>
              {categories.filter(c => c.parentId === null).map((cat) => (
                <DropdownMenuItem key={cat._id} onClick={() => { setFilterCategory(cat._id); setFilterLabel(cat.name); }}>
                  {cat.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => {
            setSearchTerm("");
            setFilterCategory("all");
            setFilterLabel("All Categories");
          }}>Reset Filters</Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {allProducts.map((product) => (
            <Card key={product._id} className="flex flex-col">
              <CardHeader className="relative">
                <img
                  src={getProductImage(product)}
                  alt={product.name}
                  className="w-full h-48 object-cover rounded-md mb-4"
                />
                {product.badge && (
                  <span className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 text-xs rounded">
                    {product.badge}
                  </span>
                )}
                <CardTitle>{product.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex-grow flex flex-col justify-between">
                <div className="mb-2">
                  {product.salePrice && product.salePrice < product.price ? (
                    <>
                      <p className="text-lg font-semibold text-red-600">₹{product.salePrice}</p>
                      <p className="text-sm text-muted-foreground line-through">₹{product.price}</p>
                    </>
                  ) : (
                    <p className="text-lg font-semibold">₹{product.price}</p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  Category: {getCategoryName(product)}
                </p>
                {!product.isInStock && (
                  <p className="text-sm text-red-500 mb-2">Out of Stock</p>
                )}
                <div className="flex gap-2 mt-4">
                  <Button 
                    className="flex-1" 
                    onClick={() => navigate(`/product/${product._id}`)}
                  >
                    View Details
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => addToCart(product._id, product.name, product.effectivePrice, getProductImage(product))}
                    disabled={!product.isInStock}
                  >
                    Add to Cart
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {allProducts.length === 0 && !loading && (
          <p className="text-center text-xl mt-10">No products found.</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
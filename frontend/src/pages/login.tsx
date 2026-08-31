import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Footer from "@/components/footer";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";

export default function Login() {
  const [identifier, setIdentifier] = useState(""); // email or username
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await apiRequest('POST', '/api/v1/auth/login', { email: identifier, password });
      const data = await response.json();
      console.log("Login successful:", data);
      login(data.data.accessToken, {
        id: data.data.user.id,
        username: data.data.user.username,
        email: data.data.user.email,
        role: data.data.user.role,
      });
      toast({ title: "Login successful", description: "Welcome back!" });
      navigate("/"); // Redirect to home page or dashboard
    } catch (error: any) {
      console.error("Login failed:", error);
      const message = error?.message || 'Login failed. Please check your credentials.';
      toast({ title: "Login failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <SEO 
        title="Login - Renu's Collections"
        description="Login to your Renu's Collections account to access your orders, customize jewelry, and manage your profile."
        keywords="login, account access, renu's collections login, jewelry account, customer login"
        url="https://renucollections.com/login"
      />
      <div className="w-full max-w-md">
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <div className="w-full max-w-md border p-8 rounded-lg shadow-lg">
            <h1 className="text-4xl font-bold text-center mb-6">Login</h1>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <Label htmlFor="identifier">Email</Label>
                <Input
                  id="identifier"
                  name="identifier"
                  type="email"
                  autoComplete="username"
                  required
                  placeholder="Enter your email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-12"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowPassword(!showPassword);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none cursor-pointer"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                        <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.418 0 8.167 2.943 9.393 7a10.44 10.44 0 0 1-3.3 4.878"></path>
                        <path d="M6.61 6.61A13.892 13.892 0 0 0 2 12c1.227 4.057 4.975 7 9.393 7"></path>
                        <line x1="2" y1="2" x2="22" y2="22"></line>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Don't have an account?{" "}
              <Link to="/register" className="text-primary hover:underline">
                Register
              </Link>
            </p>
            <p className="text-center text-sm text-muted-foreground mt-2">
              <Link to="/forgot-password" className="text-primary hover:underline">
                Forgot Password?
              </Link>
            </p>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}
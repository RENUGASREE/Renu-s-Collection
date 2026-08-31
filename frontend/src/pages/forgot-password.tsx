import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Footer from "@/components/footer";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('POST', '/api/v1/auth/forgot-password', { email });
      toast({
        title: "Check your email",
        description: "If an account exists, a reset link has been sent.",
      });
      navigate("/login");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to send reset email.';
      toast({ title: "Request failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <SEO 
        title="Forgot Password - Renu's Collections"
        description="Reset your Renu's Collections account password. Enter your email to receive a password reset link."
        keywords="forgot password, password reset, renu's collections password, account recovery"
        url="https://renucollections.com/forgot-password"
      />
      {/* <Navbar /> */}
      <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="w-full max-w-md border p-8 rounded-lg shadow-lg">
          <h1 className="text-4xl font-bold text-center mb-6">Forgot Password</h1>
          <p className="text-center text-muted-foreground mb-6">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="renucollections@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full">
              Send Reset Link
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Remember your password?{" "}
            <Link to="/login" className="text-primary hover:underline">
              Login
            </Link>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
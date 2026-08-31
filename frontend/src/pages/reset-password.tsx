import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Footer from "@/components/footer";
import { useToast } from "@/hooks/use-toast";
import { SEO } from "@/components/SEO";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast({
        title: "Invalid reset link",
        description: "Request a new password reset email.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please confirm both passwords are identical.",
        variant: "destructive",
      });
      return;
    }

    try {
      await apiRequest("POST", "/api/v1/auth/reset-password", { token, password });
      toast({ title: "Password reset successful", description: "You can now log in." });
      navigate("/login");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Password reset failed.";
      toast({ title: "Password reset failed", description: message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <SEO
        title="Reset Password - Renu's Collections"
        description="Reset your Renu's Collections account password."
        url="https://renucollections.com/reset-password"
      />
      <div className="w-full max-w-md">
        <main className="flex-grow container mx-auto px-4 py-8 flex items-center justify-center">
          <div className="w-full max-w-md border p-8 rounded-lg shadow-lg">
            <h1 className="text-4xl font-bold text-center mb-6">Reset Password</h1>
            <p className="text-center text-muted-foreground mb-6">
              Enter your new password below.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 chars, letter + number"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="********"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={!token}>
                Reset Password
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              <Link to="/login" className="text-primary hover:underline">
                Back to Login
              </Link>
            </p>
          </div>
        </main>
        <Footer />
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useForm } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../lib/queryClient';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormInputs = z.infer<typeof loginSchema>;

interface LoginFormProps {
  redirectPath?: string;
}

const LoginForm: React.FC<LoginFormProps> = ({ redirectPath }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormInputs>({
    resolver: zodResolver(loginSchema),
  });
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (data: LoginFormInputs) => {
    try {
      // Backend only accepts email for login, not username
      const payload = { email: data.identifier, password: data.password };
      const response = await apiRequest('POST', '/api/v1/auth/login', payload);
      const loginData = await response.json();
      login(
        loginData.data.accessToken,
        {
          id: String(loginData.data.user.id),
          username: loginData.data.user.username || loginData.data.user.email,
          email: loginData.data.user.email,
          role: loginData.data.user.role,
        },
        loginData.data.refreshToken
      );
      toast({
        title: "Login successful!",
        description: "Welcome back!",
        variant: "default",
      });
      navigate(redirectPath || '/'); // Redirect to home page or specified path after successful login
    } catch (error: any) {
      console.error('Login failed:', error);
      const errorMessage = error.message || 'Login failed. Please check your credentials.';
      toast({
        title: "Login Failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="identifier" className="block text-sm font-medium text-foreground">Email</label>
        <Input
          type="email"
          placeholder="Enter your email"
          {...register("identifier")}
          className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
        />
        {errors.identifier && <p className="mt-1 text-sm text-red-600">{errors.identifier.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground">Password</label>
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            {...register("password")}
            className="w-full px-4 py-2 pr-12 border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-foreground"
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
        {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
      </div>
      <Button
        type="submit"
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        Login
      </Button>
    </form>
  );
};

export default LoginForm;
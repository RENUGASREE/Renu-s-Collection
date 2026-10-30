import React, { useState } from 'react';
import { useForm } from "react-hook-form";

import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiRequest } from '../lib/queryClient';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const registerSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters').max(50, 'Username must be less than 50 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

type RegisterFormInputs = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  redirectPath?: string;
}

const RegisterForm: React.FC<RegisterFormProps> = ({ redirectPath }) => {
  const { register, handleSubmit, formState: { errors } } = useForm<RegisterFormInputs>({
    resolver: zodResolver(registerSchema),
  });
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

const onSubmit = async (data: RegisterFormInputs) => {
    try {
      // Use the dedicated registration endpoint
      const response = await apiRequest('POST', '/api/v1/auth/register', {
        username: data.username,
        email: data.email,
        password: data.password,
      });
      const registerData = await response.json();
      toast({
        title: "Registration successful!",
        description: "Logging you in...",
        variant: "default",
      });
      // Automatically log in after registration using email-based auth
      const loginResponse = await apiRequest('POST', '/api/v1/auth/login', {
        email: data.email,
        password: data.password,
      });
      const loginData = await loginResponse.json();
      login(
        loginData.data.accessToken,
        {
          id: String(loginData.data.user.id),
          username: loginData.data.user.username || data.username,
          email: loginData.data.user.email,
          role: loginData.data.user.role,
        },
        loginData.data.refreshToken
      );
      navigate(redirectPath || '/');
    } catch (error: any) {
        console.error("Registration error:", error);
        const errorMessage = (error?.message) || 'Registration failed. Please try again.';
        toast({
          title: "Registration Failed",
          description: errorMessage,
          variant: "destructive",
        });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-foreground">Username</label>
        <Input
          id="username"
          type="text"
          placeholder="Choose a username (2-50 characters)"
          {...register('username')}
          className="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-foreground"
        />
        {errors.username && <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>}
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-foreground">Email</label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email"
          {...register('email')}
          className="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-foreground"
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-foreground">Password</label>
        <div className="relative mt-1">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="Create a password"
            {...register('password')}
            className="block w-full px-3 py-2 pr-12 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-foreground"
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
        <p className="mt-2 text-xs text-gray-500">
          Password must be at least 8 characters with at least one letter and one number.
        </p>
      </div>
      <Button
        type="submit"
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        Register
      </Button>
    </form>
  );
};

export default RegisterForm;
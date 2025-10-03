"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/enhanced-input";
import { useRouter } from "next/navigation";
import { useAuth, useRedirectIfAuthenticated } from "@/contexts/AuthContext";
import { 
  validateEmail, 
  validatePassword, 
  validateMerchantName,
  ValidationResult,
  PasswordStrength
} from "@/lib/validation";

interface FormData {
  email: string;
  password: string;
  merchantName: string;
}

interface FormValidation {
  email: ValidationResult;
  password: ValidationResult & { strength?: PasswordStrength };
  merchantName: ValidationResult;
}

function AuthContent() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    merchantName: "",
  });
  
  const [validation, setValidation] = useState<FormValidation>({
    email: { isValid: true },
    password: { isValid: true },
    merchantName: { isValid: true },
  });
  
  const [touchedFields, setTouchedFields] = useState<Set<keyof FormData>>(new Set());
  const [generalError, setGeneralError] = useState<string>("");
  const router = useRouter();
  const { login, register, isLoading } = useAuth();

  // Debounced validation functions
  const debouncedValidateEmail = useCallback(
    (email: string) => {
      const result = validateEmail(email);
      setValidation(prev => ({ ...prev, email: result }));
    },
    []
  );

  const debouncedValidatePassword = useCallback(
    (password: string) => {
      const result = validatePassword(password, !isLogin);
      setValidation(prev => ({ ...prev, password: result }));
    },
    [isLogin]
  );

  const debouncedValidateMerchantName = useCallback(
    (name: string) => {
      const result = validateMerchantName(name);
      setValidation(prev => ({ ...prev, merchantName: result }));
    },
    []
  );

  const validateForm = (): boolean => {
    const emailResult = validateEmail(formData.email);
    const passwordResult = validatePassword(formData.password, !isLogin);
    const merchantNameResult = !isLogin ? validateMerchantName(formData.merchantName) : { isValid: true };

    setValidation({
      email: emailResult,
      password: passwordResult,
      merchantName: merchantNameResult,
    });

    setTouchedFields(new Set(['email', 'password', ...(isLogin ? [] : ['merchantName'])] as (keyof FormData)[]));

    return emailResult.isValid && passwordResult.isValid && merchantNameResult.isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setGeneralError("");

    console.log("Form data on submit:", formData);
    console.log("Is login mode:", isLogin);
    console.log("Validation state:", validation);

    try {
      let result;
      if (isLogin) {
        console.log("Attempting login...");
        result = await login({ email: formData.email, password: formData.password });
        console.log("Login result:", result);
      } else {
        result = await register({
          email: formData.email,
          password: formData.password,
          merchantName: formData.merchantName,
        });
      }
      console.log("Auth result:", result);
      if (result.success) {
        // Redirect will be handled by the auth context
        if (!isLogin) {
          router.push("/dashboard?welcome=true");
        } else {
          router.push("/dashboard");
        }
      } else {
        setGeneralError(result.error || "Authentication failed");
      }
    } catch (err) {
      console.error("Auth error:", err);
      setGeneralError("Network error. Please try again.");
    }
  };

  const handleInputChange = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear general error when user starts typing
    if (generalError) {
      setGeneralError("");
    }

    // Trigger real-time validation for touched fields or when user types
    if (touchedFields.has(field) || value) {
      setTimeout(() => {
        if (field === 'email') {
          debouncedValidateEmail(value);
        } else if (field === 'password') {
          debouncedValidatePassword(value);
        } else if (field === 'merchantName') {
          debouncedValidateMerchantName(value);
        }
      }, 300); // 300ms debounce
    }
  };

  const handleInputBlur = (field: keyof FormData) => () => {
    setTouchedFields(prev => new Set([...prev, field]));
    
    // Validate immediately on blur
    if (field === 'email') {
      const result = validateEmail(formData.email);
      setValidation(prev => ({ ...prev, email: result }));
    } else if (field === 'password') {
      const result = validatePassword(formData.password, !isLogin);
      setValidation(prev => ({ ...prev, password: result }));
    } else if (field === 'merchantName') {
      const result = validateMerchantName(formData.merchantName);
      setValidation(prev => ({ ...prev, merchantName: result }));
    }
  };

  return (
    <main className="min-h-dvh grid place-items-center p-8">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isLogin ? "Sign In" : "Create Account"}
          </CardTitle>
          <p className="text-muted-foreground">
            {isLogin 
              ? "Welcome back to LinkPass" 
              : "Start selling passes with LinkPass"
            }
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {!isLogin && (
              <Input
                label="Business Name"
                type="text"
                placeholder="Enter your business name"
                value={formData.merchantName}
                onChange={handleInputChange("merchantName")}
                onBlur={handleInputBlur("merchantName")}
                validation={touchedFields.has('merchantName') ? validation.merchantName : undefined}
                helperText="This will be displayed to your customers"
              />
            )}
            
            <Input
              label="Email"
              type="email"
              placeholder="Enter your email address"
              value={formData.email}
              onChange={handleInputChange("email")}
              onBlur={handleInputBlur("email")}
              validation={touchedFields.has('email') ? validation.email : undefined}
            />
            
            <Input
              label="Password"
              type="password"
              placeholder={isLogin ? "Enter your password" : "Create a strong password"}
              value={formData.password}
              onChange={handleInputChange("password")}
              onBlur={handleInputBlur("password")}
              validation={touchedFields.has('password') ? validation.password : undefined}
              showPasswordToggle
              passwordStrength={!isLogin ? validation.password.strength : undefined}
              helperText={isLogin ? undefined : "Use at least 8 characters with mixed case, numbers and symbols"}
            />

            {generalError && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200">
                <p className="text-red-600 text-sm flex items-center gap-2">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {generalError}
                </p>
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading}
            >
              {isLoading 
                ? (isLogin ? "Signing In..." : "Creating Account...") 
                : (isLogin ? "Sign In" : "Create Account")
              }
            </Button>
          </form>

          {/* OAuth Options */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={() => {
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/google`;
                }}
              >
                <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading}
                onClick={() => {
                  window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/github`;
                }}
              >
                <svg className="h-4 w-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.203 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.942.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z"
                    clipRule="evenodd"
                  />
                </svg>
                GitHub
              </Button>
            </div>
          </div>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setFormData({ email: "", password: "", merchantName: "" });
                setValidation({
                  email: { isValid: true },
                  password: { isValid: true },
                  merchantName: { isValid: true },
                });
                setTouchedFields(new Set());
                setGeneralError("");
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              {isLogin 
                ? "Don't have an account? Sign up" 
                : "Already have an account? Sign in"
              }
            </button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default function AuthPage() {
  useRedirectIfAuthenticated();
  return <AuthContent />;
}
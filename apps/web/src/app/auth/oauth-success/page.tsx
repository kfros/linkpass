"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function OAuthSuccessPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const exchangeToken = async () => {
      try {
        const token = searchParams.get("token");
        const welcome = searchParams.get("welcome");
        
        if (!token) {
          throw new Error("No token provided");
        }
        
        // AGGRESSIVE cookie clearing - try to clear all possible cookie variations
        const cookiesToClear = [
          "access_token", "refresh_token", "session", "auth", "token", 
          "__Secure-access_token", "__Host-access_token"
        ];
        
        const clearCombinations = [
          {},
          { domain: "localhost" },
          { domain: ".localhost" }, 
          { domain: "127.0.0.1" },
          { path: "/" },
          { path: "/", domain: "localhost" },
          { path: "/", domain: ".localhost" },
          { path: "/", domain: "127.0.0.1" },
        ];
        
        cookiesToClear.forEach(cookieName => {
          clearCombinations.forEach(attrs => {
            const attrString = Object.entries(attrs)
              .map(([key, value]) => `${key}=${value}`)
              .join("; ");
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; ${attrString}`;
          });
        });
        
        // Also try to clear localStorage and sessionStorage
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          console.warn("Could not clear storage:", e);
        }
        
        console.log("Cookies before clearing:", document.cookie);
        
        // Wait a moment for cookies to clear
        await new Promise(resolve => setTimeout(resolve, 100));
        
        console.log("Cookies after clearing:", document.cookie);
        
        // Exchange temporary token for session cookies
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/oauth-exchange`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });
        
        console.log("OAuth exchange response status:", response.status);
        console.log("Response headers:", [...response.headers.entries()]);
        
        if (!response.ok) {
          throw new Error("Failed to exchange token");
        }
        
        const data = await response.json();
        
        setStatus("success");
        setMessage(`Welcome ${data.merchant.name}!`);
        
        // Redirect to dashboard after a brief success message
        setTimeout(() => {
          const redirectUrl = welcome === "true" 
            ? "/dashboard?welcome=true"
            : "/dashboard";
          router.push(redirectUrl);
        }, 1500);
        
      } catch (error) {
        console.error("OAuth token exchange failed:", error);
        setStatus("error");
        setMessage("Authentication failed. Please try again.");
        
        // Redirect to auth page after error
        setTimeout(() => {
          router.push("/auth?error=oauth_failed");
        }, 3000);
      }
    };
    
    exchangeToken();
  }, [searchParams, router]);
  
  return (
    <main className="min-h-dvh grid place-items-center">
      <div className="text-center max-w-md">
        {status === "loading" && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h1 className="text-xl font-semibold mb-2">Completing sign in...</h1>
            <p className="text-muted-foreground">Please wait while we set up your account.</p>
          </>
        )}
        
        {status === "success" && (
          <>
            <div className="text-green-600 text-6xl mb-4">✓</div>
            <h1 className="text-xl font-semibold mb-2">Sign in successful!</h1>
            <p className="text-muted-foreground">{message}</p>
            <p className="text-sm text-muted-foreground mt-2">Redirecting to dashboard...</p>
          </>
        )}
        
        {status === "error" && (
          <>
            <div className="text-red-600 text-6xl mb-4">✗</div>
            <h1 className="text-xl font-semibold mb-2">Sign in failed</h1>
            <p className="text-muted-foreground">{message}</p>
            <p className="text-sm text-muted-foreground mt-2">Redirecting to sign in page...</p>
          </>
        )}
      </div>
    </main>
  );
}
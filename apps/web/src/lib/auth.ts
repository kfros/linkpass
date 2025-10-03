// Utility for handling access/refresh token authentication
export class AuthService {
  private static instance: AuthService;
  private refreshPromise: Promise<boolean> | null = null;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  // Make authenticated API request with automatic token refresh
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    // First, try the request with current access token
    let response = await this.makeRequest(url, options);
    
    // If unauthorized, try to refresh token and retry
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        response = await this.makeRequest(url, options);
      }
    }
    
    return response;
  }

  private async makeRequest(url: string, options: RequestInit): Promise<Response> {
    return fetch(url, {
      ...options,
      credentials: "include", // Include cookies
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  }

  private async refreshToken(): Promise<boolean> {
    // Prevent multiple concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.performRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    
    return result;
  }

  private async performRefresh(): Promise<boolean> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (response.ok) {
        return true;
      } else {
        // Refresh failed, redirect to login
        if (typeof window !== "undefined") {
          window.location.href = "/auth";
        }
        return false;
      }
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      // Clear tokens from localStorage and sessionStorage (defensive, in case any are stored)
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          sessionStorage.removeItem("access_token");
          sessionStorage.removeItem("refresh_token");
        } catch (e) {
          // ignore
        }
        window.location.href = "/auth";
      }
    }
  }

  async getCurrentUser() {
    console.log("Fetching current user");
    try {
      const response = await this.fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        method: "GET",
        credentials: "include",
        headers: {
            "Cache-Control": "no-cache",
        }
      });
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error("Get current user failed:", error);
      return null;
    }
  }
}

// Export singleton instance
export const authService = AuthService.getInstance();
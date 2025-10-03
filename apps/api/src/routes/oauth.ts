import { FastifyInstance } from "fastify";
import { getDb } from "../db/client";
import { merchantUsers, merchants, oauthProviders, refreshTokens } from "../db/schema";
import { eq, and } from "drizzle-orm";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "your-refresh-secret";

interface TokenPayload {
  userId: number;
  merchantId: number;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  exp?: number;
}

interface ClientInfo {
  ipAddress: string;
  userAgent: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility?: string;
}

function generateTokens(payload: TokenPayload) {
  // Add debug logging for token generation
  const now = Math.floor(Date.now() / 1000);
  const accessTokenExpiry = now + (15 * 60); // 15 minutes from now
  
  console.log(`Generating tokens at ${new Date().toISOString()}`);
  console.log(`Access token will expire at ${new Date(accessTokenExpiry * 1000).toISOString()}`);
  
  const accessToken = jwt.sign({
    ...payload,
    iat: now,
    exp: accessTokenExpiry
  }, JWT_SECRET);
  
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
  return { accessToken, refreshToken };
}

async function storeRefreshToken(userId: number, refreshToken: string) {
  const db = await getDb();
  
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getClientInfo(request: any): ClientInfo {
  const ipAddress = request.headers['x-forwarded-for'] || 
                   request.headers['x-real-ip'] || 
                   request.connection?.remoteAddress || 
                   request.socket?.remoteAddress ||
                   'unknown';
  
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  return { 
    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress, 
    userAgent 
  };
}

export async function oauthRoutes(app: FastifyInstance) {
  // Debug endpoint to check cookies
  app.get("/auth/debug", async (request) => {
    const cookies = request.cookies;
    const headers = request.headers;
    
    return {
      cookies: cookies || {},
      userAgent: headers['user-agent'],
      origin: headers.origin,
      referer: headers.referer,
    };
  });

  // Exchange temporary OAuth token for session cookies
  app.post("/auth/oauth-exchange", async (request, reply) => {
    const { token } = request.body as { token?: string };
    
    if (!token) {
      return reply.status(400).send({ error: "No token provided" });
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
      
      const db = await getDb();
      
      // Get user data
      const [user] = await db
        .select({
          id: merchantUsers.id,
          merchantId: merchantUsers.merchantId,
          email: merchantUsers.email,
          merchantName: merchants.name,
        })
        .from(merchantUsers)
        .innerJoin(merchants, eq(merchantUsers.merchantId, merchants.id))
        .where(eq(merchantUsers.id, decoded.userId))
        .limit(1);
      
      if (!user) {
        return reply.status(401).send({ error: "Invalid token" });
      }
      
      const clientInfo = getClientInfo(request);
      
      // Generate new tokens
      const { accessToken, refreshToken } = generateTokens({
        userId: user.id,
        merchantId: user.merchantId,
        email: user.email,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });
      
      // Debug: verify the token we just created
      try {
        const decoded = jwt.verify(accessToken, JWT_SECRET) as TokenPayload;
        console.log(`Just created access token, expires at: ${new Date((decoded.exp ?? 0) * 1000).toISOString()}`);
      } catch (err) {
        console.error('Failed to verify token we just created:', err);
      }
      
      // Store refresh token
      await storeRefreshToken(user.id, refreshToken);
      
      // Clear any existing cookies first to prevent conflicts - try multiple combinations
      reply.clearCookie("access_token", { path: "/" });
      reply.clearCookie("refresh_token", { path: "/" });
      reply.clearCookie("access_token", { path: "/", domain: "localhost" });
      reply.clearCookie("refresh_token", { path: "/", domain: "localhost" });
      reply.clearCookie("access_token", { path: "/", sameSite: "strict" });
      reply.clearCookie("refresh_token", { path: "/", sameSite: "strict" });
      
      console.log("Clearing existing cookies with multiple attribute combinations");
      
      // Set cookies for same-origin requests
      reply.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", // Changed from strict to lax for cross-site OAuth
        maxAge: 15 * 60 * 1000, // 15 minutes
        path: "/",
      });
      
      reply.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", // Changed from strict to lax for cross-site OAuth
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });
      
      console.log(`Setting cookies - access token expires: ${new Date((jwt.decode(accessToken) as TokenPayload | null)?.exp ?? 0 * 1000).toISOString()}`);
      
      request.log.info({
        userId: user.id,
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
      }, "OAuth exchange cookies set");

      return reply.send({
        success: true,
        merchant: {
          id: user.merchantId,
          name: user.merchantName,
          email: user.email,
        },
      });
      
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });
  
  // Google OAuth routes
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    app.get("/auth/google", async (request, reply) => {
      const redirectUri = `${process.env.NEXT_PUBLIC_API_URL}/auth/google/callback`;
      const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${process.env.GOOGLE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('profile email')}` +
        `&access_type=offline`;
      
      request.log.info({ redirectUri, googleAuthUrl }, 'Google OAuth redirect');
      
      return reply.redirect(googleAuthUrl);
    });
    
    app.get("/auth/google/callback", async (request, reply) => {
      const { code, error } = request.query as { code?: string; error?: string };
      
      request.log.info({ code: code ? 'received' : 'missing', error }, 'Google OAuth callback');
      
      if (error) {
        request.log.error({ error }, 'Google OAuth error');
        return reply.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/auth?error=oauth_error`);
      }
      
      if (!code) {
        request.log.error('No code received from Google');
        return reply.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/auth?error=oauth_cancelled`);
      }
      
      try {
        request.log.info('Exchanging code for access token');
        
        // Exchange code for access token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${process.env.NEXT_PUBLIC_API_URL}/auth/google/callback`,
          }),
        });
        
        const tokenData = await tokenResponse.json();
        
        request.log.info({ hasAccessToken: !!tokenData.access_token }, 'Token exchange result');
        
        if (!tokenData.access_token) {
          request.log.error({ tokenData }, 'No access token received');
          throw new Error('No access token received');
        }
        
        // Get user profile
        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        });
        
        const profile = await profileResponse.json();
        
        request.log.info({ email: profile.email, name: profile.name }, 'Google profile received');
        
        if (!profile.email) {
          request.log.error({ profile }, 'No email provided by Google');
          throw new Error('No email provided by Google');
        }
        
        const { user, isNewUser } = await handleOAuthUser('google', profile.id, profile.email, profile.name, profile);
        
        request.log.info({ userId: user.id, isNewUser }, 'User handled successfully');
        
        const clientInfo = getClientInfo(request);
        
        // Generate tokens
        const { refreshToken } = generateTokens({
          userId: user.id,
          merchantId: user.merchantId,
          email: user.email,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });
        
        request.log.info('Tokens generated, storing refresh token');
        
        // Store refresh token
        await storeRefreshToken(user.id, refreshToken);
        
        request.log.info('Setting cookies');
        
        // For OAuth flow, we need to handle cross-origin cookies differently
        // Create a temporary token for the frontend to exchange
        const tempTokenExpiry = Math.floor(Date.now() / 1000) + (5 * 60); // 5 minutes
        console.log(`Creating temp token at ${new Date().toISOString()}`);
        console.log(`Temp token will expire at ${new Date(tempTokenExpiry * 1000).toISOString()}`);
        
        const tempToken = jwt.sign({
          userId: user.id,
          merchantId: user.merchantId,
          email: user.email,
          iat: Math.floor(Date.now() / 1000),
          exp: tempTokenExpiry,
        }, JWT_SECRET);
        
        // Redirect to frontend with temporary token
        const redirectUrl = isNewUser 
          ? `${process.env.NEXT_PUBLIC_BASE_URL}/auth/oauth-success?token=${tempToken}&welcome=true`
          : `${process.env.NEXT_PUBLIC_BASE_URL}/auth/oauth-success?token=${tempToken}`;
        
        request.log.info({ redirectUrl }, 'Redirecting with temporary token');
        
        return reply.redirect(redirectUrl);
        
      } catch (error) {
        request.log.error({ error }, "Error processing Google OAuth callback");
        return reply.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/auth?error=callback_error`);
      }
    });
  }
  
  // GitHub OAuth routes
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    app.get("/auth/github", async (request, reply) => {
      const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
        `client_id=${process.env.GITHUB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(`${process.env.NEXT_PUBLIC_API_URL}/auth/github/callback`)}` +
        `&scope=${encodeURIComponent('user:email')}`;
      
      return reply.redirect(githubAuthUrl);
    });
    
    app.get("/auth/github/callback", async (request, reply) => {
      const { code, error } = request.query as { code?: string; error?: string };
      
      if (error) {
        return reply.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/auth?error=oauth_error`);
      }
      
      if (!code) {
        return reply.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/auth?error=oauth_cancelled`);
      }
      
      try {
        // Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID!,
            client_secret: process.env.GITHUB_CLIENT_SECRET!,
            code,
          }),
        });
        
        const tokenData = await tokenResponse.json();
        
        if (!tokenData.access_token) {
          throw new Error('No access token received');
        }
        
        // Get user profile
        const profileResponse = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'User-Agent': 'LinkPass-App',
          },
        });
        
        const profile = await profileResponse.json();
        
        // Get user emails
        const emailResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            'User-Agent': 'LinkPass-App',
          },
        });
        
        const emails = await emailResponse.json();
        const primaryEmail = emails.find((email: GitHubEmail) => email.primary)?.email || emails[0]?.email;
        
        if (!primaryEmail) {
          throw new Error('No email provided by GitHub');
        }
        
        const { user, isNewUser } = await handleOAuthUser('github', profile.id.toString(), primaryEmail, profile.name || profile.login, profile);
        
        const clientInfo = getClientInfo(request);
        
        // Generate tokens
        const { accessToken, refreshToken } = generateTokens({
          userId: user.id,
          merchantId: user.merchantId,
          email: user.email,
          ipAddress: clientInfo.ipAddress,
          userAgent: clientInfo.userAgent,
        });
        
        // Store refresh token
        await storeRefreshToken(user.id, refreshToken);
        
        // Set secure cookies
        reply.cookie("access_token", accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 15 * 60 * 1000, // 15 minutes
        });
        
        reply.cookie("refresh_token", refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        });
        
        // Redirect to dashboard
        const redirectUrl = isNewUser 
          ? `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard?welcome=true`
          : `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard`;
        
        return reply.redirect(redirectUrl);
        
      } catch (error) {
        request.log.error({ error }, "Error processing GitHub OAuth callback");
        return reply.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/auth?error=callback_error`);
      }
    });
  }
}

// Helper function to handle OAuth user creation/linking
async function handleOAuthUser(provider: string, providerId: string, email: string, displayName: string, profileData: unknown) {
  const db = await getDb();
  
  console.log(`=== OAuth User Handling ===`);
  console.log(`Provider: ${provider}, Email: ${email}, Display Name: ${displayName}`);
  
  // Check if OAuth account already exists
  const [existingOAuth] = await db
    .select()
    .from(oauthProviders)
    .where(and(
      eq(oauthProviders.provider, provider),
      eq(oauthProviders.providerId, providerId)
    ))
    .limit(1);
  
  console.log(`Existing OAuth account found: ${!!existingOAuth}`);
  
  if (existingOAuth) {
    // Get the associated user
    const [user] = await db
      .select({
        id: merchantUsers.id,
        merchantId: merchantUsers.merchantId,
        email: merchantUsers.email,
        merchantName: merchants.name,
      })
      .from(merchantUsers)
      .innerJoin(merchants, eq(merchantUsers.merchantId, merchants.id))
      .where(eq(merchantUsers.id, existingOAuth.userId))
      .limit(1);
    
    if (user) {
      console.log(`Returning existing OAuth user: ${user.email}`);
      return { user, isNewUser: false };
    }
  }
  
  // Check if user with this email exists
  const [existingUser] = await db
    .select({
      id: merchantUsers.id,
      merchantId: merchantUsers.merchantId,
      email: merchantUsers.email,
      merchantName: merchants.name,
    })
    .from(merchantUsers)
    .innerJoin(merchants, eq(merchantUsers.merchantId, merchants.id))
    .where(eq(merchantUsers.email, email))
    .limit(1);
  
  console.log(`Existing user with email found: ${!!existingUser}`);
  
  if (existingUser) {
    // Link existing account to OAuth provider
    console.log(`Linking existing user ${existingUser.email} to OAuth provider`);
    await db.insert(oauthProviders).values({
      userId: existingUser.id,
      provider,
      providerId,
      email,
      displayName,
      profileData,
    });
    
    return { user: existingUser, isNewUser: false };
  }
  
  // Create new merchant and user
  console.log(`Creating new user for email: ${email}`);
  const merchantName = displayName || email.split('@')[0];
  console.log(`Merchant name will be: ${merchantName}`);
  
  try {
    const [merchant] = await db
      .insert(merchants)
      .values({ name: merchantName })
      .returning();
    
    console.log(`Created merchant with ID: ${merchant.id}`);
    
    const [newUser] = await db
      .insert(merchantUsers)
      .values({
        merchantId: merchant.id,
        email: email,
        passwordHash: null, // OAuth-only user
        role: "admin",
      })
      .returning();
    
    console.log(`Created user with ID: ${newUser.id}`);
    
    // Create OAuth provider link
    await db.insert(oauthProviders).values({
      userId: newUser.id,
      provider,
      providerId,
      email,
      displayName,
      profileData,
    });
    
    console.log(`Created OAuth provider link`);
    
    const user = {
      id: newUser.id,
      merchantId: merchant.id,
      email: newUser.email,
      merchantName: merchant.name,
    };
    
    console.log(`Returning new user: ${JSON.stringify(user)}`);
    return { user, isNewUser: true };
    
  } catch (error) {
    console.error(`Error creating new user:`, error);
    throw error;
  }
}
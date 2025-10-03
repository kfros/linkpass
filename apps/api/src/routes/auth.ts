import { FastifyInstance } from "fastify";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getDb } from "../db/client";
import { merchants, merchantUsers, refreshTokens } from "../db/schema";
import { eq, and, lt, isNull, gt } from "drizzle-orm";
import crypto from "crypto";
import { revokedAccessTokens } from "../db/schema";

// Type definitions
interface ClientInfo {
  ipAddress: string;
  userAgent: string;
}

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
}

interface JWTPayload {
  userId: number;
  merchantId: number;
  email: string;
  ipAddress?: string;
  userAgent?: string;
  exp?: number;
}

const RegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  merchantName: z.string().min(2, "Merchant name must be at least 2 characters"),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "your-refresh-secret";


// Enhanced password hashing with explicit salt management
// Standard bcrypt password hashing and verification only
async function hashPassword(password: string): Promise<string> {
  const saltRounds = 12; // Higher than default for extra security
  return await bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    console.log("Verifying password with bcrypt");
    console.log("Stored hash length:", storedHash.length);
    console.log("stored hash:", storedHash);
    return await bcrypt.compare(password, storedHash);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

interface TokenPayload {
  userId: number;
  merchantId: number;
  email: string;
  ipAddress?: string; // Add IP binding
  userAgent?: string; // Add user agent binding
}

function generateTokens(payload: TokenPayload) {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
  return { accessToken, refreshToken };
}

async function storeRefreshToken(userId: number, refreshToken: string) {
  const db = await getDb();
  
  // Hash the refresh token before storing
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  
  // Set expiry date (30 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  // Store in database
  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });
}

async function cleanupExpiredTokens() {
  const db = await getDb();
  const now = new Date();
  
  // Delete expired refresh tokens
  await db
    .delete(refreshTokens)
    .where(lt(refreshTokens.expiresAt, now));
}

async function fixDatabaseSequences() {
  const db = await getDb();
  
  try {
    // Fix merchants sequence
    await db.execute(`
      SELECT setval('merchants_id_seq', COALESCE((SELECT MAX(id) FROM merchants), 0) + 1, false);
    `);
    
    // Fix merchant_users sequence
    await db.execute(`
      SELECT setval('merchant_users_id_seq', COALESCE((SELECT MAX(id) FROM merchant_users), 0) + 1, false);
    `);
    
    console.log("Database sequences fixed successfully");
  } catch (error) {
    console.error("Warning: Could not fix database sequences:", error);
    // Don't throw - this is not critical for startup
  }
}

import { FastifyRequest } from "fastify";

function getClientInfo(request: FastifyRequest): ClientInfo {
  const ipAddress = request.headers['x-forwarded-for'] || 
                   request.headers['x-real-ip'] || 
                   request.ip ||
                   'unknown';
  
  const userAgent = request.headers['user-agent'] || 'unknown';
  
  return { 
    ipAddress: Array.isArray(ipAddress) ? ipAddress[0] : ipAddress, 
    userAgent 
  };
}

function validateTokenContext(tokenPayload: JWTPayload, request: FastifyRequest): boolean {
  const currentContext = getClientInfo(request);
  
  // For OAuth flows, we'll be more lenient with context validation
  // since tokens are created in OAuth callback and used later from frontend
  
  // Only validate if both token and current context have these fields
  // and they're not from localhost (development)
  const isLocalhost = currentContext.ipAddress?.includes('127.0.0.1') || 
                     currentContext.ipAddress?.includes('localhost');
  
  if (isLocalhost) {
    // Skip strict validation for localhost development
    return true;
  }
  
  // Strict IP validation (can be relaxed for mobile users)
  if (tokenPayload.ipAddress && tokenPayload.ipAddress !== currentContext.ipAddress) {
    return false;
  }
  
  // User agent validation (helps detect token theft)
  if (tokenPayload.userAgent && tokenPayload.userAgent !== currentContext.userAgent) {
    return false;
  }
  
  return true;
}

export async function authRoutes(app: FastifyInstance) {
  // Clean up expired tokens and fix sequences on startup
  await cleanupExpiredTokens();
  await fixDatabaseSequences();
  
  // Register endpoint
  app.post("/auth/register", async (request, reply) => {
    try {
      const { email, password, merchantName } = RegisterSchema.parse(request.body);
      request.log.info({ email, merchantName, passwordLength: password.length }, "Registration request body");

      const db = await getDb();

      // Check if email already exists
      const [existingUser] = await db
        .select()
        .from(merchantUsers)
        .where(eq(merchantUsers.email, email))
        .limit(1);

      if (existingUser) {
        return reply.status(400).send({
          error: "DUPLICATE_EMAIL",
          message: "An account with this email already exists",
        });
      }

      // Hash password with standard bcrypt
      const passwordHash = await hashPassword(password);

      // Create merchant first with error handling
      let merchant;
      try {
        [merchant] = await db
          .insert(merchants)
          .values({ name: merchantName })
          .returning();
      } catch (dbError) {
        const error = dbError as DatabaseError;
        // Handle sequence/constraint issues
        if (error.code === '23505' && error.constraint === 'merchants_pkey') {
          request.log.error({ error }, "Merchant ID sequence issue");
          return reply.status(500).send({
            error: "DATABASE_ERROR",
            message: "Database sequence error. Please contact support.",
          });
        }
        throw error; // Re-throw other errors
      }

      // Create merchant user
      const [merchantUser] = await db
        .insert(merchantUsers)
        .values({
          merchantId: merchant.id,
          email,
          passwordHash,
          role: "admin",
        })
        .returning();

      // Generate access and refresh tokens
      const clientInfo = getClientInfo(request);
      const { accessToken, refreshToken } = generateTokens({
        userId: merchantUser.id,
        merchantId: merchant.id,
        email: merchantUser.email,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });

      // Debug: decode tokens to log exp
      const decodedAccess = jwt.decode(accessToken);
      const decodedRefresh = jwt.decode(refreshToken);
      request.log.info({
        accessTokenExp: decodedAccess && typeof decodedAccess === 'object' ? decodedAccess['exp'] : undefined,
        accessTokenExpDate: decodedAccess && typeof decodedAccess === 'object' && decodedAccess['exp'] ? new Date(decodedAccess['exp'] * 1000).toISOString() : undefined,
        refreshTokenExp: decodedRefresh && typeof decodedRefresh === 'object' ? decodedRefresh['exp'] : undefined,
        refreshTokenExpDate: decodedRefresh && typeof decodedRefresh === 'object' && decodedRefresh['exp'] ? new Date(decodedRefresh['exp'] * 1000).toISOString() : undefined,
      }, "Generated token expiration (register)");

      // Store refresh token in database
      await storeRefreshToken(merchantUser.id, refreshToken);

      // Set secure HTTP-only cookies
      reply.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60 * 1000, // 15 minutes
      });
      request.log.info({ cookieSet: 'access_token', valueLength: accessToken.length }, "Set access_token cookie (register)");

      reply.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });
      request.log.info({ cookieSet: 'refresh_token', valueLength: refreshToken.length }, "Set refresh_token cookie (register)");

      return reply.send({
        success: true,
        merchant: {
          id: merchant.id,
          name: merchant.name,
          email: merchantUser.email,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          details: error.issues,
        });
      }

      request.log.error({ error }, "Registration error");
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: "Failed to create account",
      });
    }
  });
  
  // Login endpoint
  app.post("/auth/login", async (request, reply) => {
    try {
      // Debug: log incoming request body (mask password)
      const rawBody = request.body;
      const { email, password } = LoginSchema.parse(request.body);
      request.log.info({
        rawBody,
        parsedEmail: email,
        passwordLength: password.length,
        passwordPreview: password.substring(0, 2) + '***',
      }, "Login request body");

      const db = await getDb();

      // Find user with merchant data
      const [user] = await db
        .select({
          id: merchantUsers.id,
          merchantId: merchantUsers.merchantId,
          email: merchantUsers.email,
          passwordHash: merchantUsers.passwordHash,
          merchantName: merchants.name,
        })
        .from(merchantUsers)
        .innerJoin(merchants, eq(merchantUsers.merchantId, merchants.id))
        .where(eq(merchantUsers.email, email))
        .limit(1);

      request.log.info({
        userFound: !!user,
        userObject: user,
      }, "User DB lookup result");

      if (!user || !user.passwordHash) {
        request.log.warn({ email }, "User not found or missing password hash");
        return reply.status(401).send({
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        });
      }

      // Debug: log password hash
      request.log.info({
        passwordHash: user.passwordHash,
        passwordHashLength: user.passwordHash.length,
        passwordHashPreview: user.passwordHash.substring(0, 10),
      }, "User password hash");

      // Verify password with standard bcrypt
      const isValidPassword = await verifyPassword(password, user.passwordHash);
      request.log.info({
        attemptedPassword: password.substring(0, 2) + '***',
        isValidPassword,
      }, "Password verification result");
      if (!isValidPassword) {
        request.log.warn({ email }, "Password invalid");
        return reply.status(401).send({
          error: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        });
      }

      // Generate access and refresh tokens
      const clientInfo = getClientInfo(request);
      const { accessToken, refreshToken } = generateTokens({
        userId: user.id,
        merchantId: user.merchantId,
        email: user.email,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });

      // Debug: decode tokens to log exp
      const decodedAccess = jwt.decode(accessToken);
      const decodedRefresh = jwt.decode(refreshToken);
      request.log.info({
        accessTokenExp: decodedAccess && typeof decodedAccess === 'object' ? decodedAccess['exp'] : undefined,
        accessTokenExpDate: decodedAccess && typeof decodedAccess === 'object' && decodedAccess['exp'] ? new Date(decodedAccess['exp'] * 1000).toISOString() : undefined,
        refreshTokenExp: decodedRefresh && typeof decodedRefresh === 'object' ? decodedRefresh['exp'] : undefined,
        refreshTokenExpDate: decodedRefresh && typeof decodedRefresh === 'object' && decodedRefresh['exp'] ? new Date(decodedRefresh['exp'] * 1000).toISOString() : undefined,
      }, "Generated token expiration");

      // Store refresh token in database
      await storeRefreshToken(user.id, refreshToken);

      // Set secure HTTP-only cookies
      reply.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60 * 1000, // 15 minutes
      });
      reply.cookie("refresh_token", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return reply.send({
        success: true,
        merchant: {
          id: user.merchantId,
          name: user.merchantName,
          email: user.email,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          details: error.issues,
        });
      }

      request.log.error({ error }, "Login error");
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: "Login failed",
      });
    }
  });
  
  // Logout endpoint
  app.post("/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies?.refresh_token;
    request.log.info({"Refresh token on logout": refreshToken ? `Present, length ${refreshToken.length}` : "Not present"});
    let userId: number | null = null;
    const accessToken = request.cookies?.access_token;
    const db = await getDb();

    // Try to extract userId from access token if present
    if (accessToken) {
      try {
        const decoded = jwt.decode(accessToken) as JWTPayload | null;
        if (decoded && decoded.userId) {
          userId = decoded.userId;
          // Blacklist this access token in DB
          const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
          const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 15 * 60 * 1000);
          await db.insert(revokedAccessTokens).values({
            tokenHash,
            revokedAt: new Date(),
            expiresAt,
          });
        }
      } catch {}
    }

    if (refreshToken) {
      // Revoke current refresh token in database
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, tokenHash));
    }

    // Revoke all refresh tokens for this user (all sessions)
    if (userId) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, userId));
    }
    
    // Aggressively clear cookies with all common domain/path/secure combinations
    const domains = [undefined, "localhost", ".localhost", "127.0.0.1"];
    const paths = ["/", undefined];
    const secures = [process.env.NODE_ENV === "production", false];
    for (const domain of domains) {
      for (const path of paths) {
        for (const secure of secures) {
          const opts = {
            httpOnly: true,
            secure,
            sameSite: 'lax' as const,
            ...(domain ? { domain } : {}),
            ...(path ? { path } : {}),
            expires: new Date(0)
          };
          reply.clearCookie("access_token", opts);
          reply.clearCookie("refresh_token", opts);
          reply.cookie("access_token", "", opts);
          reply.cookie("refresh_token", "", opts);
        }
      }
    }
    console.log("Access token on logout:", request.cookies?.access_token ? `Present, length ${request.cookies.access_token.length}` : "Not present");
    return reply.send({ success: true });
  });
  
  // Get current user
  app.get("/auth/me", async (request, reply) => {
    const accessToken = request.cookies?.access_token;
    console.log("Access token on /auth/me:", accessToken ? `Present, length ${accessToken.length}` : "Not present");
    if (!accessToken) { // Basic length check to avoid processing obviously invalid tokens
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    try {
      // Check if access token is blacklisted in DB
      const db = await getDb();
      const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');
      const now = new Date();
      const [revoked] = await db
        .select()
        .from(revokedAccessTokens)
        .where(and(
          eq(revokedAccessTokens.tokenHash, tokenHash),
          gt(revokedAccessTokens.expiresAt, now)
        ))
        .limit(1);
      if (revoked) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token has been revoked. Please login again.",
        });
      }
      // First, let's decode without verification to see the content
      const decodedUnsafe = jwt.decode(accessToken) as JWTPayload | null;
      request.log.info({ 
        tokenExp: decodedUnsafe?.exp,
        tokenExpDate: decodedUnsafe?.exp ? new Date(decodedUnsafe.exp * 1000).toISOString() : 'none',
        currentTime: Math.floor(Date.now() / 1000),
        currentTimeDate: new Date().toISOString(),
        timeDiff: decodedUnsafe?.exp ? (decodedUnsafe.exp - Math.floor(Date.now() / 1000)) : 'none'
      }, "Token expiration analysis");

      const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTPayload;
      request.log.info({ 
        decodedUserId: decoded.userId,
        decodedExp: decoded.exp,
        currentTime: Math.floor(Date.now() / 1000)
      }, "Token decoded successfully");

      // Validate token context (IP + User Agent)
      const contextValid = validateTokenContext(decoded, request);
      request.log.info({ contextValid }, "Token context validation");

      if (!contextValid) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token context mismatch - please login again",
        });
      }

  // db already declared above

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
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Invalid token",
        });
      }

      // Return user in a consistent format for frontend
      return reply.send({
        user: {
          id: user.id,
          merchantId: user.merchantId,
          email: user.email,
          merchantName: user.merchantName,
          role: "admin", // or fetch from DB if needed
        },
      });
    } catch (error) {
      request.log.error({ error: error instanceof Error ? error.message : error }, "Token verification failed");
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Invalid token",
      });
    }
  });

  // Refresh token endpoint
  app.post("/auth/refresh", async (request, reply) => {
    const refreshToken = request.cookies?.refresh_token;
    
    if (!refreshToken) {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "No refresh token provided",
      });
    }
    
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as JWTPayload;
      
      // Validate token context for refresh token as well
      if (!validateTokenContext(decoded, request)) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token context mismatch - please login again",
        });
      }
      
      // Check if refresh token exists in database and is not revoked
      const db = await getDb();
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      
      const [storedToken] = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tokenHash, tokenHash),
            eq(refreshTokens.userId, decoded.userId),
            isNull(refreshTokens.revokedAt)
          )
        )
        .limit(1);
      
      if (!storedToken || storedToken.expiresAt < new Date()) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Invalid or expired refresh token",
        });
      }
      
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
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "User not found",
        });
      }
      
      // Generate new access token
      const clientInfo = getClientInfo(request);
      const { accessToken } = generateTokens({
        userId: user.id,
        merchantId: user.merchantId,
        email: user.email,
        ipAddress: clientInfo.ipAddress,
        userAgent: clientInfo.userAgent,
      });
      
      // Set new access token cookie
      reply.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60 * 1000, // 15 minutes
      });
      
      return reply.send({
        success: true,
        merchant: {
          id: user.merchantId,
          name: user.merchantName,
          email: user.email,
        },
      });
      
    } catch {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Invalid refresh token",
      });
    }
  });

  // Change password endpoint
  app.post("/auth/change-password", async (request, reply) => {
    const accessToken = request.cookies?.access_token;
    
    if (!accessToken) {
      return reply.status(401).send({
        error: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const ChangePasswordSchema = z.object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z.string().min(8, "New password must be at least 8 characters long"),
    });

    try {
      const decoded = jwt.verify(accessToken, JWT_SECRET) as JWTPayload;
      
      // Validate token context
      if (!validateTokenContext(decoded, request)) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token context mismatch - please login again",
        });
      }

      const { currentPassword, newPassword } = ChangePasswordSchema.parse(request.body);
      
      const db = await getDb();
      
      // Get current user
      const [user] = await db
        .select({
          id: merchantUsers.id,
          passwordHash: merchantUsers.passwordHash,
        })
        .from(merchantUsers)
        .where(eq(merchantUsers.id, decoded.userId))
        .limit(1);
      
      if (!user || !user.passwordHash) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "User not found",
        });
      }
      
      // Verify current password
      const isValidCurrentPassword = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValidCurrentPassword) {
        return reply.status(400).send({
          error: "INVALID_PASSWORD",
          message: "Current password is incorrect",
        });
      }
      
  // Hash new password with standard bcrypt
  const newPasswordHash = await hashPassword(newPassword);
      
      // Update password in database
      await db
        .update(merchantUsers)
        .set({ passwordHash: newPasswordHash })
        .where(eq(merchantUsers.id, user.id));
      
      // Revoke all refresh tokens (force re-login on all devices)
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.userId, user.id));
      
      // Clear current session
      reply.clearCookie("access_token");
      reply.clearCookie("refresh_token");
      
      return reply.send({
        success: true,
        message: "Password changed successfully. Please login again.",
      });
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: "VALIDATION_ERROR",
          details: error.issues,
        });
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Invalid token",
        });
      }
      
      request.log.error({ error }, "Change password error");
      return reply.status(500).send({
        error: "INTERNAL_ERROR",
        message: "Failed to change password",
      });
    }
  });
  
  // Temporary debug endpoint to help with password issues
  app.post("/auth/debug-password", async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };
    
    try {
      const db = await getDb();
      const [user] = await db
        .select({
          id: merchantUsers.id,
          email: merchantUsers.email,
          passwordHash: merchantUsers.passwordHash,
        })
        .from(merchantUsers)
        .where(eq(merchantUsers.email, email))
        .limit(1);
      
      if (!user || !user.passwordHash) {
        return reply.send({ error: "User not found or no password hash" });
      }
      
      // Test password verification (bcrypt only)
      const isValid = await verifyPassword(password, user.passwordHash);
      return reply.send({
        email: user.email,
        passwordHashLength: user.passwordHash.length,
        passwordHashStart: user.passwordHash.substring(0, 20),
        isValid,
        hashContainsDollar: user.passwordHash.includes('$'),
        dollarCount: (user.passwordHash.match(/\$/g) || []).length
      });
    } catch (error) {
      return reply.status(500).send({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
}
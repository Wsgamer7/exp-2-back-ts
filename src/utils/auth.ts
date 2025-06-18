import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db"; // your drizzle instance
import { user, session, account, verification } from "../db/schema";

const BACKEND_URL = process.env.BACKEND_URL!;
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL!;

export const auth = betterAuth({
  socialProviders: {
    google: {
      redirectURI: `${BACKEND_URL}/api/auth/callback/google`,
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: false, // Disable for localhost development
    },
    defaultCookieAttributes: {
      secure: process.env.NODE_ENV === "production", // Only require secure in production
      httpOnly: true,
      sameSite: "lax", // Use lax for local development
      partitioned: false, // Disable for local development
    },
  },
  trustedOrigins: [BETTER_AUTH_URL],

  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
});

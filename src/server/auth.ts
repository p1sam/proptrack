import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "./db";
import { consumeRateLimit } from "./rate-limit";
import { provisionNewUser } from "./services/provision";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  account: { modelName: "authAccount" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    autoSignIn: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 3600, max: 10 },
    },
    customStorage: { consume: consumeRateLimit },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await provisionNewUser(user.id);
        },
      },
    },
  },
  plugins: [nextCookies()],
});

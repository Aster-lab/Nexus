
import CredentialsProvider from "next-auth/providers/credentials";
import type { DefaultSession, NextAuthOptions } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { authenticateLocalCredentials } from "./auth/local-credentials";
import { linkVerifiedOAuthIdentity } from "./auth/oauth-identity";
import { checkCredentialsLoginRateLimit } from "./api/auth-rate-limit";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    nexusUserId?: string;
  }
}

export interface NexusOidcProfile extends Record<string, unknown> {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export interface NexusOidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
}

export function createNexusOidcProvider(config: NexusOidcConfig) {
  const issuerUrl = new URL(config.issuer);
  if (issuerUrl.protocol !== "https:" && issuerUrl.hostname !== "localhost") {
    throw new Error("The OAuth issuer must use HTTPS outside localhost.");
  }
  const issuer = issuerUrl.toString().replace(/\/$/, "");
  return {
    id: "nexus-oidc",
    name: "Organization SSO",
    type: "oauth",
    wellKnown: issuer.endsWith("/.well-known/openid-configuration")
      ? issuer
      : `${issuer}/.well-known/openid-configuration`,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    idToken: true,
    checks: ["pkce", "state"],
    authorization: { params: { scope: "openid email profile" } },
    profile(profile: NexusOidcProfile) {
      return {
        id: profile.sub,
        name: profile.name ?? profile.email ?? null,
        email: profile.email ?? null,
        image: profile.picture ?? null,
      };
    },
  } satisfies OAuthConfig<NexusOidcProfile>;
}

function configuredOidcProvider() {
  const { NEXUS_OIDC_ISSUER: issuer, NEXUS_OIDC_CLIENT_ID: clientId,
    NEXUS_OIDC_CLIENT_SECRET: clientSecret } = process.env;
  if (!issuer || !clientId || !clientSecret) return null;
  return createNexusOidcProvider({ issuer, clientId, clientSecret });
}

const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
    id: "credentials",
    name: "Email and password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) return null;
      if ((await checkCredentialsLoginRateLimit(email)).limited) return null;
      const user = await authenticateLocalCredentials(email, password);
      return user ? { id: user.id, email: user.email, name: user.borrowerProfile?.legalName ?? user.investorProfile?.displayName ?? user.email } : null;
    },
  }),
];
const oidcProvider = configuredOidcProvider();
if (oidcProvider) providers.push(oidcProvider);

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  jwt: { maxAge: 60 * 60 * 8 },
  useSecureCookies: process.env.NODE_ENV === "production",
  providers,
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.type !== "oauth") return account?.provider === "credentials";
      const oidcProfile = profile as NexusOidcProfile | undefined;
      const userId = await linkVerifiedOAuthIdentity({
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        email: user.email ?? oidcProfile?.email,
        emailVerified: oidcProfile?.email_verified === true,
      });
      if (!userId) return false;
      user.id = userId;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.nexusUserId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.nexusUserId === "string") {
        session.user.id = token.nexusUserId;
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function assertDemoDatabase(environment: NodeJS.ProcessEnv = process.env): URL {
  if (environment.DATABASE_ENV !== "demo") {
    throw new Error("DATABASE_ENV must be demo for demo commands.");
  }
  if (environment.NEXUS_DEMO_MODE !== "true") {
    throw new Error("NEXUS_DEMO_MODE must be true for demo commands.");
  }
  if (!environment.DATABASE_URL) {
    throw new Error("DATABASE_URL must be configured for demo commands.");
  }

  let url: URL;
  try {
    url = new URL(environment.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("Demo database must use a loopback host.");
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("DATABASE_URL must contain a valid database name.");
  }
  if (databaseName !== "nexus_demo") {
    throw new Error("Demo commands may only target the nexus_demo database.");
  }
  return url;
}

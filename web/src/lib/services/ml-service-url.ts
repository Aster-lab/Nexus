/**
 * Resolve an endpoint relative to the service URL injected by Vercel's
 * service binding. Relative resolution preserves any internal route prefix
 * Vercel includes in that URL. It also works with local ML_SERVICE_URL values.
 */
export function mlServiceEndpoint(path: "predict" | "recommendations", baseUrl = process.env.ML_SERVICE_URL): URL {
  if (!baseUrl) throw new Error("ML_SERVICE_URL is not configured.");
  const base = new URL(baseUrl);
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
  base.search = "";
  base.hash = "";
  return new URL(path, base);
}

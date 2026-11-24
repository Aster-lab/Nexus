export function mlServiceEndpoint(path: "predict" | "recommendations", baseUrl = process.env.ML_SERVICE_URL): URL {
  if (!baseUrl) throw new Error("ML_SERVICE_URL is not configured.");
  const base = new URL(baseUrl);
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;
  base.search = "";
  base.hash = "";
  return new URL(path, base);
}

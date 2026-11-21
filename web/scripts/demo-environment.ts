import { randomBytes } from "node:crypto";
export { assertDemoDatabase } from "../src/lib/config/demo-environment";

export function createDemoPassword(): string {
  return randomBytes(24).toString("base64url");
}

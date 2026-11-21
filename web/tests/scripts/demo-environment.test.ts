import { describe, expect, it } from "vitest";
import { assertDemoDatabase, createDemoPassword } from "../../scripts/demo-environment";

const demoEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_ENV: "demo",
  DATABASE_URL: "postgresql://nexus_app:secret@127.0.0.1:5432/nexus_demo?schema=public",
  NEXUS_DEMO_MODE: "true",
};
const unsafeConfigurations: Array<[NodeJS.ProcessEnv, RegExp]> = [
  [{ ...demoEnvironment, DATABASE_ENV: "development" }, /DATABASE_ENV must be demo/i],
  [{ ...demoEnvironment, DATABASE_URL: "postgresql://user:secret@127.0.0.1:5432/nexus_dev" }, /nexus_demo database/i],
  [{ ...demoEnvironment, DATABASE_URL: "postgresql://user:secret@db.example.com:5432/nexus_demo" }, /loopback/i],
  [{ ...demoEnvironment, NEXUS_DEMO_MODE: "false" }, /NEXUS_DEMO_MODE must be true/i],
  [{ ...demoEnvironment, DATABASE_URL: "not-a-url" }, /valid PostgreSQL URL/i],
];

describe("isolated NEXUS demo environment", () => {
  it("accepts only the loopback nexus_demo database", () => {
    expect(() => assertDemoDatabase(demoEnvironment)).not.toThrow();
  });

  it.each(unsafeConfigurations)("rejects unsafe configuration %#", (environment, message) => {
    expect(() => assertDemoDatabase(environment)).toThrow(message);
  });

  it("creates fresh high-entropy credentials suitable for one-time display", () => {
    const first = createDemoPassword();
    const second = createDemoPassword();

    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(first).not.toBe(second);
  });
});

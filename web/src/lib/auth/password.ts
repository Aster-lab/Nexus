import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const FALLBACK_SALT = Buffer.from("nexus-invalid-credential-salt-v1");

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters.");
  }
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt);
  return `scrypt$v1$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string | null | undefined,
): Promise<boolean> {
  const parts = encodedHash?.split("$");
  const validEncoding = parts?.length === 4 && parts[0] === "scrypt" && parts[1] === "v1";
  let salt = FALLBACK_SALT;
  let expected = Buffer.alloc(KEY_LENGTH);
  if (validEncoding && parts) {
    try {
      const parsedSalt = Buffer.from(parts[2], "base64url");
      const parsedKey = Buffer.from(parts[3], "base64url");
      if (parsedSalt.length === SALT_LENGTH && parsedKey.length === KEY_LENGTH) {
        salt = parsedSalt;
        expected = parsedKey;
      }
    } catch {
    }
  }
  const actual = await deriveKey(password, salt);
  return Boolean(validEncoding) && timingSafeEqual(actual, expected);
}

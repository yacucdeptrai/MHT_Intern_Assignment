import { PBKDF2_DEFAULT_ITERATIONS, PBKDF2_MAX_ITERATIONS, PBKDF2_MIN_ITERATIONS } from "@pm/domain";

/** Stored as `users.password_hash` (`<salt>.<hash>`, both base64) and `users.password_iterations`. */
export interface PasswordHash {
  hash: string;
  iterations: number;
}

const SALT_BYTES = 16;
const KEY_BITS = 256;

function assertIterations(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < PBKDF2_MIN_ITERATIONS || iterations > PBKDF2_MAX_ITERATIONS) {
    throw new RangeError(
      `PBKDF2 iterations must be an integer from ${PBKDF2_MIN_ITERATIONS} to ${PBKDF2_MAX_ITERATIONS}`,
    );
  }
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, KEY_BITS);
  return new Uint8Array(bits);
}

/** Compares in time independent of where the inputs differ. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

/** Hashes a password with PBKDF2-SHA256 (Web Crypto) and a fresh random salt. */
export async function hashPassword(password: string, iterations = PBKDF2_DEFAULT_ITERATIONS): Promise<PasswordHash> {
  assertIterations(iterations);
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, iterations);
  return { hash: `${toBase64(salt)}.${toBase64(derived)}`, iterations };
}

/** Verifies a password against a stored hash, using the iteration count stored with it. Never throws on bad data. */
export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  try {
    assertIterations(stored.iterations);
    const [saltPart, hashPart, ...extra] = stored.hash.split(".");
    if (saltPart === undefined || hashPart === undefined || extra.length > 0) return false;
    const expected = fromBase64(hashPart);
    const actual = await derive(password, fromBase64(saltPart), stored.iterations);
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** True when the hash was made with fewer iterations than today's default; re-hash after a successful login. */
export function needsRehash(stored: PasswordHash): boolean {
  return stored.iterations < PBKDF2_DEFAULT_ITERATIONS;
}

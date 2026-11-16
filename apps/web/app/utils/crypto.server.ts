const SALT = new TextEncoder().encode("pm-invite-seal-salt-v1");
const INFO = new TextEncoder().encode("pm-invite-seal-key");

async function deriveSealKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: SALT,
      info: INFO,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealInviteToken(token: string, secret: string): Promise<string> {
  const key = await deriveSealKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(token);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext,
  );

  const ivHex = Array.from(iv, (b) => b.toString(16).padStart(2, "0")).join("");
  const cipherHex = Array.from(new Uint8Array(ciphertext), (b) => b.toString(16).padStart(2, "0")).join("");

  return `${ivHex}:${cipherHex}`;
}

export async function unsealInviteToken(sealed: string, secret: string): Promise<string> {
  const [ivHex, cipherHex] = sealed.split(":");
  if (!ivHex || !cipherHex || ivHex.length !== 24) {
    throw new Error("Invalid sealed token format");
  }

  const key = await deriveSealKey(secret);

  const iv = new Uint8Array(ivHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []);
  const ciphertext = new Uint8Array(cipherHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? []);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

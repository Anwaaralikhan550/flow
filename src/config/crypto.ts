import crypto from "node:crypto";
import { env } from "./env.js";

const key = Buffer.from(env.COOKIE_ENCRYPTION_KEY_BASE64, "base64");

if (key.length !== 32) {
  throw new Error("COOKIE_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes.");
}

export type EncryptedValue = {
  ciphertext: string;
  nonce: string;
};

export function encryptCookie(plainText: string): EncryptedValue {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([ciphertext, tag]).toString("base64"),
    nonce: nonce.toString("base64"),
  };
}

export function decryptCookie(value: EncryptedValue): string {
  const nonce = Buffer.from(value.nonce, "base64");
  const data = Buffer.from(value.ciphertext, "base64");
  const tag = data.subarray(data.length - 16);
  const ciphertext = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

export function encryptAesGcm(plain: Buffer, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, data };
}

export function decryptAesGcm(data: Buffer, iv: Buffer, tag: Buffer, key: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]);
  return plain;
}


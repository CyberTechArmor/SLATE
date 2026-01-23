import { randomBytes } from 'crypto';
import argon2 from 'argon2';

const REFRESH_TOKEN_BYTES = 32;

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

export async function hashRefreshToken(token: string): Promise<string> {
  return argon2.hash(token, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

export async function verifyRefreshToken(hash: string, token: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, token);
  } catch {
    return false;
  }
}

export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7); // 7 days
  return expiry;
}

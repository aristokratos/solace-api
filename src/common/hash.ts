import { createHash, createHmac, randomBytes } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const hmac = (secret: string, value: string) => createHmac('sha256', secret).update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * Hash a cleartext password using crypto.scrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Verify a cleartext password against a scrypt hash
 */
export async function verifyPassword(password: string, combinedHash: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [salt, key] = combinedHash.split(':');
    if (!salt || !key) return resolve(false);

    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return resolve(false);
      try {
        const keyBuffer = Buffer.from(key, 'hex');
        resolve(crypto.timingSafeEqual(keyBuffer, derivedKey));
      } catch {
        resolve(false);
      }
    });
  });
}

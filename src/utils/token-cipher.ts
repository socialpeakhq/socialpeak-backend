import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export class TokenCipher {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
    }
  }

  static fromBase64(base64Key: string): TokenCipher {
    return new TokenCipher(Buffer.from(base64Key, 'base64'));
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(cipherText: string): string {
    const [ivB64, authTagB64, dataB64] = cipherText.split(':');
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error('Malformed encrypted token');
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}

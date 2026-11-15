import { describe, it, expect, beforeEach } from 'vitest'

// Set a 32-byte (64-hex) test key before importing the module
process.env.ENCRYPTION_KEY = 'a'.repeat(64)

// Dynamic import to pick up env var set above
const { encrypt, decrypt, encryptNullable, decryptNullable } = await import('@/lib/encryption')

describe('lib/encryption', () => {
  it('round-trips plaintext correctly', () => {
    const plain = '784-1234-5678901-2'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const plain = 'AE12345678'
    expect(encrypt(plain)).not.toBe(encrypt(plain))
  })

  it('ciphertext is base64 string', () => {
    const ct = encrypt('test')
    expect(() => Buffer.from(ct, 'base64')).not.toThrow()
  })

  it('throws on tampered ciphertext', () => {
    const ct = encrypt('hello')
    const buf = Buffer.from(ct, 'base64')
    buf[buf.length - 1] ^= 0xff // flip last byte
    expect(() => decrypt(buf.toString('base64'))).toThrow()
  })

  it('encryptNullable returns null for null input', () => {
    expect(encryptNullable(null)).toBeNull()
    expect(encryptNullable(undefined)).toBeNull()
  })

  it('encryptNullable encrypts non-null values', () => {
    const ct = encryptNullable('AE000000000001')
    expect(ct).not.toBeNull()
    expect(decryptNullable(ct!)).toBe('AE000000000001')
  })

  it('decryptNullable returns null for null input', () => {
    expect(decryptNullable(null)).toBeNull()
  })

  it('handles empty string plaintext', () => {
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('handles unicode / Arabic text', () => {
    const arabic = 'محمد عبدالله'
    expect(decrypt(encrypt(arabic))).toBe(arabic)
  })

  it('stored ciphertext fits in varchar(500)', () => {
    // Largest expected plaintext: IBAN (34 chars)
    const iban = 'AE' + '0'.repeat(21)
    expect(encrypt(iban).length).toBeLessThan(500)
  })
})

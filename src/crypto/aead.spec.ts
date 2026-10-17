import { randomBytes } from 'node:crypto';
import { open, seal } from './aead';

describe('aead', () => {
  const key = randomBytes(32);

  it('round-trips', () => {
    const sealed = seal(key, Buffer.from('dear you'), 'u1:journal.body');
    expect(open(key, sealed, 'u1:journal.body').toString()).toBe('dear you');
  });

  it('uses a fresh IV each time', () => {
    expect(seal(key, Buffer.from('x'), 'a').equals(seal(key, Buffer.from('x'), 'a'))).toBe(false);
  });

  it('rejects a ciphertext moved to another owner or field', () => {
    const sealed = seal(key, Buffer.from('secret'), 'u1:journal.body');
    expect(() => open(key, sealed, 'u2:journal.body')).toThrow();
    expect(() => open(key, sealed, 'u1:letter.body')).toThrow();
  });

  it('rejects tampering', () => {
    const sealed = seal(key, Buffer.from('secret'), 'a');
    sealed[sealed.length - 1] ^= 1;
    expect(() => open(key, sealed, 'a')).toThrow();
  });

  it('rejects the wrong key', () => {
    expect(() => open(randomBytes(32), seal(key, Buffer.from('s'), 'a'), 'a')).toThrow();
  });
});

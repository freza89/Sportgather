import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env.js';
import { DocumentVault, MemoryBlobStore, sniffMime } from './storage.js';

describe('DocumentVault', () => {
  it('menyimpan terenkripsi dan membaca kembali isi aslinya', async () => {
    const store = new MemoryBlobStore();
    const vault = new DocumentVault(loadEnv({ NODE_ENV: 'test' }), store);
    const plain = Buffer.from('akta kelahiran Alya Kusuma — NIK 3273xxxxxxxx');
    const { storageKey, sha256 } = await vault.save('org-1', plain);
    const raw = store.objects.get(storageKey)!;
    expect(raw.includes(plain)).toBe(false);
    expect(raw.toString('latin1')).not.toContain('Alya');
    expect(await vault.read(storageKey)).toEqual(plain);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('isi yang diubah di storage ditolak (GCM auth tag)', async () => {
    const store = new MemoryBlobStore();
    const vault = new DocumentVault(loadEnv({ NODE_ENV: 'test' }), store);
    const { storageKey } = await vault.save('org-1', Buffer.from('dokumen'));
    const raw = store.objects.get(storageKey)!;
    raw[raw.length - 1] = raw[raw.length - 1]! ^ 0xff;
    await expect(vault.read(storageKey)).rejects.toThrow();
  });
});

describe('sniffMime', () => {
  it('mengenali JPG, PNG, PDF dari isi file', () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe('image/jpeg');
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe(
      'image/png',
    );
    expect(sniffMime(Buffer.from('%PDF-1.7'))?.mime).toBe('application/pdf');
  });

  it('menolak tipe lain walau namanya .jpg', () => {
    expect(sniffMime(Buffer.from('<html>bukan gambar</html>'))).toBeNull();
    expect(sniffMime(Buffer.from('MZ\x90\x00'))).toBeNull();
  });
});

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

/** Penyimpanan objek mentah (sudah terenkripsi). */
export interface BlobStore {
  put(key: string, body: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const BLOB_STORE = Symbol('BLOB_STORE');

export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async get(key: string) {
    const v = this.objects.get(key);
    if (!v) throw new Error(`Objek tidak ada: ${key}`);
    return v;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

export class S3BlobStore implements BlobStore, OnModuleInit {
  private readonly logger = new Logger('S3BlobStore');
  private readonly client: S3Client;

  constructor(private readonly env: Env) {
    this.client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.env.S3_BUCKET }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.env.S3_BUCKET }));
      this.logger.log(`Bucket ${this.env.S3_BUCKET} dibuat`);
    }
  }

  async put(key: string, body: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.env.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
      }),
    );
  }

  async get(key: string) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.env.S3_BUCKET, Key: key }));
  }
}

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'application/pdf',
    ext: 'pdf',
    test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
];

/** Tipe file dideteksi dari isi (magic bytes), bukan dari nama/ekstensi kiriman klien. */
export function sniffMime(buffer: Buffer): { mime: string; ext: string } | null {
  const hit = SIGNATURES.find((s) => s.test(buffer));
  return hit ? { mime: hit.mime, ext: hit.ext } : null;
}

/**
 * Dokumen anak dienkripsi di aplikasi (AES-256-GCM) sebelum masuk object storage,
 * sehingga berkas di bucket tidak terbaca tanpa kunci aplikasi (PRD bagian 8).
 * Format objek: iv(12) ‖ tag(16) ‖ ciphertext.
 */
@Injectable()
export class DocumentVault {
  private readonly key: Buffer;

  constructor(
    @Inject(ENV) env: Env,
    @Inject(BLOB_STORE) private readonly store: BlobStore,
  ) {
    this.key = Buffer.from(env.DOCUMENT_ENCRYPTION_KEY, 'base64');
  }

  async save(orgId: string, plain: Buffer): Promise<{ storageKey: string; sha256: string }> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const storageKey = `orgs/${orgId}/documents/${crypto.randomUUID()}`;
    await this.store.put(storageKey, Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
    return { storageKey, sha256: createHash('sha256').update(plain).digest('hex') };
  }

  async remove(storageKey: string): Promise<void> {
    await this.store.delete(storageKey);
  }

  async read(storageKey: string): Promise<Buffer> {
    const blob = await this.store.get(storageKey);
    const decipher = createDecipheriv('aes-256-gcm', this.key, blob.subarray(0, 12));
    decipher.setAuthTag(blob.subarray(12, 28));
    return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
  }
}

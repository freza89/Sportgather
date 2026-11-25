import { PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { document, type Tx } from '@sportgather/db';
import type { DocumentDto } from '@sportgather/shared';
import type { UploadedFile } from '../common/multipart.js';
import { DocumentVault, MAX_DOCUMENT_BYTES, sniffMime } from '../storage/storage.js';

/** Validasi & simpan dokumen terenkripsi; mengembalikan id dokumen. */
export async function storeDocument(
  tx: Tx,
  vault: DocumentVault,
  input: {
    orgId: string;
    personId: string;
    uploadedBy: string;
    kind: 'akta' | 'kia' | 'kk' | 'foto';
    file: UploadedFile;
  },
): Promise<string> {
  if (input.file.buffer.length === 0) throw new UnprocessableEntityException('File kosong');
  if (input.file.buffer.length > MAX_DOCUMENT_BYTES)
    throw new PayloadTooLargeException('Ukuran file maksimal 5 MB');
  const type = sniffMime(input.file.buffer);
  if (!type || (input.kind === 'foto' && type.mime === 'application/pdf')) {
    throw new UnprocessableEntityException('Format file harus JPG, PNG, atau PDF');
  }
  const { storageKey, sha256 } = await vault.save(input.orgId, input.file.buffer);
  const id = crypto.randomUUID();
  await tx.insert(document).values({
    id,
    orgId: input.orgId,
    personId: input.personId,
    kind: input.kind,
    storageKey,
    fileName: safeFileName(input.file.filename, type.ext),
    mimeType: type.mime,
    sizeBytes: input.file.buffer.length,
    sha256,
    uploadedBy: input.uploadedBy,
  });
  return id;
}

function safeFileName(name: string, ext: string): string {
  const base =
    (name || 'dokumen')
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .slice(0, 60) || 'dokumen';
  return `${base}.${ext}`;
}

export function toDocumentDto(d: typeof document.$inferSelect): DocumentDto {
  return {
    id: d.id,
    kind: d.kind,
    fileName: d.fileName,
    mimeType: d.mimeType,
    status: d.status,
    rejectionReason: d.rejectionReason,
    createdAt: d.createdAt.toISOString(),
  };
}

/** Status dokumen usia pemain (akta/KIA/KK; foto tidak dihitung). */
export function docStatusOf(
  docs: { kind: string; status: string }[],
): 'verified' | 'pending' | 'rejected' | 'missing' {
  const age = docs.filter((d) => d.kind === 'akta' || d.kind === 'kia' || d.kind === 'kk');
  if (age.some((d) => d.status === 'verified')) return 'verified';
  if (age.some((d) => d.status === 'pending')) return 'pending';
  if (age.some((d) => d.status === 'rejected')) return 'rejected';
  return 'missing';
}

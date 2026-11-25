import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import type { AppRequest } from './request.js';

export interface UploadedFile {
  fieldname: string;
  filename: string;
  buffer: Buffer;
}

/** Baca form multipart (JSON di field `data` + berkas). Batas ukuran diatur saat register plugin. */
export async function readMultipart(
  req: AppRequest,
): Promise<{ data: unknown; files: Map<string, UploadedFile> }> {
  if (!req.isMultipart()) throw new BadRequestException('Kirim sebagai multipart/form-data');
  const files = new Map<string, UploadedFile>();
  let data: unknown = undefined;
  try {
    for await (const part of req.parts()) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.file.truncated) throw new PayloadTooLargeException('Ukuran file maksimal 5 MB');
        files.set(part.fieldname, { fieldname: part.fieldname, filename: part.filename, buffer });
      } else if (part.fieldname === 'data') {
        data = JSON.parse(String(part.value));
      }
    }
  } catch (e) {
    if (e instanceof PayloadTooLargeException) throw e;
    if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE')
      throw new PayloadTooLargeException('Ukuran file maksimal 5 MB');
    if (e instanceof SyntaxError) throw new BadRequestException('Data formulir tidak valid');
    throw e;
  }
  return { data, files };
}

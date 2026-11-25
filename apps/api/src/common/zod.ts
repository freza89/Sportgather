import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z } from 'zod';

/** Validasi body/query dengan skema Zod dari @sportgather/shared. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: result.error.issues[0]?.message ?? 'Data tidak valid',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

/** Dokumentasi OpenAPI dari skema Zod yang sama. */
export function ApiZodBody(schema: z.ZodType) {
  return ApiBody({
    schema: z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as object,
  });
}

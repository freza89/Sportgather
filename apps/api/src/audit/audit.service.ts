import { Injectable } from '@nestjs/common';
import { auditLog, type Tx } from '@sportgather/db';

export interface AuditEntry {
  orgId: string;
  actorPersonId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Audit log append-only (PRD bagian 7–8). Ditulis di transaksi yang sama dengan
 * perubahan datanya sehingga tidak ada aksi sensitif tanpa jejak.
 * Jangan menaruh NIK, nomor rekening lengkap, atau token di `meta`.
 */
@Injectable()
export class AuditService {
  async log(tx: Tx, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLog).values({
      orgId: entry.orgId,
      actorPersonId: entry.actorPersonId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  }
}

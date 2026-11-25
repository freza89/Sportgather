import { Inject, Injectable } from '@nestjs/common';
import { userAccount, withContext, type Database, type Tx } from '@sportgather/db';
import { inArray, sql } from 'drizzle-orm';
import { DB } from '../db/db.module.js';
import { WHATSAPP_SENDER, type MessageSender } from '../integrations/messaging.js';
import { PUSH_SENDER, type PushPayload, type PushSender } from '../integrations/push.js';

export interface Recipient {
  personId: string;
  phone: string | null;
  notifyWhatsapp: boolean;
}

export interface Notification<R extends Recipient = Recipient> {
  whatsapp?: { template: string; params: (r: R) => Record<string, string> };
  push?: (r: R) => PushPayload;
  /**
   * Pesan transaksional (kuitansi, OTP, perubahan jadwal mendadak) tetap dikirim lewat WhatsApp
   * walau wali mematikan notifikasi WhatsApp non-wajib (O-08).
   */
  essential?: boolean;
}

/**
 * Satu pintu kirim notifikasi (PRD bagian 16): WhatsApp (template Meta) + Web Push bagi yang
 * sudah memasang PWA. Langganan push yang kedaluwarsa dihapus otomatis.
 */
@Injectable()
export class NotifierService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: MessageSender,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
  ) {}

  get pushPublicKey() {
    return this.push.publicKey;
  }

  /** Nomor & preferensi WhatsApp untuk sekumpulan orang. */
  async recipients(tx: Tx, personIds: string[]): Promise<Map<string, Recipient>> {
    if (!personIds.length) return new Map();
    const rows = await tx
      .select({
        personId: userAccount.personId,
        phone: userAccount.phone,
        notifyWhatsapp: userAccount.notifyWhatsapp,
      })
      .from(userAccount)
      .where(inArray(userAccount.personId, [...new Set(personIds)]));
    return new Map(rows.map((r) => [r.personId, r]));
  }

  async send<R extends Recipient>(
    recipients: R[],
    n: Notification<R>,
  ): Promise<Map<string, { whatsapp: boolean; push: boolean }>> {
    const out = new Map<string, { whatsapp: boolean; push: boolean }>();
    for (const r of recipients) out.set(r.personId, { whatsapp: false, push: false });
    if (n.whatsapp) {
      for (const r of recipients) {
        if (!r.phone || (!n.essential && !r.notifyWhatsapp)) continue;
        await this.whatsapp.send({
          channel: 'whatsapp',
          to: r.phone,
          template: n.whatsapp.template,
          params: n.whatsapp.params(r),
        });
        out.get(r.personId)!.whatsapp = true;
      }
    }
    if (n.push && recipients.length) {
      const byPerson = new Map(recipients.map((r) => [r.personId, r]));
      const targets = await withContext(this.db, {}, (tx) =>
        tx.execute<{
          id: string;
          person_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
        }>(
          sql`select id, person_id, endpoint, p256dh, auth from sg_push_targets(ARRAY[${sql.join(
            [...byPerson.keys()].map((id) => sql`${id}`),
            sql`, `,
          )}]::uuid[])`,
        ),
      );
      for (const t of targets) {
        const result = await this.push.send(t, n.push(byPerson.get(t.person_id)!));
        if (result !== 'error')
          await withContext(this.db, {}, (tx) =>
            tx.execute(sql`select sg_push_result(${t.id}::uuid, ${result === 'ok'})`),
          );
        if (result === 'ok') out.get(t.person_id)!.push = true;
      }
    }
    return out;
  }
}

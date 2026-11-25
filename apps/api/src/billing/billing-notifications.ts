import { Inject, Injectable } from '@nestjs/common';
import {
  guardianLink,
  invoice,
  membership,
  notificationLog,
  organization,
  person,
  staffRole,
  withContext,
  withTenant,
  type Database,
  type Tx,
} from '@sportgather/db';
import { formatRupiah, formatRupiahRingkas } from '@sportgather/shared';
import { and, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { DB } from '../db/db.module.js';
import { NotifierService, type Recipient } from '../notifications/notifier.js';
import { todayIso } from '../seasons/ku-context.js';

const jakartaHour = (d: Date) =>
  Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(d),
  );
const jakartaWeekday = (d: Date) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(d);

/** Sisa matriks notifikasi iuran (PRD bagian 16) yang tidak dikirim saat transaksi terjadi. */
@Injectable()
export class BillingNotifications {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly notifier: NotifierService,
  ) {}

  private async orgIds() {
    return (
      await withContext(this.db, {}, (tx) =>
        tx.execute<{ id: string }>(sql`select sg_all_org_ids() as id`),
      )
    ).map((r) => r.id);
  }

  /** Klaim kunci dedupe; false bila sudah pernah dikirim. */
  private async claim(
    tx: Tx,
    orgId: string,
    key: string,
    template: string,
    personId: string | null,
  ) {
    const rows = await tx
      .insert(notificationLog)
      .values({ orgId, dedupeKey: key, template, recipientPersonId: personId })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id });
    return rows.length > 0;
  }

  /** "Tagihan terbit" pukul 09.00: satu pesan gabungan per wali (beberapa anak/tagihan). */
  async invoicesIssued(now = new Date()): Promise<{ sent: number }> {
    const h = jakartaHour(now);
    if (h < 9 || h >= 21) return { sent: 0 };
    const today = todayIso(now);
    let sent = 0;
    for (const orgId of await this.orgIds()) {
      const batch = await withTenant(this.db, orgId, undefined, async (tx) => {
        const rows = await tx
          .select({
            inv: invoice,
            childName: person.fullName,
            guardianId: guardianLink.guardianPersonId,
            org: organization.name,
          })
          .from(invoice)
          .innerJoin(membership, eq(membership.id, invoice.membershipId))
          .innerJoin(person, eq(person.id, membership.personId))
          .innerJoin(
            guardianLink,
            and(
              eq(guardianLink.childPersonId, membership.personId),
              eq(guardianLink.isPrimary, true),
            ),
          )
          .innerJoin(organization, eq(organization.id, invoice.orgId))
          // Hanya tagihan yang terbit 3 hari terakhir (tidak mengirim ulang tumpukan lama).
          .where(
            and(
              eq(invoice.status, 'unpaid'),
              lte(invoice.issueDate, today),
              gte(invoice.issueDate, sql`(${today}::date - 3)`),
            ),
          );
        const per = new Map<string, { org: string; lines: string[]; total: number }>();
        for (const r of rows) {
          if (
            !(await this.claim(
              tx,
              orgId,
              `invoice-issued:${r.inv.id}`,
              'tagihan_terbit',
              r.guardianId,
            ))
          )
            continue;
          const g = per.get(r.guardianId) ?? { org: r.org, lines: [], total: 0 };
          g.lines.push(`${r.childName}: ${r.inv.description} ${formatRupiah(r.inv.total)}`);
          g.total += r.inv.total;
          per.set(r.guardianId, g);
        }
        const info = await this.notifier.recipients(tx, [...per.keys()]);
        return [...per].map(([personId, g]) => ({
          personId,
          phone: info.get(personId)?.phone ?? null,
          notifyWhatsapp: info.get(personId)?.notifyWhatsapp ?? true,
          ...g,
        }));
      });
      if (!batch.length) continue;
      await this.notifier.send(batch, {
        whatsapp: {
          template: 'tagihan_terbit',
          params: (r) => ({
            klub: r.org,
            rincian: r.lines.join('\n'),
            total: formatRupiah(r.total),
            link: `${this.env.WEB_ORIGIN}/wali/tagihan`,
          }),
        },
        push: (r) => ({
          title: 'Tagihan baru',
          body: `${r.org}: ${formatRupiah(r.total)}`,
          url: '/wali/tagihan',
          tag: 'tagihan',
        }),
      });
      sent += batch.length;
    }
    return { sent };
  }

  /** Ringkasan tagihan terlambat ke owner & admin tiap Senin pukul 09.00. */
  async weeklyOverdueSummary(now = new Date()): Promise<{ sent: number }> {
    if (jakartaWeekday(now) !== 'Mon' || jakartaHour(now) < 9 || jakartaHour(now) >= 21)
      return { sent: 0 };
    const today = todayIso(now);
    let sent = 0;
    for (const orgId of await this.orgIds()) {
      const batch = await withTenant(this.db, orgId, undefined, async (tx) => {
        const [o] = await tx
          .select({
            n: sql<number>`count(*)::int`,
            amount: sql<string>`coalesce(sum(${invoice.total}), 0)::text`,
          })
          .from(invoice)
          .where(and(eq(invoice.status, 'unpaid'), lt(invoice.dueDate, today)));
        if (!Number(o?.n)) return null;
        if (!(await this.claim(tx, orgId, `overdue-summary:${today}`, 'ringkasan_terlambat', null)))
          return null;
        const [org] = await tx
          .select({ name: organization.name, slug: organization.slug })
          .from(organization)
          .where(eq(organization.id, orgId));
        const staff = await tx
          .select({ personId: staffRole.personId })
          .from(staffRole)
          .where(and(inArray(staffRole.role, ['owner', 'admin']), eq(staffRole.status, 'active')));
        const info = await this.notifier.recipients(
          tx,
          staff.map((s) => s.personId),
        );
        return {
          org: org!,
          n: Number(o!.n),
          amount: Number(o!.amount),
          list: [...info.values()] as Recipient[],
        };
      });
      if (!batch) continue;
      await this.notifier.send(batch.list, {
        essential: true,
        whatsapp: {
          template: 'ringkasan_terlambat',
          params: () => ({
            klub: batch.org.name,
            jumlah: String(batch.n),
            nominal: formatRupiahRingkas(batch.amount),
            link: `${this.env.WEB_ORIGIN}/admin/${batch.org.slug}/iuran?status=overdue`,
          }),
        },
      });
      sent += batch.list.length;
    }
    return { sent };
  }

  /** "Dana tersalurkan / gagal" ke owner yang meminta (WhatsApp). */
  async withdrawalResult(
    orgId: string,
    ownerPersonId: string,
    r: { status: string; net: number; failureReason: string | null },
  ) {
    const info = await withTenant(this.db, orgId, undefined, (tx) =>
      this.notifier.recipients(tx, [ownerPersonId]),
    );
    const owner = info.get(ownerPersonId);
    if (!owner) return;
    await this.notifier.send([owner], {
      essential: true,
      whatsapp: {
        template: 'penyaluran_dana',
        params: () => ({
          status:
            r.status === 'completed' ? 'berhasil' : r.status === 'failed' ? 'gagal' : 'diproses',
          nominal: formatRupiah(r.net),
          keterangan: r.failureReason ?? '-',
        }),
      },
    });
  }

  /** Push "pembayaran berhasil" pendamping WhatsApp kuitansi. */
  async paidPush(guardianPersonId: string, gross: number, checkoutId: string) {
    await this.notifier.send([{ personId: guardianPersonId, phone: null, notifyWhatsapp: false }], {
      push: () => ({
        title: 'Pembayaran berhasil',
        body: `${formatRupiah(gross)} diterima. Kuitansi tersedia.`,
        url: `/wali/bayar/${checkoutId}`,
        tag: `paid-${checkoutId}`,
      }),
    });
  }
}

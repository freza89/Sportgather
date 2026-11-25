import { Inject, Injectable } from '@nestjs/common';
import { withTenant, type Database, type Tx } from '@sportgather/db';
import {
  daysOverdue,
  formatTimeRange,
  isZonaWaktu,
  kuFor,
  kuLabel,
  periodLabel,
  type DashboardDto,
  type ReportPeriodSchema,
  type RevenueReport,
  type ZonaWaktu,
} from '@sportgather/shared';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { AuthUser, OrgContext } from '../common/request.js';
import { DB } from '../db/db.module.js';
import { loadKuContext, todayIso } from '../seasons/ku-context.js';

export interface Period {
  from: string;
  to: string;
  label: string;
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fmtD = (d: string) =>
  `${Number(d.slice(8, 10))} ${BULAN[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const start = (d: string) => `${d}T00:00:00+07:00`;
const end = (d: string) => `${d}T23:59:59.999+07:00`;

export interface Summary {
  period: Period;
  activePlayers: number;
  newPlayers: number;
  attendance: { pct: number | null; hadir: number; total: number };
  billing: { billed: number; paid: number; pct: number; billedCount: number; paidCount: number };
  overdue: { count: number; amount: number };
}

/**
 * Dashboard (A-17) dan laporan (A-18) memakai fungsi agregasi yang SAMA sehingga angkanya
 * identik untuk periode yang sama (US-18). Data dihitung langsung dari database (selalu ≤15 menit).
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async resolvePeriod(
    tx: Tx,
    q: z.output<typeof ReportPeriodSchema>,
    today = todayIso(),
  ): Promise<Period> {
    const month = today.slice(0, 7);
    if (q.preset === 'custom' && q.from && q.to)
      return { from: q.from, to: q.to, label: `${fmtD(q.from)} – ${fmtD(q.to)}` };
    if (q.preset === '3months') {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(Date.UTC(y!, m! - 3, 1));
      const from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
      return { from, to: today, label: `${periodLabel(from.slice(0, 7))} – ${periodLabel(month)}` };
    }
    if (q.preset === 'season') {
      const [s] = await tx.execute<{ name: string; starts_on: string; ends_on: string }>(
        sql`select name, starts_on::text, ends_on::text from season where status = 'active' limit 1`,
      );
      if (s) return { from: s.starts_on, to: s.ends_on < today ? s.ends_on : today, label: s.name };
    }
    return { from: `${month}-01`, to: today, label: periodLabel(month) };
  }

  async summary(tx: Tx, p: Period): Promise<Summary> {
    const [players] = await tx.execute<{ active: number; fresh: number }>(sql`
      select count(*) filter (where status = 'active')::int as active,
        count(*) filter (where status = 'active' and joined_at >= ${start(p.from)}::timestamptz
          and joined_at <= ${end(p.to)}::timestamptz)::int as fresh
      from membership`);
    const [att] = await tx.execute<{ hadir: number; total: number }>(sql`
      select count(*) filter (where a.status = 'hadir')::int as hadir, count(*)::int as total
      from attendance a join event e on e.id = a.event_id
      where e.status = 'scheduled' and e.starts_at between ${start(p.from)}::timestamptz and ${end(p.to)}::timestamptz`);
    const [bill] = await tx.execute<{
      billed: string;
      paid: string;
      billed_n: number;
      paid_n: number;
    }>(sql`
      select coalesce(sum(total), 0)::text as billed,
        coalesce(sum(total) filter (where status = 'paid'), 0)::text as paid,
        count(*)::int as billed_n, count(*) filter (where status = 'paid')::int as paid_n
      from invoice where status in ('unpaid', 'paid') and issue_date between ${p.from}::date and ${p.to}::date`);
    const [over] = await tx.execute<{ n: number; amount: string }>(sql`
      select count(*)::int as n, coalesce(sum(total), 0)::text as amount
      from invoice where status = 'unpaid' and due_date < ${p.to}::date`);
    const billed = Number(bill?.billed ?? 0);
    const paid = Number(bill?.paid ?? 0);
    const hadir = Number(att?.hadir ?? 0);
    const total = Number(att?.total ?? 0);
    return {
      period: p,
      activePlayers: Number(players?.active ?? 0),
      newPlayers: Number(players?.fresh ?? 0),
      attendance: { pct: total ? Math.round((hadir / total) * 100) : null, hadir, total },
      billing: {
        billed,
        paid,
        pct: billed ? Math.round((paid / billed) * 100) : 0,
        billedCount: Number(bill?.billed_n ?? 0),
        paidCount: Number(bill?.paid_n ?? 0),
      },
      overdue: { count: Number(over?.n ?? 0), amount: Number(over?.amount ?? 0) },
    };
  }

  /** KU tiap pemain aktif (dari tanggal lahir & acuan KU musim, sama dengan A-06). */
  private async kuByMembership(
    tx: Tx,
  ): Promise<{ map: Map<string, number | null>; reference: string; groups: number[] }> {
    const kc = await loadKuContext(tx);
    const rows = await tx.execute<{ id: string; birth_date: string | null }>(sql`
      select m.id, p.birth_date::text from membership m join person p on p.id = m.person_id
      where m.status in ('active', 'on_leave', 'left')`);
    return {
      map: new Map(
        rows.map((r) => [
          r.id,
          r.birth_date ? kuFor(r.birth_date, kc.referenceDate, kc.config) : null,
        ]),
      ),
      reference: kc.referenceSource,
      groups: [...kc.config.groups],
    };
  }

  // ── A-17 ───────────────────────────────────────────────────────────────────

  dashboard(ctx: OrgContext, user: AuthUser, now = new Date()): Promise<DashboardDto> {
    return withTenant(this.db, ctx.id, user.personId, async (tx) => {
      const today = todayIso(now);
      const p = await this.resolvePeriod(tx, { preset: 'month' }, today);
      const s = await this.summary(tx, p);
      const ku = await this.kuByMembership(tx);
      const active = await tx.execute<{ id: string }>(
        sql`select id from membership where status = 'active'`,
      );
      const perKu = new Map<number | null, number>();
      for (const r of active) {
        const k = ku.map.get(r.id) ?? null;
        perKu.set(k, (perKu.get(k) ?? 0) + 1);
      }
      const playersPerKu = [...ku.groups, null]
        .map((k) => ({ ku: k, count: perKu.get(k) ?? 0 }))
        .filter((x) => x.ku !== null || x.count > 0);

      const [docs] = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from membership where status = 'pending'`,
      );
      const [missed] = await tx.execute<{ n: number; names: string | null }>(sql`
        select count(*)::int as n, string_agg(distinct t.name, ', ') as names
        from event e join team t on t.id = e.team_id
        where e.status = 'scheduled' and e.ends_at < ${now.toISOString()}::timestamptz
          and e.starts_at >= ${new Date(now.getTime() - 7 * 86_400_000).toISOString()}::timestamptz
          and not exists (select 1 from attendance a where a.event_id = e.id)`);
      const [bal] = await tx.execute<{ available: string }>(sql`
        select coalesce(sum(amount) filter (where available_at <= ${now.toISOString()}::timestamptz), 0)::text as available
        from ledger_entry`);
      const [dreq] = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from data_request where status = 'pending'`,
      );
      const base = `/admin/${ctx.slug}`;
      const actions: DashboardDto['actions'] = [];
      if (Number(docs?.n))
        actions.push({
          kind: 'documents',
          count: Number(docs!.n),
          text: `${docs!.n} pendaftar menunggu verifikasi`,
          sub: 'Cek dokumen usia',
          href: `${base}/pemain/verifikasi`,
        });
      if (s.overdue.count)
        actions.push({
          kind: 'overdue',
          count: s.overdue.count,
          amount: s.overdue.amount,
          text: `${s.overdue.count} tagihan terlambat`,
          sub: 'Pengingat H+3 & H+7 terkirim otomatis',
          href: `${base}/iuran?status=overdue`,
        });
      if (Number(missed?.n))
        actions.push({
          kind: 'attendance',
          count: Number(missed!.n),
          text: `${missed!.n} sesi belum diabsen`,
          sub: missed!.names ?? '',
          href: `${base}/jadwal`,
        });
      const available = Number(bal?.available ?? 0);
      if (available > 0)
        actions.push({
          kind: 'payout',
          count: 1,
          amount: available,
          text: 'Dana siap ditarik',
          sub: 'Penarikan manual oleh owner',
          href: `${base}/penyaluran`,
        });
      if (Number(dreq?.n))
        actions.push({
          kind: 'data_requests',
          count: Number(dreq!.n),
          text: `${dreq!.n} permintaan hapus data`,
          sub: 'Dari wali (O-08)',
          href: `${base}/pengaturan/data`,
        });

      const events = await tx.execute<{
        id: string;
        starts_at: Date;
        ends_at: Date;
        status: string;
        team_id: string;
        team_name: string;
        ku: number;
        tz: string | null;
        location: string | null;
        players: number;
        coaches: string | null;
        hadir: number;
        izin: number;
        sakit: number;
        taken: boolean;
      }>(sql`
        select e.id, e.starts_at, e.ends_at, e.status, t.id as team_id, t.name as team_name, t.ku,
          b.timezone as tz, coalesce(b.name, e.location_note) as location,
          (select count(*)::int from team_member tm join membership m on m.id = tm.membership_id
            where tm.team_id = t.id and tm.left_at is null and m.status = 'active') as players,
          (select string_agg(p.full_name, ', ') from team_staff ts join staff_role sr on sr.id = ts.staff_role_id
            join person p on p.id = sr.person_id where ts.team_id = t.id and sr.status = 'active') as coaches,
          (select count(*)::int from rsvp r where r.event_id = e.id and r.status = 'hadir') as hadir,
          (select count(*)::int from rsvp r where r.event_id = e.id and r.status = 'izin') as izin,
          (select count(*)::int from rsvp r where r.event_id = e.id and r.status = 'sakit') as sakit,
          exists (select 1 from attendance a where a.event_id = e.id) as taken
        from event e join team t on t.id = e.team_id
        left join branch b on b.id = coalesce(e.branch_id, t.branch_id)
        where e.starts_at between ${start(today)}::timestamptz - interval '2 hours'
          and ${end(today)}::timestamptz + interval '2 hours'
        order by e.starts_at`);
      const zone = (tz: string | null): ZonaWaktu => (tz && isZonaWaktu(tz) ? tz : 'Asia/Jakarta');
      const todayEvents = events
        .filter((e) => todayIso(new Date(e.starts_at)) === today || zone(e.tz) !== 'Asia/Jakarta')
        .map((e) => {
          const st = new Date(e.starts_at);
          const en = new Date(e.ends_at);
          return {
            eventId: e.id,
            time: formatTimeRange(st, en, zone(e.tz)),
            teamName: e.team_name,
            ku: e.ku,
            playerCount: Number(e.players),
            coaches: e.coaches ? e.coaches.split(', ') : [],
            location: e.location,
            rsvp: { hadir: Number(e.hadir), izin: Number(e.izin), sakit: Number(e.sakit) },
            attendanceTaken: Boolean(e.taken),
            status:
              e.status === 'cancelled'
                ? ('cancelled' as const)
                : now < st
                  ? ('upcoming' as const)
                  : now <= en
                    ? ('running' as const)
                    : ('done' as const),
          };
        });
      return {
        period: p,
        activePlayers: { total: s.activePlayers, newThisMonth: s.newPlayers },
        attendance30d: { pct: s.attendance.pct, target: 85 },
        billing: {
          period: p.label,
          billed: s.billing.billed,
          paid: s.billing.paid,
          pct: s.billing.pct,
        },
        overdue: s.overdue,
        playersPerKu,
        kuReference: ku.reference,
        actions,
        today: todayEvents,
        generatedAt: now.toISOString(),
      };
    });
  }

  // ── A-18 ───────────────────────────────────────────────────────────────────

  async withPeriod<T>(
    ctx: OrgContext,
    user: AuthUser,
    q: z.output<typeof ReportPeriodSchema>,
    fn: (tx: Tx, p: Period) => Promise<T>,
  ) {
    return withTenant(this.db, ctx.id, user.personId, async (tx) =>
      fn(tx, await this.resolvePeriod(tx, q)),
    );
  }

  /** Piutang: tagihan belum lunas yang terbit s.d. akhir periode. */
  async receivables(tx: Tx, p: Period) {
    const rows = await tx.execute<{
      number: string;
      player: string;
      team: string | null;
      description: string;
      issue_date: string;
      due_date: string;
      total: string;
      guardian: string | null;
      phone: string | null;
    }>(sql`
      select i.number, p.full_name as player, t.name as team, i.description, i.issue_date::text, i.due_date::text,
        i.total::text, g.full_name as guardian, ua.phone
      from invoice i
      join membership m on m.id = i.membership_id
      join person p on p.id = m.person_id
      left join team_member tm on tm.membership_id = m.id and tm.left_at is null
      left join team t on t.id = tm.team_id
      left join guardian_link gl on gl.child_person_id = m.person_id and gl.is_primary
      left join person g on g.id = gl.guardian_person_id
      left join user_account ua on ua.person_id = gl.guardian_person_id
      where i.status = 'unpaid' and i.issue_date <= ${p.to}::date
      order by i.due_date, p.full_name`);
    return rows.map((r) => ({
      number: r.number,
      player: r.player,
      team: r.team,
      description: r.description,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      overdueDays: daysOverdue(r.due_date, p.to),
      total: Number(r.total),
      guardian: r.guardian,
      phone: r.phone,
    }));
  }

  /** Pendapatan per KU per bulan (pembayaran lunas, online + manual, menurut tanggal bayar). */
  async revenue(tx: Tx, p: Period): Promise<RevenueReport> {
    const ku = await this.kuByMembership(tx);
    const rows = await tx.execute<{ membership_id: string; month: string; amount: string }>(sql`
      select i.membership_id, to_char(pay.paid_at at time zone 'Asia/Jakarta', 'YYYY-MM') as month,
        sum(pay.amount)::text as amount
      from payment pay join invoice i on i.id = pay.invoice_id
      where pay.paid_at between ${start(p.from)}::timestamptz and ${end(p.to)}::timestamptz
      group by 1, 2`);
    const months: string[] = [];
    for (let m = p.from.slice(0, 7); m <= p.to.slice(0, 7);) {
      months.push(m);
      const [y, mm] = m.split('-').map(Number);
      m = mm === 12 ? `${y! + 1}-01` : `${y}-${String(mm! + 1).padStart(2, '0')}`;
    }
    const table = new Map<number | null, number[]>();
    for (const r of rows) {
      const k = ku.map.get(r.membership_id) ?? null;
      const arr = table.get(k) ?? months.map(() => 0);
      arr[months.indexOf(r.month)]! += Number(r.amount);
      table.set(k, arr);
    }
    const out = [...table]
      .sort(([a], [b]) => (a ?? 99) - (b ?? 99))
      .map(([k, perMonth]) => ({ ku: k, perMonth, total: perMonth.reduce((a, b) => a + b, 0) }));
    const totals = months.map((_, i) => out.reduce((a, r) => a + r.perMonth[i]!, 0));
    return { months, rows: out, totals, grandTotal: totals.reduce((a, b) => a + b, 0) };
  }

  async attendance(tx: Tx, p: Period) {
    const rows = await tx.execute<{
      team: string;
      ku: number;
      sessions: number;
      hadir: number;
      izin: number;
      sakit: number;
      alpa: number;
    }>(sql`
      select t.name as team, t.ku, count(distinct e.id)::int as sessions,
        count(*) filter (where a.status = 'hadir')::int as hadir,
        count(*) filter (where a.status = 'izin')::int as izin,
        count(*) filter (where a.status = 'sakit')::int as sakit,
        count(*) filter (where a.status = 'alpa')::int as alpa
      from attendance a join event e on e.id = a.event_id join team t on t.id = e.team_id
      where e.status = 'scheduled' and e.starts_at between ${start(p.from)}::timestamptz and ${end(p.to)}::timestamptz
      group by t.id, t.name, t.ku order by t.ku, t.name`);
    return rows.map((r) => {
      const total = r.hadir + r.izin + r.sakit + r.alpa;
      return { ...r, pct: total ? Math.round((r.hadir / total) * 100) : null };
    });
  }

  async payouts(tx: Tx, p: Period) {
    const incoming = await tx.execute<{
      paid_at: Date;
      method: string;
      gross: string;
      service_fee: string;
      club_net: string;
      platform_fee: string;
      midtrans_fee: string;
      invoices: number;
    }>(sql`
      select c.paid_at, c.method, c.gross::text, c.service_fee::text,
        coalesce((select sum(amount) from ledger_entry l where l.checkout_id = c.id), 0)::text as club_net,
        coalesce(-(select sum(amount) from ledger_entry l where l.checkout_id = c.id and l.kind = 'platform_fee'), 0)::text as platform_fee,
        coalesce(-(select sum(amount) from ledger_entry l where l.checkout_id = c.id and l.kind = 'midtrans_fee'), 0)::text as midtrans_fee,
        (select count(*)::int from checkout_invoice ci where ci.checkout_id = c.id) as invoices
      from checkout c where c.status = 'paid'
        and c.paid_at between ${start(p.from)}::timestamptz and ${end(p.to)}::timestamptz
      order by c.paid_at`);
    const withdrawals = await tx.execute<{
      created_at: Date;
      amount: string;
      fee: string;
      net: string;
      status: string;
    }>(sql`
      select created_at, amount::text, fee::text, net::text, status::text from withdrawal
      where created_at between ${start(p.from)}::timestamptz and ${end(p.to)}::timestamptz order by created_at`);
    return {
      incoming: incoming.map((r) => ({
        paidAt: new Date(r.paid_at).toISOString(),
        method: r.method,
        invoices: Number(r.invoices),
        gross: Number(r.gross),
        midtransFee: Number(r.service_fee) + Number(r.midtrans_fee),
        platformFee: Number(r.platform_fee),
        clubNet: Number(r.club_net),
      })),
      withdrawals: withdrawals.map((w) => ({
        at: new Date(w.created_at).toISOString(),
        amount: Number(w.amount),
        fee: Number(w.fee),
        net: Number(w.net),
        status: w.status,
      })),
    };
  }

  kuName(k: number | null) {
    return k === null ? 'Tanpa KU' : kuLabel(k);
  }
}

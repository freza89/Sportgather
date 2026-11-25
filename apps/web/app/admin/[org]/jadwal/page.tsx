import {
  addDays,
  formatTanggalIso,
  weekdayOf,
  type BranchDto,
  type HolidayDto,
  type ScheduleEventDto,
  type TeamSummary,
} from '@sportgather/shared';
import { Alert, IconBell, buttonVariants } from '@sportgather/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CreateScheduleDialog, HolidaysDialog } from '@/components/schedule/schedule-dialogs';
import { WeekCalendar } from '@/components/schedule/week-calendar';
import { apiPage } from '@/lib/api-server';
import { todayJakarta } from '@/lib/dates';

export const metadata: Metadata = { title: 'Jadwal' };

// A-12 · Kalender & jadwal
export default async function JadwalPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ minggu?: string; tim?: string }>;
}) {
  const { org: slug } = await params;
  const sp = await searchParams;
  const today = todayJakarta();
  const anchor = sp.minggu && /^\d{4}-\d{2}-\d{2}$/.test(sp.minggu) ? sp.minggu : today;
  const weekStart = addDays(anchor, -((weekdayOf(anchor) + 6) % 7)); // Senin
  const weekEnd = addDays(weekStart, 6);
  const teamQs = sp.tim ? `&teamId=${sp.tim}` : '';
  const [schedule, teams, branches, holidays] = await Promise.all([
    apiPage<{ events: ScheduleEventDto[]; holidays: HolidayDto[] }>(
      `/orgs/${slug}/schedule?from=${weekStart}&to=${weekEnd}${teamQs}`,
      `/admin/${slug}/jadwal`,
    ),
    apiPage<{ teams: TeamSummary[] }>(`/orgs/${slug}/teams`),
    apiPage<BranchDto[]>(`/orgs/${slug}/branches`),
    apiPage<HolidayDto[]>(`/orgs/${slug}/schedule/holidays`),
  ]);
  const base = `/admin/${slug}/jadwal`;
  const link = (week: string, tim = sp.tim) => `${base}?minggu=${week}${tim ? `&tim=${tim}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="type-h1">Jadwal</h1>
          <p className="type-body text-fg-secondary">
            {weekStart <= today && today <= weekEnd ? 'Minggu ini' : 'Minggu'} ·{' '}
            {formatTanggalIso(weekStart)} – {formatTanggalIso(weekEnd)}
          </p>
        </div>
        <div className="flex gap-3">
          <HolidaysDialog slug={slug} holidays={holidays} branches={branches} />
          <CreateScheduleDialog
            slug={slug}
            teams={teams.teams}
            branches={branches}
            defaultTeamId={sp.tim}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={link(addDays(weekStart, -7))}
          className={buttonVariants({ variant: 'secondary' })}
        >
          ‹ Minggu lalu
        </Link>
        <Link href={link(today)} className={buttonVariants({ variant: 'ghost' })}>
          Hari ini
        </Link>
        <Link
          href={link(addDays(weekStart, 7))}
          className={buttonVariants({ variant: 'secondary' })}
        >
          Minggu depan ›
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link
            href={link(weekStart, undefined)}
            className={
              !sp.tim
                ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                : 'rounded-full border border-line px-3 py-[6px] type-caption-bold'
            }
          >
            Semua tim
          </Link>
          {teams.teams.map((t) => (
            <Link
              key={t.id}
              href={link(weekStart, t.id)}
              className={
                sp.tim === t.id
                  ? 'rounded-full bg-navy-900 px-3 py-[6px] type-caption-bold text-fg-inverse'
                  : 'rounded-full border border-line px-3 py-[6px] type-caption-bold'
              }
            >
              {t.name}
            </Link>
          ))}
        </div>
      </div>
      {teams.teams.length === 0 ? (
        <Alert tone="warning">Buat tim terlebih dahulu di Tim & KU.</Alert>
      ) : null}
      <WeekCalendar
        slug={slug}
        weekStart={weekStart}
        today={today}
        events={schedule.events}
        holidays={schedule.holidays}
      />
      <Alert tone="info" icon={IconBell}>
        Mengubah satu sesi tidak mengubah sesi lain. Perubahan jadwal otomatis dikirim ke wali dan
        pelatih tim terkait via WhatsApp.
      </Alert>
    </div>
  );
}

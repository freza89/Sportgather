import { z } from 'zod';
import { IsoDateSchema } from './players.js';

const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam harus format HH:MM');
const DurationSchema = z.coerce.number().int().min(15, 'Minimal 15 menit').max(600);

// A-12 · jadwal berulang (SCH-01)
export const SeriesInputSchema = z.object({
  teamId: z.uuid(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, 'Pilih minimal satu hari'),
  startTime: TimeSchema,
  durationMin: DurationSchema.default(90),
  branchId: z.uuid().nullable().optional(),
  locationNote: z.string().trim().max(100).optional(),
});
export type SeriesInput = z.input<typeof SeriesInputSchema>;

// SCH-02 · event tunggal
export const EventInputSchema = z.object({
  teamId: z.uuid(),
  kind: z.enum(['training', 'match', 'tournament', 'assessment', 'other']).default('match'),
  title: z.string().trim().max(100).optional(),
  date: IsoDateSchema,
  startTime: TimeSchema,
  durationMin: DurationSchema.default(90),
  branchId: z.uuid().nullable().optional(),
  locationNote: z.string().trim().max(100).optional(),
});
export type EventInput = z.input<typeof EventInputSchema>;

/** Ubah satu sesi (tidak mengubah sesi lain) atau batalkan dengan alasan. */
export const EventUpdateSchema = z.object({
  date: IsoDateSchema.optional(),
  startTime: TimeSchema.optional(),
  durationMin: DurationSchema.optional(),
  branchId: z.uuid().nullable().optional(),
  locationNote: z.string().trim().max(100).nullable().optional(),
  title: z.string().trim().max(100).nullable().optional(),
  cancelReason: z.string().trim().min(3, 'Tulis alasan pembatalan').max(200).optional(),
  notify: z.boolean().default(true),
});

export const HolidayInputSchema = z.object({
  date: IsoDateSchema,
  name: z.string().trim().min(2).max(100),
  branchId: z.uuid().nullable().optional(),
});

export const ScheduleQuerySchema = z.object({
  from: IsoDateSchema,
  to: IsoDateSchema,
  teamId: z.uuid().optional(),
  branchId: z.uuid().optional(),
});

export interface ScheduleEventDto {
  id: string;
  teamId: string;
  teamName: string;
  ku: number;
  kind: 'training' | 'match' | 'tournament' | 'assessment' | 'other';
  title: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  branchName: string | null;
  locationNote: string | null;
  status: 'scheduled' | 'cancelled';
  cancelReason: string | null;
  isException: boolean;
  changedAt: string | null;
  seriesId: string | null;
}

export interface SeriesDto {
  id: string;
  teamId: string;
  teamName: string;
  weekday: number;
  startTime: string;
  durationMin: number;
  branchName: string | null;
  locationNote: string | null;
  upcoming: number;
}

export interface HolidayDto {
  id: string;
  date: string;
  name: string;
  branchName: string | null;
}

// SCH-03 · RSVP wali
export const RsvpInputSchema = z.object({
  eventId: z.uuid(),
  membershipId: z.uuid(),
  status: z.enum(['hadir', 'izin', 'sakit']),
  note: z.string().trim().max(100).optional(),
});

export const TokenRsvpSchema = z.object({
  responses: z.array(RsvpInputSchema).min(1).max(20),
});

export interface ChildEventDto {
  eventId: string;
  membershipId: string;
  childName: string;
  orgName: string;
  teamName: string;
  kind: ScheduleEventDto['kind'];
  title: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  status: 'scheduled' | 'cancelled';
  cancelReason: string | null;
  changed: boolean;
  rsvp: 'hadir' | 'izin' | 'sakit' | null;
  rsvpNote: string | null;
  rsvpOpen: boolean;
}

export interface TokenRsvpView {
  guardianName: string;
  expired: boolean;
  used: boolean;
  items: ChildEventDto[];
}

// ATT-01 · absensi pelatih (offline-first)
export const AttendanceOpSchema = z.object({
  clientOpId: z.uuid(),
  eventId: z.uuid(),
  membershipId: z.uuid(),
  status: z.enum(['hadir', 'izin', 'sakit', 'alpa']),
  /** Waktu di HP saat dicatat (ISO). */
  recordedAt: z.iso.datetime(),
});
export type AttendanceOp = z.infer<typeof AttendanceOpSchema>;

export const AttendanceSyncSchema = z.object({ ops: z.array(AttendanceOpSchema).min(1).max(500) });

export interface AttendanceSyncResult {
  accepted: number;
  duplicates: number;
  superseded: number;
  rejected: { clientOpId: string; message: string }[];
}

export interface SessionSummary {
  eventId: string;
  teamId: string;
  teamName: string;
  kind: ScheduleEventDto['kind'];
  title: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  location: string | null;
  status: 'scheduled' | 'cancelled';
  playerCount: number;
  rsvp: { hadir: number; izin: number; sakit: number; belum: number };
  attendanceRecorded: number;
}

export interface AttendanceSheet {
  event: SessionSummary;
  players: {
    membershipId: string;
    fullName: string;
    jerseyNumber: number | null;
    rsvp: 'hadir' | 'izin' | 'sakit' | null;
    rsvpNote: string | null;
    attendance: 'hadir' | 'izin' | 'sakit' | 'alpa' | null;
    recordedAt: string | null;
  }[];
}

export interface CoachTeamDto {
  id: string;
  name: string;
  ku: number;
  schedule: string;
  branchName: string | null;
  attendanceRate30d: number | null;
  members: {
    membershipId: string;
    fullName: string;
    jerseyNumber: number | null;
    status: string;
    statusReason: string | null;
    placement: string;
    actualKu: number | null;
    guardianName: string | null;
    guardianPhone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  }[];
}

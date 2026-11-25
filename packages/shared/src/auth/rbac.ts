/**
 * Matriks hak akses per organisasi (PRD bagian 7).
 * "Tim sendiri" untuk pelatih/team manager dibatasi lagi di level data (M2: penugasan tim).
 */
export const STAFF_ROLES = ['owner', 'admin', 'coach', 'team_manager'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Pelatih',
  team_manager: 'Team manager',
};

export const ROLE_DESCRIPTION: Record<StaffRole, string> = {
  owner: 'Semua akses termasuk rekening, langganan, dan override KU',
  admin: 'Pemain, tim, jadwal, tagihan, pengumuman, laporan',
  coach: 'Tim sendiri: absensi, penilaian skill, info ke orang tua',
  team_manager: 'Absensi & info tim sendiri',
};

export const PERMISSIONS = {
  /** Profil klub, cabang/lokasi. */
  'club.manage': ['owner', 'admin'],
  /** Rekening penerimaan & langganan — hanya owner (PRD bagian 7, FEE-08). */
  'club.manage_finance_settings': ['owner'],
  'club.view': ['owner', 'admin', 'coach', 'team_manager'],
  'staff.view': ['owner', 'admin'],
  'staff.invite': ['owner', 'admin'],
  /** Menunjuk/mengubah owner & admin. */
  'staff.manage_privileged': ['owner'],
  'players.manage': ['owner', 'admin'],
  'players.view_team': ['owner', 'admin', 'coach', 'team_manager'],
  'documents.view': ['owner', 'admin'],
  /** Play-down dan override KU lain (keputusan Q2: hanya owner). */
  'ku.override': ['owner'],
  'attendance.record_team': ['owner', 'admin', 'coach', 'team_manager'],
  'assessment.record_team': ['owner', 'admin', 'coach'],
  'billing.manage': ['owner', 'admin'],
  /** Beasiswa ditetapkan per pemain oleh owner (desain A-13). */
  'billing.scholarship': ['owner'],
  'payout.view': ['owner', 'admin'],
  'payout.withdraw': ['owner'],
  'announcement.send_club': ['owner', 'admin'],
  'announcement.send_team': ['owner', 'admin', 'coach', 'team_manager'],
  'audit.view': ['owner', 'admin'],
} as const satisfies Record<string, readonly StaffRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: StaffRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly StaffRole[]).includes(role);
}

/** Peran yang boleh diberikan oleh pengundang. Admin tidak bisa membuat owner/admin. */
export function assignableRoles(actor: StaffRole): StaffRole[] {
  if (actor === 'owner') return ['admin', 'coach', 'team_manager', 'owner'];
  if (actor === 'admin') return ['coach', 'team_manager'];
  return [];
}

/** Tujuan setelah login berdasarkan peran di klub. */
export function homeForRole(role: StaffRole, orgSlug: string): string {
  return role === 'coach' || role === 'team_manager' ? `/pelatih/${orgSlug}` : `/admin/${orgSlug}`;
}

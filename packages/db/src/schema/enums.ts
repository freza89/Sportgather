import { pgEnum } from 'drizzle-orm/pg-core';

export const sportEnum = pgEnum('sport', ['basketball']);
export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'starter',
  'klub',
  'akademi',
  'enterprise',
]);
export const staffRoleEnum = pgEnum('staff_role_kind', ['owner', 'admin', 'coach', 'team_manager']);
export const staffStatusEnum = pgEnum('staff_status', ['invited', 'active', 'removed']);
export const bankAccountStatusEnum = pgEnum('bank_account_status', [
  'pending_verification',
  'verified',
  'rejected',
  'replaced',
]);
export const otpChannelEnum = pgEnum('otp_channel', ['whatsapp', 'sms']);
export const otpPurposeEnum = pgEnum('otp_purpose', ['login', 'signup']);
/**
 * pending  = pendaftar menunggu verifikasi admin (A-08)
 * rejected = dokumen ditolak, menunggu wali memperbaiki
 * active / on_leave (cuti, tidak ditagih) / left (keluar)
 */
export const membershipStatusEnum = pgEnum('membership_status', [
  'pending',
  'rejected',
  'active',
  'on_leave',
  'left',
]);
export const registrationSourceEnum = pgEnum('registration_source', ['online', 'import', 'manual']);
export const seasonStatusEnum = pgEnum('season_status', ['draft', 'active', 'archived']);
export const kuRuleEnum = pgEnum('ku_rule', ['UNDER_N', 'MAX_N']);
export const teamGenderEnum = pgEnum('team_gender', ['male', 'female', 'mixed']);
export const placementEnum = pgEnum('placement', ['same', 'play_up', 'play_down', 'over_age']);
export const documentKindEnum = pgEnum('document_kind', ['akta', 'kia', 'kk', 'foto']);
export const documentStatusEnum = pgEnum('document_status', ['pending', 'verified', 'rejected']);
export const genderEnum = pgEnum('gender', ['male', 'female']);
export const guardianRelationEnum = pgEnum('guardian_relation', ['father', 'mother', 'guardian']);

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
export const membershipStatusEnum = pgEnum('membership_status', ['active', 'on_leave', 'left']);
export const genderEnum = pgEnum('gender', ['male', 'female']);
export const guardianRelationEnum = pgEnum('guardian_relation', ['father', 'mother', 'guardian']);

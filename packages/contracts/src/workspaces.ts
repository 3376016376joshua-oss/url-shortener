import { z } from 'zod';
import {
  NAME_MAX_LENGTH,
  emailSchema,
  workspaceRoleSchema,
  workspaceSummarySchema,
} from './identity.js';

/** Fixed for this version, the same for every workspace (PRD section 6). */
export const WorkspaceQuota = {
  Members: 25,
  ApiKeys: 20,
} as const;

export const API_KEY_NAME_MAX_LENGTH = 100;
const TOKEN_MAX_LENGTH = 128;
const CURSOR_MAX_LENGTH = 256;
const PAGE_SIZE_MAX = 100;
const PAGE_SIZE_DEFAULT = 25;

const workspaceNameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);

export const createWorkspaceRequestSchema = z.strictObject({
  name: workspaceNameSchema,
});
export type CreateWorkspaceRequest = z.infer<
  typeof createWorkspaceRequestSchema
>;

export const updateWorkspaceRequestSchema = z.strictObject({
  name: workspaceNameSchema,
});
export type UpdateWorkspaceRequest = z.infer<
  typeof updateWorkspaceRequestSchema
>;

export const workspaceSchema = workspaceSummarySchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type WorkspaceDetails = z.infer<typeof workspaceSchema>;

export const memberSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
  joinedAt: z.iso.datetime(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberListSchema = z.object({
  items: z.array(memberSchema),
  nextCursor: z.null(),
});
export type MemberList = z.infer<typeof memberListSchema>;

export const updateMemberRoleRequestSchema = z.strictObject({
  role: workspaceRoleSchema,
});
export type UpdateMemberRoleRequest = z.infer<
  typeof updateMemberRoleRequestSchema
>;

/** Ownership is granted by an owner changing a role, never by invitation. */
export const invitationRoleSchema = z.enum(['admin', 'member']);
export type InvitationRole = z.infer<typeof invitationRoleSchema>;

export const createInvitationRequestSchema = z.strictObject({
  email: emailSchema,
  role: invitationRoleSchema,
});
export type CreateInvitationRequest = z.infer<
  typeof createInvitationRequestSchema
>;

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: invitationRoleSchema,
  invitedByUserId: z.uuid().nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const invitationListSchema = z.object({
  items: z.array(invitationSchema),
  nextCursor: z.null(),
});
export type InvitationList = z.infer<typeof invitationListSchema>;

export const acceptInvitationRequestSchema = z.strictObject({
  token: z.string().min(1).max(TOKEN_MAX_LENGTH),
});
export type AcceptInvitationRequest = z.infer<
  typeof acceptInvitationRequestSchema
>;

export const createApiKeyRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(API_KEY_NAME_MAX_LENGTH),
  /** Omitted or `null`: the key works until it is revoked. */
  expiresAt: z.iso.datetime().nullish(),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

export const apiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The first characters of the key, enough to tell keys apart. */
  keyPrefix: z.string(),
  createdByUserId: z.uuid().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type ApiKeySummary = z.infer<typeof apiKeySchema>;

/** The only response that ever carries the key itself. */
export const createdApiKeySchema = apiKeySchema.extend({ key: z.string() });
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;

export const apiKeyListSchema = z.object({
  items: z.array(apiKeySchema),
  nextCursor: z.null(),
});
export type ApiKeyList = z.infer<typeof apiKeyListSchema>;

export const auditLogQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE_MAX)
    .default(PAGE_SIZE_DEFAULT),
  cursor: z.string().min(1).max(CURSOR_MAX_LENGTH).optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  actor: z.object({
    type: z.enum(['user', 'api_key', 'system']),
    id: z.uuid().nullable(),
    /** The user's or key's name, when it still exists. */
    name: z.string().nullable(),
  }),
  /** `<target>.<verb>`, for example `api_key.revoked`. */
  action: z.string(),
  target: z.object({ type: z.string(), id: z.uuid().nullable() }),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export type AuditLogEntryView = z.infer<typeof auditLogEntrySchema>;

export const auditLogPageSchema = z.object({
  items: z.array(auditLogEntrySchema),
  nextCursor: z.string().nullable(),
});
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;

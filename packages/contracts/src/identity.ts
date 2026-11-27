import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 320;
/** Far longer than any token the platform issues; only bounds the input. */
const TOKEN_MAX_LENGTH = 128;

/**
 * Dashboard pages that mailed links open. Each takes the token as `?token=`,
 * and the page posts it to the matching endpoint.
 */
export const EmailLinkPath = {
  VerifyEmail: '/verify-email',
  ResetPassword: '/reset-password',
  AcceptInvitation: '/invitations/accept',
} as const;
export type EmailLinkPath = (typeof EmailLinkPath)[keyof typeof EmailLinkPath];

/** Addresses are compared and stored lowercase, without surrounding space. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email());

export const nameSchema = z.string().trim().min(1).max(NAME_MAX_LENGTH);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** A password being checked, not chosen: only bounded, never judged. */
const presentedPasswordSchema = z.string().min(1).max(PASSWORD_MAX_LENGTH);

const tokenSchema = z.string().min(1).max(TOKEN_MAX_LENGTH);

export const signUpRequestSchema = z.strictObject({
  email: emailSchema,
  name: nameSchema,
  password: passwordSchema,
});
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

export const verifyEmailRequestSchema = z.strictObject({ token: tokenSchema });
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const resendVerificationRequestSchema = z.strictObject({
  email: emailSchema,
});
export type ResendVerificationRequest = z.infer<
  typeof resendVerificationRequestSchema
>;

export const signInRequestSchema = z.strictObject({
  email: emailSchema,
  password: presentedPasswordSchema,
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const passwordResetRequestSchema = z.strictObject({
  email: emailSchema,
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmRequestSchema = z.strictObject({
  token: tokenSchema,
  password: passwordSchema,
});
export type PasswordResetConfirmRequest = z.infer<
  typeof passwordResetConfirmRequestSchema
>;

/** Changing the password needs the current one; the two travel together. */
export const updateProfileRequestSchema = z
  .strictObject({
    name: nameSchema.optional(),
    currentPassword: presentedPasswordSchema.optional(),
    newPassword: passwordSchema.optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.newPassword !== undefined,
    { message: 'Send a name, a new password, or both' },
  )
  .refine(
    (value) =>
      (value.currentPassword === undefined) ===
      (value.newPassword === undefined),
    {
      message: 'currentPassword and newPassword must be sent together',
      path: ['currentPassword'],
    },
  );
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export type WorkspaceRoleName = z.infer<typeof workspaceRoleSchema>;

/** A workspace as seen by one caller: what it is, and their role in it. */
export const workspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  isPlatformAdmin: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type UserProfile = z.infer<typeof userSchema>;

/** Who the caller is: the body of `GET /me` and of a successful sign-in. */
export const identitySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('session'),
    user: userSchema,
    workspaces: z.array(workspaceSummarySchema),
  }),
  z.object({
    kind: z.literal('api_key'),
    apiKey: z.object({
      id: z.uuid(),
      name: z.string(),
      keyPrefix: z.string(),
    }),
    workspaces: z.array(workspaceSummarySchema),
  }),
]);
export type Identity = z.infer<typeof identitySchema>;

export const sessionSchema = z.object({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** True for the session that made this request. */
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSchema>;

export const sessionListSchema = z.object({
  items: z.array(sessionSchema),
  nextCursor: z.null(),
});
export type SessionList = z.infer<typeof sessionListSchema>;

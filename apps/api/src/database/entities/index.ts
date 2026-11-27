import { ApiKey } from './api-key.entity.js';
import { AuditLogEntry } from './audit-log-entry.entity.js';
import { ClickEvent } from './click-event.entity.js';
import { Domain } from './domain.entity.js';
import { EmailToken } from './email-token.entity.js';
import { LinkDailyBreakdown } from './link-daily-breakdown.entity.js';
import { LinkDailyTotal } from './link-daily-total.entity.js';
import { LinkDailyVisitor } from './link-daily-visitor.entity.js';
import { LinkVariant } from './link-variant.entity.js';
import { Link } from './link.entity.js';
import { Session } from './session.entity.js';
import { User } from './user.entity.js';
import { VisitorSalt } from './visitor-salt.entity.js';
import { WorkspaceInvitation } from './workspace-invitation.entity.js';
import { WorkspaceMember } from './workspace-member.entity.js';
import { Workspace } from './workspace.entity.js';

/** Every table the application maps. */
export const entities = [
  User,
  Session,
  EmailToken,
  Workspace,
  WorkspaceMember,
  WorkspaceInvitation,
  ApiKey,
  Domain,
  Link,
  LinkVariant,
  ClickEvent,
  LinkDailyTotal,
  LinkDailyBreakdown,
  LinkDailyVisitor,
  VisitorSalt,
  AuditLogEntry,
];

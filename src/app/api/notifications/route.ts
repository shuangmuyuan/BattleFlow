import { NextRequest } from 'next/server';
import { readJsonRecord } from '@/app/api/auth/_shared';
import { managementErrorResponse, noStoreJson } from '@/app/api/organizations/_shared';
import { requireUser } from '@/lib/auth/server';
import { ForbiddenError } from '@/lib/auth/types';
import {
  listNotificationsForRecipient,
  markNotificationsReadForRecipient,
  type NotificationRecipient,
} from '@/lib/notifications';
import { battleflowAuthCookieName, getUserBySessionToken } from '@/lib/sso-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function resolveNotificationRecipient(request: NextRequest): Promise<NotificationRecipient> {
  let firstPartyError: unknown;

  try {
    const context = await requireUser(request);
    return { kind: 'account', userId: context.user.id };
  } catch (error) {
    firstPartyError = error;
  }

  const token = request.cookies.get(battleflowAuthCookieName)?.value || '';
  const ssoUser = await getUserBySessionToken(token);
  if (!ssoUser) {
    throw firstPartyError;
  }

  if (!ssoUser.is_active) {
    throw new ForbiddenError('User is disabled');
  }

  return { kind: 'battleflow', userId: ssoUser.id };
}

function readNotificationIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

export async function GET(request: NextRequest) {
  try {
    const recipient = await resolveNotificationRecipient(request);
    const { notifications, unreadCount } = await listNotificationsForRecipient(recipient, 20);

    return noStoreJson({ notifications, unreadCount });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const recipient = await resolveNotificationRecipient(request);
    const body = await readJsonRecord(request);
    const action = typeof body?.action === 'string' ? body.action : 'mark_all_read';
    const ids = action === 'mark_read' ? readNotificationIds(body?.ids) : undefined;

    if (action !== 'mark_all_read' && action !== 'mark_read') {
      return noStoreJson({ error: 'Notification action is invalid' }, { status: 400 });
    }

    if (action === 'mark_read' && (!ids || ids.length === 0)) {
      return noStoreJson({ error: 'Notification IDs are required' }, { status: 400 });
    }

    const updatedCount = await markNotificationsReadForRecipient(recipient, ids);
    const { notifications, unreadCount } = await listNotificationsForRecipient(recipient, 20);

    return noStoreJson({ success: true, updatedCount, notifications, unreadCount });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

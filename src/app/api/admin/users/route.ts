import { NextRequest } from 'next/server';
import {
  managementErrorResponse,
  noStoreJson,
  readRequiredJsonBody,
  readRequiredStringField,
} from '@/app/api/organizations/_shared';
import { requirePlatformPermission, requireUser } from '@/lib/auth/server';
import { ForbiddenError } from '@/lib/auth/types';
import {
  listPlatformUsers,
  SuperAdminManagementError,
  updatePlatformUserAdmin,
} from '@/lib/auth/super-admins';
import { battleflowAuthCookieName, getUserBySessionToken } from '@/lib/sso-auth';

export const runtime = 'nodejs';

const viewPlatformUsersAction = 'platform.users.list';

async function requirePlatformUserListAccess(request: NextRequest): Promise<{ actorUserId: string | null }> {
  let firstPartyError: unknown;

  try {
    const context = await requireUser(request);
    requirePlatformPermission(context, viewPlatformUsersAction);
    return { actorUserId: context.user.id };
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

  if (!ssoUser.is_admin) {
    throw new ForbiddenError();
  }

  return { actorUserId: null };
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformUserListAccess(request);

    const users = await listPlatformUsers();
    return noStoreJson({ users });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const access = await requirePlatformUserListAccess(request);
    const body = await readRequiredJsonBody(request);
    const isAdmin = typeof body.isAdmin === 'boolean' ? body.isAdmin : null;
    if (isAdmin === null) {
      throw new SuperAdminManagementError('Admin flag is required');
    }

    const user = await updatePlatformUserAdmin({
      actorUserId: access.actorUserId,
      targetUserId: readRequiredStringField(body, 'userId', 'User ID'),
      isAdmin,
    });

    return noStoreJson({ success: true, user });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

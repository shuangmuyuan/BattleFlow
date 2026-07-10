import { NextRequest } from 'next/server';
import {
  managementErrorResponse,
  noStoreJson,
  readRequiredJsonBody,
  readRequiredStringField,
} from '@/app/api/organizations/_shared';
import { requirePlatformPermission, requireUser } from '@/lib/auth/server';
import {
  listPlatformUsers,
  SuperAdminManagementError,
  updatePlatformUserAdmin,
} from '@/lib/auth/super-admins';

export const runtime = 'nodejs';

const viewPlatformUsersAction = 'platform.users.list';
const managePlatformUsersAction = 'platform.users.manage';

async function requirePlatformUserListAccess(
  request: NextRequest,
  action = viewPlatformUsersAction,
): Promise<{ actorUserId: string | null }> {
  const context = await requireUser(request);
  requirePlatformPermission(context, action);
  return { actorUserId: context.user.id };
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
    const access = await requirePlatformUserListAccess(request, managePlatformUsersAction);
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

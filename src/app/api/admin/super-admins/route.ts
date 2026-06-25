import { NextRequest } from 'next/server';
import {
  managementErrorResponse,
  noStoreJson,
  readRequiredJsonBody,
  readRequiredStringField,
} from '@/app/api/organizations/_shared';
import { requirePlatformPermission, requireUser } from '@/lib/auth/server';
import {
  grantSuperAdmin,
  listSuperAdmins,
  revokeSuperAdmin,
} from '@/lib/auth/super-admins';

export const runtime = 'nodejs';

const manageSuperAdminsAction = 'platform.super_admins.manage';

export async function GET(request: NextRequest) {
  try {
    const context = await requireUser(request);
    requirePlatformPermission(context, manageSuperAdminsAction);

    const superAdmins = await listSuperAdmins();
    return noStoreJson({ superAdmins });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireUser(request);
    requirePlatformPermission(context, manageSuperAdminsAction);

    const body = await readRequiredJsonBody(request);
    const superAdmin = await grantSuperAdmin({
      actorUserId: context.user.id,
      targetEmail: typeof body.email === 'string' ? body.email : null,
      targetUserId: typeof body.userId === 'string' ? body.userId : null,
    });

    return noStoreJson({ success: true, superAdmin });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await requireUser(request);
    requirePlatformPermission(context, manageSuperAdminsAction);

    const body = await readRequiredJsonBody(request);
    await revokeSuperAdmin({
      actorUserId: context.user.id,
      targetUserId: readRequiredStringField(body, 'userId', 'User ID'),
    });

    return noStoreJson({ success: true });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

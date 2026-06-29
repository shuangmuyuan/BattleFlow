import { NextRequest } from 'next/server';
import { requireOrganizationContext, requirePermission } from '@/lib/auth/server';
import { ForbiddenError } from '@/lib/auth/types';
import { queryPostgres } from '@/storage/database/postgres-client';
import { managementErrorResponse, noStoreJson } from '../../organizations/_shared';

export const runtime = 'nodejs';

type ManagedResourceType = 'skill' | 'workflow' | 'knowledge_base' | 'prd_document';

interface ResourceStatusRow {
  resource_type: ManagedResourceType;
  resource_count: number;
  grant_count: number;
}

const resourceTypes: ManagedResourceType[] = ['skill', 'workflow', 'knowledge_base', 'prd_document'];

function requestedOrganizationId(request: NextRequest): string | null {
  return request.nextUrl.searchParams.get('organizationId');
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireOrganizationContext(request, {
      organizationId: requestedOrganizationId(request),
    });
    if (!context.isSuperAdmin) {
      throw new ForbiddenError();
    }
    requirePermission(context, 'organization.members.manage', {
      organizationId: context.activeOrganization.id,
    });

    const result = await queryPostgres<ResourceStatusRow>(
      `
        WITH resource_counts AS (
          SELECT 'skill'::varchar AS resource_type, count(*)::int AS resource_count
          FROM skills
          WHERE is_active = true
            AND (organization_id = $1 OR scope = 'official')
          UNION ALL
          SELECT 'workflow'::varchar AS resource_type, count(*)::int AS resource_count
          FROM workflows
          WHERE organization_id = $1
          UNION ALL
          SELECT 'knowledge_base'::varchar AS resource_type, count(*)::int AS resource_count
          FROM knowledge_bases
          WHERE organization_id = $1
          UNION ALL
          SELECT 'prd_document'::varchar AS resource_type, count(*)::int AS resource_count
          FROM prd_documents
          WHERE organization_id = $1
        ),
        grant_counts AS (
          SELECT resource_type, count(*)::int AS grant_count
          FROM resource_access_grants
          WHERE organization_id = $1
          GROUP BY resource_type
        )
        SELECT
          rc.resource_type,
          rc.resource_count,
          COALESCE(gc.grant_count, 0)::int AS grant_count
        FROM resource_counts rc
        LEFT JOIN grant_counts gc ON gc.resource_type = rc.resource_type
        ORDER BY rc.resource_type
      `,
      [context.activeOrganization.id],
    );

    const statsByType = new Map(result.rows.map((row) => [row.resource_type, row]));

    return noStoreJson({
      resources: resourceTypes.map((type) => {
        const row = statsByType.get(type);
        return {
          type,
          resourceCount: row?.resource_count ?? 0,
          grantCount: row?.grant_count ?? 0,
          status: 'active',
        };
      }),
    });
  } catch (error) {
    return managementErrorResponse(error);
  }
}

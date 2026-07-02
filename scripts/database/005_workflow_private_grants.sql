BEGIN;

DELETE FROM resource_access_grants
WHERE resource_type = 'workflow'
  AND subject_type = 'organization'
  AND permission IN ('read', 'update');

COMMIT;

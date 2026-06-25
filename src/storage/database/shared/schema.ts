import { pgTable, serial, varchar, timestamp, text, boolean, integer, jsonb, index, uniqueIndex, customType, type AnyPgColumn } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// ============================================
// System Table (DO NOT DELETE)
// ============================================
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// ============================================
// Users & Sessions
// ============================================
export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  email: varchar("email", { length: 255 }).notNull().unique(),
  display_name: varchar("display_name", { length: 128 }),
  avatar_url: text("avatar_url"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("users_email_idx").on(table.email),
  index("users_status_idx").on(table.status),
]);

export const userPasswordCredentials = pgTable("user_password_credentials", {
  user_id: varchar("user_id", { length: 36 }).primaryKey().references(() => users.id, { onDelete: "cascade" }),
  password_hash: text("password_hash").notNull(),
  password_updated_at: timestamp("password_updated_at", { withTimezone: true }).defaultNow().notNull(),
  failed_attempt_count: integer("failed_attempt_count").notNull().default(0),
  locked_until: timestamp("locked_until", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
});

export const userSessions = pgTable("user_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  session_token_hash: varchar("session_token_hash", { length: 128 }).notNull().unique(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
  ip_hash: varchar("ip_hash", { length: 128 }),
  user_agent_hash: varchar("user_agent_hash", { length: 128 }),
}, (table) => [
  index("user_sessions_user_id_idx").on(table.user_id),
  index("user_sessions_expires_at_idx").on(table.expires_at),
  index("user_sessions_revoked_at_idx").on(table.revoked_at),
]);

// ============================================
// Organizations & Members
// ============================================
export const organizations = pgTable("organizations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  settings: jsonb("settings").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("organizations_slug_idx").on(table.slug),
  index("organizations_status_idx").on(table.status),
  index("organizations_created_by_idx").on(table.created_by),
]);

export const organizationMembers = pgTable("organization_members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("org_member"),
  status: varchar("status", { length: 20 }).notNull().default("active"),
  joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("org_members_org_id_idx").on(table.organization_id),
  index("org_members_user_id_idx").on(table.user_id),
  uniqueIndex("org_members_org_user_idx").on(table.organization_id, table.user_id),
  index("org_members_status_idx").on(table.status),
  index("org_members_role_idx").on(table.role),
]);

export const departments = pgTable("departments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  parent_department_id: varchar("parent_department_id", { length: 36 }).references((): AnyPgColumn => departments.id, { onDelete: "set null" }),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  description: text("description"),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("departments_org_id_idx").on(table.organization_id),
  index("departments_parent_id_idx").on(table.parent_department_id),
  uniqueIndex("departments_org_slug_idx").on(table.organization_id, table.slug),
]);

export const departmentMembers = pgTable("department_members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  department_id: varchar("department_id", { length: 36 }).notNull().references(() => departments.id, { onDelete: "cascade" }),
  user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 24 }).notNull().default("department_member"),
  joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("department_members_department_id_idx").on(table.department_id),
  index("department_members_user_id_idx").on(table.user_id),
  uniqueIndex("department_members_department_user_idx").on(table.department_id, table.user_id),
]);

export const teams = pgTable("teams", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  department_id: varchar("department_id", { length: 36 }).references(() => departments.id, { onDelete: "set null" }),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  description: text("description"),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("teams_org_id_idx").on(table.organization_id),
  index("teams_department_id_idx").on(table.department_id),
  uniqueIndex("teams_org_slug_idx").on(table.organization_id, table.slug),
]);

export const teamMembers = pgTable("team_members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  team_id: varchar("team_id", { length: 36 }).notNull().references(() => teams.id, { onDelete: "cascade" }),
  user_id: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("team_member"),
  joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("team_members_team_id_idx").on(table.team_id),
  index("team_members_user_id_idx").on(table.user_id),
  uniqueIndex("team_members_team_user_idx").on(table.team_id, table.user_id),
]);

export const platformAdmins = pgTable("platform_admins", {
  user_id: varchar("user_id", { length: 36 }).primaryKey().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("super_admin"),
  enabled: boolean("enabled").notNull().default(true),
  granted_by: varchar("granted_by", { length: 36 }).references(() => users.id),
  granted_at: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  revoked_by: varchar("revoked_by", { length: 36 }).references(() => users.id),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  index("platform_admins_enabled_idx").on(table.enabled),
]);


// ============================================
// Skills
// ============================================
export const skills = pgTable("skills", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 20 }).notNull().default("1.0.0"),
  scope: varchar("scope", { length: 20 }).notNull().default("personal"),
  status: varchar("status", { length: 24 }).notNull().default("imported"),
  owner_user_id: varchar("owner_user_id", { length: 36 }).references(() => users.id),
  source_type: varchar("source_type", { length: 20 }).notNull().default("local"),
  source_uri: text("source_uri"),
  asset_manifest: jsonb("asset_manifest").$type<Array<{
    path: string;
    content_type?: string;
    size_bytes?: number;
    checksum?: string;
  }>>().default(sql`'[]'::jsonb`).notNull(),
  // Skill definition payload (JSON)
  definition: jsonb("definition").notNull().$type<{
    inputs: Array<{ name: string; type: string; required: boolean; description: string }>;
    outputs: Array<{ name: string; type: string; description: string }>;
    methodology: string;
    tools: string[];
    prompt_template: string;
    checklist: string[];
  }>(),
  tags: jsonb("tags").$type<string[]>(),
  is_active: boolean("is_active").default(true).notNull(),
  created_by: varchar("created_by", { length: 36 }),
  published_at: timestamp("published_at", { withTimezone: true }),
  archived_at: timestamp("archived_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("skills_org_id_idx").on(table.organization_id),
  index("skills_scope_idx").on(table.scope),
  index("skills_status_idx").on(table.status),
  index("skills_owner_user_id_idx").on(table.owner_user_id),
  index("skills_created_by_idx").on(table.created_by),
]);

export const skillVersions = pgTable("skill_versions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  skill_id: varchar("skill_id", { length: 36 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  version: varchar("version", { length: 20 }).notNull(),
  definition: jsonb("definition").notNull().$type<Record<string, unknown>>(),
  asset_manifest: jsonb("asset_manifest").$type<Array<Record<string, unknown>>>().default(sql`'[]'::jsonb`).notNull(),
  changelog_note: text("changelog_note"),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("skill_versions_skill_id_idx").on(table.skill_id),
  uniqueIndex("skill_versions_skill_version_idx").on(table.skill_id, table.version),
]);

export const skillReviews = pgTable("skill_reviews", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  skill_id: varchar("skill_id", { length: 36 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  version_id: varchar("version_id", { length: 36 }).references(() => skillVersions.id, { onDelete: "set null" }),
  status: varchar("status", { length: 24 }).notNull().default("pending_review"),
  note: text("note"),
  requested_by: varchar("requested_by", { length: 36 }).references(() => users.id),
  reviewed_by: varchar("reviewed_by", { length: 36 }).references(() => users.id),
  requested_at: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
}, (table) => [
  index("skill_reviews_skill_id_idx").on(table.skill_id),
  index("skill_reviews_status_idx").on(table.status),
]);

export const skillAssets = pgTable("skill_assets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  skill_id: varchar("skill_id", { length: 36 }).notNull().references(() => skills.id, { onDelete: "cascade" }),
  version_id: varchar("version_id", { length: 36 }).references(() => skillVersions.id, { onDelete: "set null" }),
  path: text("path").notNull(),
  uri: text("uri"),
  content_type: varchar("content_type", { length: 128 }),
  size_bytes: integer("size_bytes"),
  checksum: varchar("checksum", { length: 128 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("skill_assets_skill_id_idx").on(table.skill_id),
  index("skill_assets_version_id_idx").on(table.version_id),
  index("skill_assets_checksum_idx").on(table.checksum),
]);

// ============================================
// Workflows
// ============================================
export const workflows = pgTable("workflows", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workspace_id: varchar("workspace_id", { length: 36 }),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("draft"),
  current_step_index: integer("current_step_index").default(0),
  model_id: varchar("model_id", { length: 64 }).default("doubao-seed-2-0-pro-260215"),
  created_by: varchar("created_by", { length: 36 }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("workflows_org_id_idx").on(table.organization_id),
  index("workflows_workspace_id_idx").on(table.workspace_id),
  index("workflows_created_by_idx").on(table.created_by),
  index("workflows_status_idx").on(table.status),
]);

export const workflowWorkspaces = pgTable("workflow_workspaces", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description"),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("workflow_workspaces_org_id_idx").on(table.organization_id),
  index("workflow_workspaces_created_by_idx").on(table.created_by),
]);

export const workflowAssets = pgTable("workflow_assets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
  asset_type: varchar("asset_type", { length: 32 }).notNull(),
  path: text("path"),
  uri: text("uri"),
  content_type: varchar("content_type", { length: 128 }),
  size_bytes: integer("size_bytes"),
  checksum: varchar("checksum", { length: 128 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("workflow_assets_workflow_id_idx").on(table.workflow_id),
  index("workflow_assets_type_idx").on(table.asset_type),
]);

// ============================================
// Workflow Steps
// ============================================
export const workflowSteps = pgTable("workflow_steps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
  skill_id: varchar("skill_id", { length: 36 }).references(() => skills.id),
  step_index: integer("step_index").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // The output/artifact of this step
  output: text("output"),
  // Context accumulated from previous steps
  accumulated_context: jsonb("accumulated_context").$type<Array<{ step_name: string; step_output: string }>>(),
  // The conversation history for this step's AI dialogue
  conversation: jsonb("conversation").$type<Array<{ role: "user" | "assistant" | "system"; content: string }>>(),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("workflow_steps_workflow_id_idx").on(table.workflow_id),
  index("workflow_steps_skill_id_idx").on(table.skill_id),
]);

// ============================================
// Step Snapshots (version management)
// ============================================
export const stepSnapshots = pgTable("step_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  step_id: varchar("step_id", { length: 36 }).notNull().references(() => workflowSteps.id, { onDelete: "cascade" }),
  workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
  output: text("output").notNull(),
  conversation: jsonb("conversation").$type<Array<{ role: "user" | "assistant" | "system"; content: string }>>(),
  snapshot_type: varchar("snapshot_type", { length: 20 }).notNull().default("auto"),
  label: varchar("label", { length: 128 }),
  created_by: varchar("created_by", { length: 36 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("step_snapshots_step_id_idx").on(table.step_id),
  index("step_snapshots_workflow_id_idx").on(table.workflow_id),
]);

// ============================================
// Workflow Snapshots
// ============================================
export const workflowSnapshots = pgTable("workflow_snapshots", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull().$type<{
    steps: Array<{
      step_id: string;
      step_name: string;
      skill_name: string;
      output: string;
      status: string;
    }>;
  }>(),
  snapshot_type: varchar("snapshot_type", { length: 20 }).notNull().default("auto"),
  label: varchar("label", { length: 128 }),
  created_by: varchar("created_by", { length: 36 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("workflow_snapshots_workflow_id_idx").on(table.workflow_id),
]);

// ============================================
// Milestones
// ============================================
export const milestones = pgTable("milestones", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
  workflow_snapshot_id: varchar("workflow_snapshot_id", { length: 36 }).references(() => workflowSnapshots.id),
  step_snapshot_id: varchar("step_snapshot_id", { length: 36 }).references(() => stepSnapshots.id),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  milestone_type: varchar("milestone_type", { length: 20 }).notNull().default("manual"),
  created_by: varchar("created_by", { length: 36 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("milestones_workflow_id_idx").on(table.workflow_id),
]);

// ============================================
// Knowledge Bases
// ============================================
export const knowledgeBases = pgTable("knowledge_bases", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  source_type: varchar("source_type", { length: 20 }).notNull().default("builtin"),
  // For external KB, this stores the connection config
  connection_config: jsonb("connection_config").$type<{
    type: string;
    endpoint: string;
    api_key: string;
    dataset_name: string;
  }>(),
  // External knowledge dataset name
  dataset_name: varchar("dataset_name", { length: 128 }),
  is_active: boolean("is_active").default(true).notNull(),
  created_by: varchar("created_by", { length: 36 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("knowledge_bases_org_id_idx").on(table.organization_id),
]);

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  knowledge_base_id: varchar("knowledge_base_id", { length: 36 }).notNull().references(() => knowledgeBases.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }),
  source_type: varchar("source_type", { length: 32 }).notNull().default("manual"),
  source: text("source"),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  search_vector: tsvector("search_vector"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("knowledge_documents_kb_id_idx").on(table.knowledge_base_id),
  index("knowledge_documents_created_at_idx").on(table.created_at),
]);

// ============================================
// PRD Documents (final output)
// ============================================
export const prdDocuments = pgTable("prd_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  workflow_id: varchar("workflow_id", { length: 36 }).notNull().references(() => workflows.id, { onDelete: "cascade" }),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 200 }).notNull(),
  content: text("content").notNull(),
  version: varchar("version", { length: 20 }).notNull().default("1.0.0"),
  created_by: varchar("created_by", { length: 36 }),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("prd_documents_workflow_id_idx").on(table.workflow_id),
  index("prd_documents_org_id_idx").on(table.organization_id),
]);

// ============================================
// Resource Grants & Audit Events
// ============================================
export const resourceAccessGrants = pgTable("resource_access_grants", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  resource_type: varchar("resource_type", { length: 40 }).notNull(),
  resource_id: varchar("resource_id", { length: 128 }).notNull(),
  subject_type: varchar("subject_type", { length: 24 }).notNull(),
  subject_id: varchar("subject_id", { length: 128 }).notNull(),
  permission: varchar("permission", { length: 24 }).notNull(),
  created_by: varchar("created_by", { length: 36 }).references(() => users.id),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("resource_grants_org_idx").on(table.organization_id),
  index("resource_grants_resource_idx").on(table.resource_type, table.resource_id),
  index("resource_grants_subject_idx").on(table.subject_type, table.subject_id),
  uniqueIndex("resource_grants_unique_idx").on(table.organization_id, table.resource_type, table.resource_id, table.subject_type, table.subject_id, table.permission),
  index("resource_grants_permission_idx").on(table.permission),
]);

export const auditEvents = pgTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()::text`),
  organization_id: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "set null" }),
  actor_user_id: varchar("actor_user_id", { length: 36 }).references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 96 }).notNull(),
  target_type: varchar("target_type", { length: 64 }).notNull(),
  target_id: varchar("target_id", { length: 128 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("audit_events_org_id_idx").on(table.organization_id),
  index("audit_events_actor_idx").on(table.actor_user_id),
  index("audit_events_action_idx").on(table.action),
  index("audit_events_target_idx").on(table.target_type, table.target_id),
  index("audit_events_created_at_idx").on(table.created_at),
]);

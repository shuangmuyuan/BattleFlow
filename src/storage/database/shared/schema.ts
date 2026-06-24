import { pgTable, serial, varchar, timestamp, text, boolean, integer, jsonb, index } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ============================================
// System Table (DO NOT DELETE)
// ============================================
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// ============================================
// Organizations & Members
// ============================================
export const organizations = pgTable("organizations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  description: text("description"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("organizations_slug_idx").on(table.slug),
]);

export const organizationMembers = pgTable("organization_members", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organization_id: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  user_id: varchar("user_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  joined_at: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("org_members_org_id_idx").on(table.organization_id),
  index("org_members_user_id_idx").on(table.user_id),
  index("org_members_org_user_idx").on(table.organization_id, table.user_id),
]);

// ============================================
// Skills
// ============================================
export const skills = pgTable("skills", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  organization_id: varchar("organization_id", { length: 36 }).references(() => organizations.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  version: varchar("version", { length: 20 }).notNull().default("1.0.0"),
  scope: varchar("scope", { length: 20 }).notNull().default("personal"),
  source_type: varchar("source_type", { length: 20 }).notNull().default("local"),
  source_uri: text("source_uri"),
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
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  index("skills_org_id_idx").on(table.organization_id),
  index("skills_scope_idx").on(table.scope),
  index("skills_created_by_idx").on(table.created_by),
]);

// ============================================
// Workflows
// ============================================
export const workflows = pgTable("workflows", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
  index("workflows_created_by_idx").on(table.created_by),
  index("workflows_status_idx").on(table.status),
]);

// ============================================
// Workflow Steps
// ============================================
export const workflowSteps = pgTable("workflow_steps", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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

// ============================================
// PRD Documents (final output)
// ============================================
export const prdDocuments = pgTable("prd_documents", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
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

PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent_graph` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_agent_id` text NOT NULL,
	`context_config_id` text,
	`models` text,
	`status_updates` text,
	`graph_prompt` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_graph`("tenant_id", "project_id", "id", "name", "description", "default_agent_id", "context_config_id", "models", "status_updates", "graph_prompt", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "description", "default_agent_id", "context_config_id", "models", "status_updates", "graph_prompt", "stop_when", "created_at", "updated_at" FROM `agent_graph`;--> statement-breakpoint
DROP TABLE `agent_graph`;--> statement-breakpoint
ALTER TABLE `__new_agent_graph` RENAME TO `agent_graph`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_agent_relations` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`graph_id` text NOT NULL,
	`source_agent_id` text NOT NULL,
	`target_agent_id` text,
	`external_agent_id` text,
	`relation_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent_relations`("tenant_id", "project_id", "id", "graph_id", "source_agent_id", "target_agent_id", "external_agent_id", "relation_type", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "graph_id", "source_agent_id", "target_agent_id", "external_agent_id", "relation_type", "created_at", "updated_at" FROM `agent_relations`;--> statement-breakpoint
DROP TABLE `agent_relations`;--> statement-breakpoint
ALTER TABLE `__new_agent_relations` RENAME TO `agent_relations`;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`conversation_history_config` text,
	`models` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agents`("tenant_id", "project_id", "id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
CREATE TABLE `__new_artifact_components` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`summary_props` blob,
	`full_props` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_artifact_components`("tenant_id", "project_id", "id", "name", "description", "summary_props", "full_props", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "description", "summary_props", "full_props", "created_at", "updated_at" FROM `artifact_components`;--> statement-breakpoint
DROP TABLE `artifact_components`;--> statement-breakpoint
ALTER TABLE `__new_artifact_components` RENAME TO `artifact_components`;--> statement-breakpoint
CREATE TABLE `__new_context_cache` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`context_config_id` text NOT NULL,
	`context_variable_key` text NOT NULL,
	`value` blob NOT NULL,
	`request_hash` text,
	`fetched_at` text NOT NULL,
	`fetch_source` text,
	`fetch_duration_ms` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_context_cache`("tenant_id", "project_id", "id", "conversation_id", "context_config_id", "context_variable_key", "value", "request_hash", "fetched_at", "fetch_source", "fetch_duration_ms", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "conversation_id", "context_config_id", "context_variable_key", "value", "request_hash", "fetched_at", "fetch_source", "fetch_duration_ms", "created_at", "updated_at" FROM `context_cache`;--> statement-breakpoint
DROP TABLE `context_cache`;--> statement-breakpoint
ALTER TABLE `__new_context_cache` RENAME TO `context_cache`;--> statement-breakpoint
CREATE INDEX `context_cache_lookup_idx` ON `context_cache` (`conversation_id`,`context_config_id`,`context_variable_key`);--> statement-breakpoint
CREATE TABLE `__new_context_configs` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`request_context_schema` blob,
	`context_variables` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_context_configs`("tenant_id", "project_id", "id", "name", "description", "request_context_schema", "context_variables", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "description", "request_context_schema", "context_variables", "created_at", "updated_at" FROM `context_configs`;--> statement-breakpoint
DROP TABLE `context_configs`;--> statement-breakpoint
ALTER TABLE `__new_context_configs` RENAME TO `context_configs`;--> statement-breakpoint
CREATE TABLE `__new_conversations` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`user_id` text,
	`active_agent_id` text NOT NULL,
	`title` text,
	`last_context_resolution` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_conversations`("tenant_id", "project_id", "id", "user_id", "active_agent_id", "title", "last_context_resolution", "metadata", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "user_id", "active_agent_id", "title", "last_context_resolution", "metadata", "created_at", "updated_at" FROM `conversations`;--> statement-breakpoint
DROP TABLE `conversations`;--> statement-breakpoint
ALTER TABLE `__new_conversations` RENAME TO `conversations`;--> statement-breakpoint
CREATE TABLE `__new_credential_references` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`type` text NOT NULL,
	`credential_store_id` text NOT NULL,
	`retrieval_params` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_credential_references`("tenant_id", "project_id", "id", "type", "credential_store_id", "retrieval_params", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "type", "credential_store_id", "retrieval_params", "created_at", "updated_at" FROM `credential_references`;--> statement-breakpoint
DROP TABLE `credential_references`;--> statement-breakpoint
ALTER TABLE `__new_credential_references` RENAME TO `credential_references`;--> statement-breakpoint
CREATE TABLE `__new_data_components` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`props` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_data_components`("tenant_id", "project_id", "id", "name", "description", "props", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "description", "props", "created_at", "updated_at" FROM `data_components`;--> statement-breakpoint
DROP TABLE `data_components`;--> statement-breakpoint
ALTER TABLE `__new_data_components` RENAME TO `data_components`;--> statement-breakpoint
CREATE TABLE `__new_external_agents` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`base_url` text NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`credential_reference_id`) REFERENCES `credential_references`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_external_agents`("tenant_id", "project_id", "id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at" FROM `external_agents`;--> statement-breakpoint
DROP TABLE `external_agents`;--> statement-breakpoint
ALTER TABLE `__new_external_agents` RENAME TO `external_agents`;--> statement-breakpoint
CREATE TABLE `__new_ledger_artifacts` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`task_id` text,
	`context_id` text NOT NULL,
	`type` text DEFAULT 'source' NOT NULL,
	`name` text,
	`description` text,
	`parts` blob,
	`metadata` blob,
	`summary` text,
	`mime` blob,
	`visibility` text DEFAULT 'context',
	`allowed_agents` blob,
	`derived_from` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ledger_artifacts`("tenant_id", "project_id", "id", "task_id", "context_id", "type", "name", "description", "parts", "metadata", "summary", "mime", "visibility", "allowed_agents", "derived_from", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "task_id", "context_id", "type", "name", "description", "parts", "metadata", "summary", "mime", "visibility", "allowed_agents", "derived_from", "created_at", "updated_at" FROM `ledger_artifacts`;--> statement-breakpoint
DROP TABLE `ledger_artifacts`;--> statement-breakpoint
ALTER TABLE `__new_ledger_artifacts` RENAME TO `ledger_artifacts`;--> statement-breakpoint
CREATE TABLE `__new_messages` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`from_agent_id` text,
	`to_agent_id` text,
	`from_external_agent_id` text,
	`to_external_agent_id` text,
	`content` blob NOT NULL,
	`visibility` text DEFAULT 'user-facing' NOT NULL,
	`message_type` text DEFAULT 'chat' NOT NULL,
	`agent_id` text,
	`task_id` text,
	`parent_message_id` text,
	`a2a_task_id` text,
	`a2a_session_id` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_messages`("tenant_id", "project_id", "id", "conversation_id", "role", "from_agent_id", "to_agent_id", "from_external_agent_id", "to_external_agent_id", "content", "visibility", "message_type", "agent_id", "task_id", "parent_message_id", "a2a_task_id", "a2a_session_id", "metadata", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "conversation_id", "role", "from_agent_id", "to_agent_id", "from_external_agent_id", "to_external_agent_id", "content", "visibility", "message_type", "agent_id", "task_id", "parent_message_id", "a2a_task_id", "a2a_session_id", "metadata", "created_at", "updated_at" FROM `messages`;--> statement-breakpoint
DROP TABLE `messages`;--> statement-breakpoint
ALTER TABLE `__new_messages` RENAME TO `messages`;--> statement-breakpoint
CREATE TABLE `__new_task_relations` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`parent_task_id` text NOT NULL,
	`child_task_id` text NOT NULL,
	`relation_type` text DEFAULT 'parent_child',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_task_relations`("tenant_id", "project_id", "id", "parent_task_id", "child_task_id", "relation_type", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "parent_task_id", "child_task_id", "relation_type", "created_at", "updated_at" FROM `task_relations`;--> statement-breakpoint
DROP TABLE `task_relations`;--> statement-breakpoint
ALTER TABLE `__new_task_relations` RENAME TO `task_relations`;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`context_id` text NOT NULL,
	`status` text NOT NULL,
	`metadata` blob,
	`agent_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("tenant_id", "project_id", "id", "context_id", "status", "metadata", "agent_id", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "context_id", "status", "metadata", "agent_id", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE TABLE `__new_tools` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`config` blob NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`image_url` text,
	`capabilities` blob,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_health_check` text,
	`last_error` text,
	`available_tools` blob,
	`last_tools_sync` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tools`("tenant_id", "project_id", "id", "name", "config", "credential_reference_id", "headers", "image_url", "capabilities", "status", "last_health_check", "last_error", "available_tools", "last_tools_sync", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "config", "credential_reference_id", "headers", "image_url", "capabilities", "status", "last_health_check", "last_error", "available_tools", "last_tools_sync", "created_at", "updated_at" FROM `tools`;--> statement-breakpoint
DROP TABLE `tools`;--> statement-breakpoint
ALTER TABLE `__new_tools` RENAME TO `tools`;
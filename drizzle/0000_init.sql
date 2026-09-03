-- pgvector must exist before the chunks.embedding column is created.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."note_origin" AS ENUM('manual', 'chat', 'studio');--> statement-breakpoint
CREATE TYPE "public"."source_kind" AS ENUM('pdf', 'text', 'markdown', 'web', 'youtube');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."studio_kind" AS ENUM('summary', 'briefing', 'study_guide', 'faq', 'timeline');--> statement-breakpoint
CREATE TABLE "audio_overviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"script" jsonb,
	"segments" jsonb,
	"audio_url" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"notebook_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"content" text NOT NULL,
	"start_char" integer NOT NULL,
	"end_char" integer NOT NULL,
	"segment_label" text,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb,
	"markers" jsonb,
	"scoped_source_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mind_maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"emoji" text DEFAULT '📓' NOT NULL,
	"public_slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"origin" "note_origin" DEFAULT 'manual' NOT NULL,
	"citations" jsonb,
	"markers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"kind" "source_kind" NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"blob_url" text,
	"status" "source_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"full_text" text,
	"char_count" integer DEFAULT 0 NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"page_map" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studio_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"kind" "studio_kind" NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"citations" jsonb,
	"markers" jsonb,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_overviews" ADD CONSTRAINT "audio_overviews_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_maps" ADD CONSTRAINT "mind_maps_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studio_docs" ADD CONSTRAINT "studio_docs_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audio_overviews_notebook_idx" ON "audio_overviews" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "chunks_source_idx" ON "chunks" USING btree ("source_id","idx");--> statement-breakpoint
CREATE INDEX "chunks_notebook_idx" ON "chunks" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "chunks_embedding_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_fts_idx" ON "chunks" USING gin (to_tsvector('simple', "content"));--> statement-breakpoint
CREATE INDEX "messages_notebook_idx" ON "messages" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "mind_maps_notebook_idx" ON "mind_maps" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "notebooks_owner_idx" ON "notebooks" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notebooks_public_slug_idx" ON "notebooks" USING btree ("public_slug");--> statement-breakpoint
CREATE INDEX "notes_notebook_idx" ON "notes" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "sources_notebook_idx" ON "sources" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "studio_docs_notebook_idx" ON "studio_docs" USING btree ("notebook_id","created_at");
import { desc, eq } from "drizzle-orm";

import { assertUuids, badRequest, handleRouteError, readJson, requireOwnedNotebook } from "@/lib/api";
import { CitationResolver } from "@/lib/ai/citations";
import { getClaude, groundedDefaults } from "@/lib/ai/claude";
import { buildContext } from "@/lib/ai/context";
import { CHAT_SYSTEM } from "@/lib/ai/prompts";
import { getDb } from "@/lib/db";
import { messages, notebooks, type CitationMarker, type StoredCitation } from "@/lib/db/schema";

/** Recent turns kept so follow-ups like "and the second one?" resolve. */
const HISTORY_TURNS = 10;

type ChatEvent =
  | { type: "start"; mode: "full" | "retrieval"; documents: number }
  | { type: "text"; text: string }
  | { type: "citation"; position: number; citation: StoredCitation }
  | { type: "done"; messageId: string }
  | { type: "error"; message: string };

function encodeEvent(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/notebooks/[id]/chat">,
) {
  try {
    const { id } = await ctx.params;
    const notebook = await requireOwnedNotebook(id);
    const body = await readJson<{ question?: string; sourceIds?: unknown }>(request);

    const question = body.question?.trim();
    if (!question) throw badRequest("Ask a question to get started.");

    const sourceIds = assertUuids(body.sourceIds ?? [], "source ids");
    if (sourceIds.length === 0) {
      throw badRequest("Select at least one source to ask about.");
    }

    const db = getDb();
    const context = await buildContext({
      notebookId: notebook.id,
      sourceIds,
      question,
    });

    if (context.blocks.length === 0) {
      throw badRequest(
        "None of the selected sources are ready yet. Wait for them to finish processing, or select a different source.",
      );
    }

    const history = (
      await db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.notebookId, notebook.id))
        .orderBy(desc(messages.createdAt))
        .limit(HISTORY_TURNS)
    ).reverse();

    await db.insert(messages).values({
      notebookId: notebook.id,
      role: "user",
      content: question,
      scopedSourceIds: sourceIds,
    });

    const resolver = new CitationResolver(context.refs, {
      segmentsBySource: context.segmentsBySource,
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: ChatEvent) =>
          controller.enqueue(encoder.encode(encodeEvent(event)));

        let answer = "";
        const markers: CitationMarker[] = [];

        try {
          send({
            type: "start",
            mode: context.mode,
            documents: context.blocks.length,
          });

          const claude = getClaude().beta.messages.stream({
            ...groundedDefaults(),
            max_tokens: 8000,
            // Answering from supplied documents is closer to extraction than
            // to open reasoning, so a low effort keeps the notebook feeling
            // responsive without measurably hurting the answers.
            output_config: { effort: "low" },
            system: CHAT_SYSTEM,
            messages: [
              ...history.map((turn) => ({
                role: turn.role,
                content: turn.content,
              })),
              {
                role: "user" as const,
                content: [
                  ...context.blocks,
                  { type: "text" as const, text: question },
                ],
              },
            ],
          });

          // Citations for the block currently being streamed. They cannot be
          // positioned as they arrive: Claude emits a block's citations before
          // its text, so using the running length would put every marker in
          // front of the sentence it supports instead of after it.
          let pending: StoredCitation[] = [];

          const flushCitations = () => {
            for (const citation of pending) {
              markers.push({ position: answer.length, index: citation.index });
              send({ type: "citation", position: answer.length, citation });
            }
            pending = [];
          };

          for await (const event of claude) {
            if (event.type === "content_block_stop") {
              flushCitations();
              continue;
            }
            if (event.type !== "content_block_delta") continue;

            if (event.delta.type === "text_delta") {
              answer += event.delta.text;
              send({ type: "text", text: event.delta.text });
            } else if (event.delta.type === "citations_delta") {
              const citation = resolver.add(event.delta.citation);
              if (citation) pending.push(citation);
            }
          }

          // A final block that never reported a stop must not lose its markers.
          flushCitations();

          const [saved] = await db
            .insert(messages)
            .values({
              notebookId: notebook.id,
              role: "assistant",
              content: answer,
              citations: resolver.all(),
              markers,
              scopedSourceIds: sourceIds,
            })
            .returning({ id: messages.id });

          await db
            .update(notebooks)
            .set({ updatedAt: new Date() })
            .where(eq(notebooks.id, notebook.id));

          send({ type: "done", messageId: saved.id });
        } catch (error) {
          console.error("[chat] stream failed", error);
          // The response is already a 200 by this point, so the error has to
          // be delivered in-band for the client to be able to show it.
          send({
            type: "error",
            message: "The answer could not be completed. Please try again.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Without this, proxies buffer the whole answer and streaming has no
        // visible effect.
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

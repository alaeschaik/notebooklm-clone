"use client";

import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";
import type { CitationMarker, HighlightTarget, StoredCitation } from "@/lib/types";

/**
 * Markers are woven into the text as sentinels before Markdown parsing, then
 * swapped for chips during rendering.
 *
 * Rendering Markdown first and inserting chips afterwards is not possible:
 * parsing discards the character offsets the markers are expressed in, and
 * source positions no longer correspond to anything in the output tree.
 */
const SENTINEL = /⁢(\d+)⁢/g;

export function weaveMarkers(text: string, markers: CitationMarker[]): string {
  // Applied back to front so each insertion leaves earlier offsets intact.
  return [...markers]
    .sort((a, b) => b.position - a.position)
    .reduce(
      (acc, marker) =>
        `${acc.slice(0, marker.position)}⁢${marker.index}⁢${acc.slice(marker.position)}`,
      text,
    );
}

function CitationChip({
  citation,
  onClick,
}: {
  citation: StoredCitation | undefined;
  onClick: () => void;
}) {
  if (!citation) return null;

  return (
    <button
      onClick={onClick}
      title={citation.quote}
      className="mx-0.5 inline-flex h-[1.15em] min-w-[1.15em] translate-y-[-0.1em] items-center justify-center rounded-[0.3em] bg-accent-soft px-[0.3em] align-middle text-[0.7em] font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-fg"
    >
      {citation.index}
    </button>
  );
}

/** Replaces sentinels inside rendered text nodes with citation chips. */
function withChips(
  children: ReactNode,
  citations: StoredCitation[],
  onCite: (target: HighlightTarget) => void,
): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = child.split(SENTINEL);
      if (parts.length === 1) return child;

      // split() with one capture group alternates: text, capture, text, …
      return parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const citation = citations.find((c) => c.index === Number(part));
        return (
          <CitationChip
            key={i}
            citation={citation}
            onClick={() =>
              citation &&
              onCite({
                sourceId: citation.sourceId,
                startChar: citation.startChar,
                endChar: citation.endChar,
              })
            }
          />
        );
      });
    }

    if (isValidElement<{ children?: ReactNode }>(child) && child.props.children) {
      return {
        ...child,
        props: {
          ...child.props,
          children: withChips(child.props.children, citations, onCite),
        },
      };
    }

    return child;
  });
}

export function Answer({
  content,
  citations,
  markers,
  onCitationClick,
  className,
}: {
  content: string;
  citations: StoredCitation[];
  markers: CitationMarker[];
  onCitationClick: (target: HighlightTarget) => void;
  className?: string;
}) {
  const woven = weaveMarkers(content, markers);
  const wrap = (children: ReactNode) =>
    withChips(children, citations, onCitationClick);

  return (
    <div
      className={cn(
        "text-[15px] leading-relaxed [&_a]:text-accent [&_a]:underline [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-surface-2 [&_pre]:p-3 [&_strong]:font-semibold [&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{wrap(children)}</p>,
          li: ({ children }) => <li>{wrap(children)}</li>,
          td: ({ children }) => <td>{wrap(children)}</td>,
          th: ({ children }) => <th>{wrap(children)}</th>,
          h1: ({ children }) => <h1>{wrap(children)}</h1>,
          h2: ({ children }) => <h2>{wrap(children)}</h2>,
          h3: ({ children }) => <h3>{wrap(children)}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border-strong pl-3 text-fg-muted">
              {wrap(children)}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {woven}
      </ReactMarkdown>
    </div>
  );
}

"use client";

import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { MARKER_PATTERN, weaveMarkers } from "@/lib/citation-markers";
import { cn } from "@/lib/cn";
import type { CitationMarker, HighlightTarget, StoredCitation } from "@/lib/types";

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
      title={citation.quote.trim()}
      aria-label={`${citation.sourceTitle}: ${citation.quote.trim()}`}
      className="mx-[0.15em] inline-flex size-[1.35em] translate-y-[-0.08em] items-center justify-center rounded-[0.35em] bg-accent-soft align-middle text-[0.68em] font-bold text-accent tabular-nums transition-colors hover:bg-accent hover:text-accent-fg"
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
      const parts = child.split(new RegExp(MARKER_PATTERN.source));
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
    // Prose rhythm lives in one place (globals.css) rather than as a long
    // arbitrary-variant string repeated wherever an answer is rendered.
    <div className={cn("prose-answer", className)}>
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

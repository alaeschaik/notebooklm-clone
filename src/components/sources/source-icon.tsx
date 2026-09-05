import { FileText, Globe, MonitorPlay, Type } from "lucide-react";

import type { SourceKind } from "@/lib/types";

const ICONS = {
  pdf: FileText,
  text: Type,
  markdown: Type,
  web: Globe,
  youtube: MonitorPlay,
} as const;

export function SourceIcon({
  kind,
  className,
}: {
  kind: SourceKind;
  className?: string;
}) {
  const Icon = ICONS[kind] ?? Type;
  return <Icon className={className} aria-hidden />;
}

/**
 * The English dictionary is the source of truth: `Dictionary` is derived from
 * it, so German must supply exactly the same keys or the build fails. That is
 * the whole reason the translations live in typed objects rather than JSON.
 */
export const en = {
  locale: "en",
  appName: "Notebook",
  tagline: "Ask your sources. Verify every answer.",

  common: {
    cancel: "Cancel",
    delete: "Delete",
    close: "Close",
    add: "Add",
    create: "Create",
    retry: "Try again",
    loading: "Loading…",
    generate: "Generate",
    regenerate: "Regenerate",
    copy: "Copy",
    copied: "Copied",
    save: "Save",
    confirm: "Confirm",
    remove: "Remove",
    open: "Open",
    empty: "Nothing here yet",
  },

  confirm: {
    deleteNotebook: {
      title: "Delete this notebook?",
      message:
        "Its sources, conversation, notes and generated documents are deleted with it. This cannot be undone.",
      action: "Delete notebook",
    },
    deleteSource: {
      title: "Remove this source?",
      message:
        "It will no longer be available to answer questions, and existing citations pointing at it will stop resolving.",
      action: "Remove source",
    },
    clearChat: {
      title: "Delete this conversation?",
      message: "Your sources and notes are kept. Only the messages are removed.",
      action: "Delete conversation",
    },
  },

  home: {
    heading: "Your notebooks",
    subheading:
      "Upload sources, ask questions, and get answers that link back to the exact sentence that supports them.",
    create: "New notebook",
    empty: "No notebooks yet. Create one to get started.",
    sourceCount: (n: number) => (n === 1 ? "1 source" : `${n} sources`),
    updated: "Updated",
    untitled: "Untitled notebook",
    open: "Open notebook",
  },

  sources: {
    title: "Sources",
    add: "Add source",
    empty: "Add a PDF, a web page, a YouTube video or your own text to begin.",
    selectAll: "Select all",
    deselectAll: "Deselect all",
    selectedCount: (n: number, total: number) => `${n} of ${total} selected`,
    status: {
      pending: "Queued",
      processing: "Processing…",
      ready: "Ready",
      failed: "Failed",
    },
    dialog: {
      title: "Add a source",
      upload: "Upload",
      uploadHint: "PDF, Markdown or plain text, up to 25 MB.",
      dropHere: "Drop a file, or click to browse",
      link: "Link",
      linkHint: "A web page or a YouTube video.",
      linkPlaceholder: "https://…",
      text: "Text",
      textHint: "Paste anything you want to ask about.",
      textPlaceholder: "Paste your text here…",
      titlePlaceholder: "Title (optional)",
    },
    viewer: {
      close: "Close source",
      openOriginal: "Open original",
      citedPassage: "Cited passage",
    },
  },

  chat: {
    title: "Chat",
    placeholder: "Ask anything about your sources…",
    send: "Send",
    stop: "Stop",
    empty: "Ask a question about your sources.",
    emptyNoSources: "Add a source first, then ask a question about it.",
    noSourcesSelected: "Select at least one source to ask about.",
    thinking: "Reading your sources…",
    suggestions: "Suggested questions",
    saveAsNote: "Save to notes",
    saved: "Saved",
    citationsLabel: "Sources",
    contextFull: "Reading all sources in full",
    contextRetrieval: (n: number) => `Searched ${n} passages`,
    clear: "Clear conversation",
    you: "You",
    assistant: "Notebook",
  },

  studio: {
    title: "Studio",
    audio: "Audio Overview",
    audioHint: "A two-host podcast about your sources.",
    audioGenerate: "Generate",
    audioGenerating: "Writing the script…",
    audioRendering: (done: number, total: number) =>
      `Recording ${done} of ${total}`,
    audioReady: "Ready to play",
    audioFailed: "Generation failed",
    audioWaiting: "Waiting for the speech quota to reset…",
    transcript: "Transcript",
    hideTranscript: "Hide transcript",
    docs: "Documents",
    mindMap: "Mind map",
    mindMapHint: "How the ideas in your sources connect.",
    notes: "Notes",
    notesEmpty: "Answers you save will appear here.",
    newNote: "New note",
    kinds: {
      briefing: "Briefing doc",
      study_guide: "Study guide",
      faq: "FAQ",
      timeline: "Timeline",
      summary: "Summary",
    },
    needsSources: "Add a source to use the studio.",
  },

  share: {
    action: "Share",
    title: "Share this notebook",
    description:
      "Anyone with the link can read this notebook's sources and conversation. They cannot change anything.",
    enable: "Create link",
    disable: "Stop sharing",
    copyLink: "Copy link",
    readOnly: "Read-only view",
    readOnlyBanner: "You are viewing a shared notebook. It is read-only.",
  },

  errors: {
    generic: "Something went wrong. Please try again.",
    network: "Could not reach the server. Check your connection.",
  },
};

export type Dictionary = typeof en;

/**
 * Typed as `Dictionary` rather than inferred, so a missing or renamed key is a
 * compile error instead of a string that silently falls back to English.
 */
export const de: Dictionary = {
  locale: "de",
  appName: "Notebook",
  tagline: "Frag deine Quellen. Prüfe jede Antwort.",

  common: {
    cancel: "Abbrechen",
    delete: "Löschen",
    close: "Schließen",
    add: "Hinzufügen",
    create: "Erstellen",
    retry: "Erneut versuchen",
    loading: "Wird geladen…",
    generate: "Erstellen",
    regenerate: "Neu erstellen",
    copy: "Kopieren",
    copied: "Kopiert",
    save: "Speichern",
    confirm: "Bestätigen",
    remove: "Entfernen",
    open: "Öffnen",
    empty: "Noch nichts vorhanden",
  },

  confirm: {
    deleteNotebook: {
      title: "Dieses Notizbuch löschen?",
      message:
        "Quellen, Unterhaltung, Notizen und erzeugte Dokumente werden mitgelöscht. Das lässt sich nicht rückgängig machen.",
      action: "Notizbuch löschen",
    },
    deleteSource: {
      title: "Diese Quelle entfernen?",
      message:
        "Sie steht dann nicht mehr für Antworten zur Verfügung, und vorhandene Zitate darauf lassen sich nicht mehr auflösen.",
      action: "Quelle entfernen",
    },
    clearChat: {
      title: "Diese Unterhaltung löschen?",
      message: "Quellen und Notizen bleiben erhalten. Nur die Nachrichten werden entfernt.",
      action: "Unterhaltung löschen",
    },
  },

  home: {
    heading: "Deine Notizbücher",
    subheading:
      "Quellen hochladen, Fragen stellen und Antworten erhalten, die auf genau den Satz verweisen, der sie belegt.",
    create: "Neues Notizbuch",
    empty: "Noch keine Notizbücher. Erstelle eines, um zu beginnen.",
    sourceCount: (n: number) => (n === 1 ? "1 Quelle" : `${n} Quellen`),
    updated: "Aktualisiert",
    untitled: "Unbenanntes Notizbuch",
    open: "Notizbuch öffnen",
  },

  sources: {
    title: "Quellen",
    add: "Quelle hinzufügen",
    empty:
      "Füge ein PDF, eine Webseite, ein YouTube-Video oder eigenen Text hinzu.",
    selectAll: "Alle auswählen",
    deselectAll: "Auswahl aufheben",
    selectedCount: (n: number, total: number) => `${n} von ${total} ausgewählt`,
    status: {
      pending: "In Warteschlange",
      processing: "Wird verarbeitet…",
      ready: "Bereit",
      failed: "Fehlgeschlagen",
    },
    dialog: {
      title: "Quelle hinzufügen",
      upload: "Hochladen",
      uploadHint: "PDF, Markdown oder Text, bis zu 25 MB.",
      dropHere: "Datei hierher ziehen oder klicken zum Auswählen",
      link: "Link",
      linkHint: "Eine Webseite oder ein YouTube-Video.",
      linkPlaceholder: "https://…",
      text: "Text",
      textHint: "Füge ein, worüber du sprechen möchtest.",
      textPlaceholder: "Text hier einfügen…",
      titlePlaceholder: "Titel (optional)",
    },
    viewer: {
      close: "Quelle schließen",
      openOriginal: "Original öffnen",
      citedPassage: "Zitierte Stelle",
    },
  },

  chat: {
    title: "Chat",
    placeholder: "Frag etwas über deine Quellen…",
    send: "Senden",
    stop: "Stopp",
    empty: "Stelle eine Frage zu deinen Quellen.",
    emptyNoSources:
      "Füge zuerst eine Quelle hinzu und stelle dann eine Frage dazu.",
    noSourcesSelected: "Wähle mindestens eine Quelle aus.",
    thinking: "Deine Quellen werden gelesen…",
    suggestions: "Vorgeschlagene Fragen",
    saveAsNote: "In Notizen speichern",
    saved: "Gespeichert",
    citationsLabel: "Quellen",
    contextFull: "Alle Quellen werden vollständig gelesen",
    contextRetrieval: (n: number) => `${n} Textstellen durchsucht`,
    clear: "Unterhaltung löschen",
    you: "Du",
    assistant: "Notizbuch",
  },

  studio: {
    title: "Studio",
    audio: "Audio-Überblick",
    audioHint: "Ein Podcast mit zwei Stimmen über deine Quellen.",
    audioGenerate: "Erstellen",
    audioGenerating: "Skript wird geschrieben…",
    audioRendering: (done: number, total: number) =>
      `Aufnahme ${done} von ${total}`,
    audioReady: "Bereit zum Abspielen",
    audioFailed: "Erstellung fehlgeschlagen",
    audioWaiting: "Warte auf das Zurücksetzen des Sprachkontingents…",
    transcript: "Transkript",
    hideTranscript: "Transkript ausblenden",
    docs: "Dokumente",
    mindMap: "Mindmap",
    mindMapHint: "Wie die Ideen in deinen Quellen zusammenhängen.",
    notes: "Notizen",
    notesEmpty: "Gespeicherte Antworten erscheinen hier.",
    newNote: "Neue Notiz",
    kinds: {
      briefing: "Briefing-Dokument",
      study_guide: "Lernleitfaden",
      faq: "FAQ",
      timeline: "Zeitleiste",
      summary: "Zusammenfassung",
    },
    needsSources: "Füge eine Quelle hinzu, um das Studio zu nutzen.",
  },

  share: {
    action: "Teilen",
    title: "Dieses Notizbuch teilen",
    description:
      "Wer den Link hat, kann die Quellen und die Unterhaltung lesen, aber nichts ändern.",
    enable: "Link erstellen",
    disable: "Teilen beenden",
    copyLink: "Link kopieren",
    readOnly: "Nur-Lese-Ansicht",
    readOnlyBanner:
      "Du siehst ein geteiltes Notizbuch. Es ist schreibgeschützt.",
  },

  errors: {
    generic: "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
    network: "Server nicht erreichbar. Prüfe deine Verbindung.",
  },
};

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "nb_lang";

export const dictionaries: Record<Locale, Dictionary> = { en, de };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

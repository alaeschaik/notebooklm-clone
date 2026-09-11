import type { Page } from "@playwright/test";

/** A short, fact-dense source so assertions can name exact sentences. */
export const SAMPLE_SOURCE = {
  title: "Kestrel Dam Report",
  text: [
    "The Kestrel Dam was completed in March 2019 after eleven years of construction.",
    "Its reservoir holds 4.2 cubic kilometres of water at full capacity.",
    "",
    "Sediment surveys in 2024 measured 61 million tonnes, against a forecast of 38 million tonnes.",
    "Engineers now expect the reservoir to lose a fifth of its storage capacity by 2058.",
    "",
    "The fish ladder on the eastern spillway has been judged ineffective.",
    "Only 4 percent of tagged salmon navigated it in 2024, against a 70 percent target.",
  ].join("\n"),
};

/**
 * Seeds a notebook through the API rather than by driving the UI. These tests
 * are about what the browser does with the result; clicking through the
 * upload dialog to get there would make every test slower and give each one a
 * second thing that can fail.
 */
export async function seedNotebook(page: Page): Promise<string> {
  await page.goto("/");

  return page.evaluate(async (source) => {
    const created = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Untitled notebook" }),
    });
    const { notebook } = (await created.json()) as { notebook: { id: string } };

    await fetch(`/api/notebooks/${notebook.id}/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "text", ...source }),
    });

    return notebook.id;
  }, SAMPLE_SOURCE);
}

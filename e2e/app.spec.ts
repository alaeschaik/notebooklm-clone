import { expect, test } from "@playwright/test";

import { seedNotebook } from "./fixtures";

test.describe("application shell", () => {
  test("creates a notebook from the index", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /your notebooks/i })).toBeVisible();

    await page.getByRole("button", { name: /new notebook/i }).click();
    await page.waitForURL(/\/notebook\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: /sources/i })).toBeVisible();
  });

  test("the workspace fills the viewport", async ({ page }) => {
    // A regression test for a real bug: every column was a flex item with no
    // height, so each stopped at its content and the composer floated in the
    // middle of the window. Unit tests cannot see this.
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);
    await expect(page.getByRole("heading", { name: /studio/i })).toBeVisible();

    const metrics = await page.evaluate(() => {
      const columns = [...document.querySelectorAll("main > *")].map(
        (el) => Math.round(el.getBoundingClientRect().bottom),
      );
      return {
        viewport: window.innerHeight,
        columns,
        documentScrollHeight: document.documentElement.scrollHeight,
      };
    });

    for (const bottom of metrics.columns) {
      expect(bottom).toBe(metrics.viewport);
    }
    // The shell owns the scrolling; the page itself must never scroll.
    expect(metrics.documentScrollHeight).toBe(metrics.viewport);
  });

  test("renders without hydration mismatches or console errors", async ({ page }) => {
    // Both of the layout bugs this project shipped announced themselves here
    // first: a hydration mismatch on the notebook cards, and a server-side
    // ReferenceError on any shared notebook.
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));

    const id = await seedNotebook(page);
    await page.goto("/");
    await page.goto(`/notebook/${id}`);
    await expect(page.getByRole("heading", { name: /studio/i })).toBeVisible();

    expect(problems.filter((p) => !/favicon|404 \(Not Found\)/i.test(p))).toEqual([]);
  });

  test("switches language and keeps the notebook usable", async ({ page }) => {
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    await page.getByRole("button", { name: "de", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Quellen" })).toBeVisible();

    await page.getByRole("button", { name: "en", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sources" })).toBeVisible();
  });

  test("shares a notebook read-only", async ({ page, context }) => {
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    const slug = await page.evaluate(async (notebookId) => {
      const response = await fetch(`/api/notebooks/${notebookId}/share`, { method: "POST" });
      return ((await response.json()) as { publicSlug: string }).publicSlug;
    }, id);

    // A fresh context has no session cookie — exactly what a recipient has.
    const stranger = await context.browser()!.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto(`/share/${slug}`);

    await expect(strangerPage.getByText(/read-only/i).first()).toBeVisible();
    await expect(strangerPage.getByRole("textbox")).toHaveCount(0);
    // The owner-scoped route must still refuse them.
    await expect(strangerPage.locator(`text=${id}`)).toHaveCount(0);
    await stranger.close();
  });

  test("reports a bad URL instead of ingesting an empty source", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /new notebook/i }).click();
    await page.waitForURL(/\/notebook\//);

    await page.getByRole("button", { name: /^add$/i }).click();
    await page.getByRole("tab", { name: /link/i }).click();
    await page.getByPlaceholder("https://").fill("https://example.com/definitely-not-here-zzqq");
    await page.getByRole("button", { name: /^add$/i }).last().click();

    // Scoped to the dialog: the same message is also shown on the source card
    // behind it, and an unscoped locator matches both.
    await expect(
      page.getByRole("dialog").getByText(/returned 404|could not reach/i),
    ).toBeVisible({ timeout: 30_000 });

    // The source is recorded as failed rather than silently ingesting nothing,
    // so the reason survives on its card too. Targeted by the card's own
    // accessible name — the add dialog is rendered inside the sources panel, so
    // a text match scoped to that region still finds both copies.
    await expect(
      page.getByRole("button", { name: /example\.com returned 404/i }),
    ).toBeVisible();
  });
});

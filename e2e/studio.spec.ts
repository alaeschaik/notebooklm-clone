import { expect, test } from "@playwright/test";

import { seedNotebook } from "./fixtures";

/** These generate real documents, so they are slow by nature. */
test.describe("studio", () => {
  test.slow();

  test("a saved answer appears in notes without a reload", async ({ page }) => {
    // The note is written from the chat pane and displayed in the studio pane,
    // which reads a separate cache entry. They used to drift until reload.
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    await page.getByPlaceholder(/ask anything/i).fill("How much sediment was measured?");
    await page.keyboard.press("Enter");
    await expect(page.locator(".prose-answer").last()).toBeVisible({ timeout: 120_000 });

    await expect(page.getByText(/answers you save will appear here/i)).toBeVisible();

    await page.getByRole("button", { name: /save to notes/i }).click();
    await expect(page.getByRole("button", { name: /saved/i })).toBeVisible();

    // No reload between the save and this assertion.
    await expect(page.getByText(/answers you save will appear here/i)).toHaveCount(0);
  });

  test("downloads a generated document as Markdown", async ({ page }) => {
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    await page.getByRole("button", { name: /^faq$/i }).click();

    // Generation is asynchronous; the row becomes clickable once it is ready.
    const row = page.getByRole("button", { name: /^faq$/i }).last();
    await expect(row).toBeEnabled({ timeout: 180_000 });
    await expect(page.getByTitle(/download/i).first()).toBeVisible({
      timeout: 180_000,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTitle(/download/i).first().click(),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.md$/);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const markdown = Buffer.concat(chunks).toString("utf8");

    expect(markdown).toMatch(/^# /);
    // Citations are the point of the app; a download that dropped them would
    // be a worse artefact than the screen it came from.
    expect(markdown).toContain("## Sources");
    expect(markdown).toMatch(/\[\d\]/);
  });
});

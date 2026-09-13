import { expect, test } from "@playwright/test";

import { SAMPLE_SOURCE, seedNotebook } from "./fixtures";

/**
 * The app's central claim, exercised through the browser: an answer streams in,
 * citation markers appear beside the claims they support, and clicking one
 * opens the source scrolled to — and highlighting — the exact quoted sentence.
 *
 * This calls the real model, so it is slower and costs a little. It is also the
 * only test that proves the feature works rather than that its parts do.
 */
test.describe("grounded answers", () => {
  test.slow();

  test("cites a source and highlights the passage on click", async ({ page }) => {
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    await page
      .getByPlaceholder(/ask anything/i)
      .fill("What did the 2024 sediment survey measure, and what was forecast?");
    await page.keyboard.press("Enter");

    // The answer must actually contain the figures from the source.
    await expect(page.getByText(/61 million/)).toBeVisible({ timeout: 120_000 });

    const citation = page.locator("button").filter({ hasText: /^\d$/ }).first();
    await expect(citation).toBeVisible({ timeout: 120_000 });
    await citation.click();

    const highlight = page.locator("mark");
    await expect(highlight).toBeVisible();

    // The highlighted text must be a real substring of the source, not an
    // approximation of it.
    const highlighted = ((await highlight.first().textContent()) ?? "").trim();
    expect(highlighted.length).toBeGreaterThan(10);
    expect(SAMPLE_SOURCE.text.replace(/\s+/g, " ")).toContain(
      highlighted.replace(/\s+/g, " "),
    );
  });

  test("does not answer from outside the sources", async ({ page }) => {
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    await page
      .getByPlaceholder(/ask anything/i)
      .fill("What is the capital of Australia?");
    await page.keyboard.press("Enter");

    // Asserted as a property rather than on wording: how the model phrases a
    // refusal varies between runs, but answering "Canberra" — which appears
    // nowhere in the sources — is unambiguously the failure this guards
    // against, and it is the one thing a grounded notebook must never do.
    const answer = page.locator(".prose-answer").last();
    await expect(answer).toBeVisible({ timeout: 120_000 });
    await expect(answer).not.toBeEmpty();
    await expect(page.getByText(/Canberra/i)).toHaveCount(0);

    // And nothing was cited, because nothing supports an answer.
    await expect(page.getByText(/^sources$/i).nth(1)).toHaveCount(0);
  });
});

test.describe("answer language", () => {
  test.slow();

  test("answers in the language of the question, not of the sources", async ({ page }) => {
    // Regression: a German-looking source name was enough to make an English
    // question come back answered in German.
    const id = await seedNotebook(page);
    await page.goto(`/notebook/${id}`);

    await page
      .getByPlaceholder(/ask anything/i)
      .fill("What did the 2024 sediment survey measure?");
    await page.keyboard.press("Enter");

    const answer = page.locator(".prose-answer").last();
    await expect(answer).toBeVisible({ timeout: 120_000 });
    await expect(answer).toContainText(/61 million/i, { timeout: 120_000 });
    // German would render these instead.
    await expect(answer).not.toContainText(/Millionen|Tonnen|ergaben/);
  });
});

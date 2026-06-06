import { describe, expect, it } from "vitest";
import { createDictionaryFetchUrl, validateDictionaryText } from "../domain/dictionary";

describe("dictionary validation", () => {
  it("normalizes, deduplicates, sorts and reports rejected words", () => {
    const report = validateDictionaryText("STARE\nstare\nabc123\ntrefl\nżółty\nsześc");

    expect(report.words).toEqual(["stare", "sześc", "trefl", "żółty"]);
    expect(report.rawCount).toBe(6);
    expect(report.rejectedCount).toBe(2);
  });

  it("adds a cache buster only when the dictionary is force refreshed", () => {
    expect(createDictionaryFetchUrl("/slowa.txt", false, "123")).toBe("/slowa.txt");
    expect(createDictionaryFetchUrl("/slowa.txt", true, "123")).toBe("/slowa.txt?_slowo_refresh=123");
    expect(createDictionaryFetchUrl("/slowa.txt?v=1#top", true, "123")).toBe("/slowa.txt?v=1&_slowo_refresh=123#top");
  });
});

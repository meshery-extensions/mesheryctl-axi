import { describe, expect, it } from "vitest";
import { AxiError } from "../src/errors.js";
import { listQueryFromFlags, listTotal, nextPage } from "../src/server.js";

describe("list pagination metadata", () => {
  it("normalizes current and legacy totals", () => {
    expect(listTotal({ totalCount: 7 })).toBe(7);
    expect(listTotal({ total_count: 6 })).toBe(6);
    expect(listTotal({ total: "5" })).toBe(5);
    expect(listTotal({ totalCount: null })).toBeUndefined();
    expect(listTotal({ totalCount: 7.5 })).toBeUndefined();
    expect(listTotal({ total_count: "7.5" })).toBeUndefined();
  });

  it("suggests a next page only for a full page with more results", () => {
    expect(nextPage(0, 10, 10, 11)).toBe(2);
    expect(nextPage(0, 10, 9, 11)).toBeUndefined();
    expect(nextPage(0, 10, 10, 10)).toBeUndefined();
  });

  it("matches the Meshery Server page-size cap", () => {
    expect(listQueryFromFlags(["--pagesize", "250"])).toEqual({
      page: 0,
      pagesize: 100,
    });
  });

  it("preserves defaults, one-based pages, and the --limit alias", () => {
    expect(listQueryFromFlags([])).toEqual({ page: 0, pagesize: 10 });
    expect(listQueryFromFlags(["--page=2", "--limit", "5"])).toEqual({
      page: 1,
      pagesize: 5,
    });
  });

  it("uses the last value of repeated pagination flags", () => {
    expect(listQueryFromFlags([
      "--page=2", "--page", "4", "--pagesize", "5", "--pagesize=20",
    ])).toEqual({
      page: 3,
      pagesize: 20,
    });
    expect(listQueryFromFlags(["--limit=5", "--limit", "15"])).toEqual({
      page: 0,
      pagesize: 15,
    });
    expect(listQueryFromFlags([
      "--pagesize=20", "--limit=5", "--limit=30",
    ])).toEqual({
      page: 0,
      pagesize: 20,
    });
  });

  it.each([
    ["--page", "2oops"],
    ["--page=0"],
    ["--page=1.5"],
    ["--page=9007199254740992"],
    ["--pagesize", "5oops"],
    ["--pagesize=0"],
    ["--limit=abc"],
    ["--limit=-1"],
    ["--page"],
    ["--pagesize="],
    ["--limit"],
    ["--pagesize=5", "--limit=abc"],
    ["--page=2", "--page=bad"],
    ["--page=bad", "--page=2"],
    ["--pagesize=bad", "--pagesize=5"],
    ["--limit=bad", "--limit=5"],
  ])("rejects malformed pagination arguments %j", (...args) => {
    expect(() => listQueryFromFlags(args)).toThrowError(AxiError);
  });
});

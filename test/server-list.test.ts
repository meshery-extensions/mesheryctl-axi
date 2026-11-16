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
  ])("rejects malformed pagination arguments %j", (...args) => {
    expect(() => listQueryFromFlags(args)).toThrowError(AxiError);
  });
});

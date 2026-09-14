import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { LearningsStore, validRepoSegment } from "../../src/learnings.js";

describe("validRepoSegment", () => {
  it("accepts the GitHub-legal owner/name character set", () => {
    for (const ok of ["mk7luke", "DiffSentry", "my.repo", "my-repo", "my_repo", "a1"]) {
      expect(validRepoSegment(ok)).toBe(true);
    }
  });

  it("rejects separators and the traversal specials", () => {
    for (const bad of [".", "..", "a/b", "a\\b", "", "a b", "*"]) {
      expect(validRepoSegment(bad)).toBe(false);
    }
  });
});

describe("LearningsStore path safety", () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "ds-learnings-"));
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it("round-trips learnings for a well-formed repo", async () => {
    const store = new LearningsStore(baseDir);
    await store.addLearning("mk7luke/DiffSentry", "prefer explicit returns");
    const got = await store.getLearnings("mk7luke/DiffSentry");
    expect(got).toHaveLength(1);
    expect(got[0].content).toBe("prefer explicit returns");
  });

  it("degrades to no learnings instead of throwing on a traversal segment", async () => {
    // The legacy GET /repo/:owner/:repo route hands req.params straight to
    // this call, and the reviewer makes it inside a Promise.all — a throw
    // there would fail the entire review rather than losing an optional
    // knowledge source. Regression guard for that read path.
    const store = new LearningsStore(baseDir);
    await expect(store.getLearnings("../etc/passwd")).resolves.toEqual([]);
    await expect(store.getLearnings("..")).resolves.toEqual([]);
    await expect(store.getLearnings("a/../../b")).resolves.toEqual([]);
  });

  it("returns no learnings when the stored file is a JSON object, not an array", async () => {
    const store = new LearningsStore(baseDir);
    await fs.mkdir(path.join(baseDir, "owner"), { recursive: true });
    await fs.writeFile(path.join(baseDir, "owner", "name.json"), '{"not":"an array"}', "utf-8");
    await expect(store.getLearnings("owner/name")).resolves.toEqual([]);
  });

  it("refuses to WRITE through a traversal segment", async () => {
    // Reads degrade, but a write must never land outside baseDir.
    const store = new LearningsStore(baseDir);
    await expect(store.addLearning("../escape", "should not be written")).rejects.toThrow(
      /Invalid repository segment/,
    );
    const stray = await fs.readdir(path.dirname(baseDir));
    expect(stray).not.toContain("escape.json");
  });
});

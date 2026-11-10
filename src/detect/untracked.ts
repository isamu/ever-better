/** What git said about the working copy. `untracked` is a subset of `all`. */
export type GitListing = {
  all: readonly string[];
  untracked: readonly string[];
  /** False for a fresh `git init`, where every file is untracked. */
  hasCommits: boolean;
};

export type CensusFiles = {
  /** The files a count may be taken over. */
  counted: string[];
  /** Untracked files kept out of it, so the report can say so. */
  leftOut: string[];
};

/**
 * A count becomes a ceiling, and a ceiling has to mean the same thing on CI and on another clone —
 * both see only what is committed. A scratch file in one working copy is not source there.
 *
 * Until the first commit everything is untracked, so leaving untracked files out would report a
 * fresh project as having no source at all.
 */
export const censusFiles = (listing: GitListing): CensusFiles => {
  if (!listing.hasCommits || listing.untracked.length === 0) return { counted: [...listing.all], leftOut: [] };
  const untracked = new Set(listing.untracked);
  return {
    counted: listing.all.filter((file) => !untracked.has(file)),
    leftOut: listing.all.filter((file) => untracked.has(file)),
  };
};

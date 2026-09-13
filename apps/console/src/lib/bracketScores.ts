import type { ResultDTO, BracketSetScore } from '../api/bracketDto';

export function validBracketSets(result: ResultDTO | undefined): BracketSetScore[] {
  return Array.isArray(result?.score?.sets)
    ? result.score.sets.filter(
        (s): s is BracketSetScore =>
          !!s && typeof s.sideA === "number" && typeof s.sideB === "number",
      )
    : [];
}

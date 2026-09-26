import { freeFlags, pricedFlags, type FlagCost } from "./probe/tsconfigCost.ts";

export type StrictnessResult = {
  applied: string[];
  priced: FlagCost[];
  message: string;
};

const describePriced = (priced: readonly FlagCost[]): string[] => priced.map((cost) => `  ${cost.flag}: ${cost.errors ?? "?"} type errors — left off`);

export const strictnessReport = (costs: readonly FlagCost[]): StrictnessResult => {
  const free = freeFlags(costs);
  const priced = pricedFlags(costs);
  const lines = [
    free.length > 0 ? `Enabled at zero cost: ${free.join(", ")}` : "Nothing was free to enable.",
    ...(priced.length > 0 ? ["Priced and left off — each is a task, not a flag flip:"] : []),
    ...describePriced(priced),
  ];
  return { applied: free, priced, message: lines.join("\n") };
};

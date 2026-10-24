/**
 * Headline of the match report: a plain-language verdict first, the number second.
 * @startingPoint section="Match" subtitle="Match verdict hero with score and counts" viewport="760x260"
 */
export interface MatchVerdictProps {
  /** One sentence in human terms: "Strong fit — 3 quick fixes will make your CV show it." */
  headline: React.ReactNode;
  summary?: React.ReactNode;
  score: number;
  previous?: number;
  scoreLabel?: React.ReactNode;
  /** e.g. [{value:4,label:'Already in your CV'},{value:3,label:'Ready to add'}] */
  counts?: Array<{ value: React.ReactNode; label: React.ReactNode; color?: string }>;
  actions?: React.ReactNode;
}

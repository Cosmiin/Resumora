/** One job requirement and how your CV covers it (maps PRD §7 statuses to plain language). */
export interface KeywordRowProps {
  term: React.ReactNode;
  /** included | verified_equivalent → equivalent | verified_omitted → omitted | awaiting_confirmation → confirm | unsupported → gap */
  state?: 'included' | 'equivalent' | 'omitted' | 'confirm' | 'gap';
  required?: boolean;
  /** One sentence: the evidence or what's missing */
  detail?: React.ReactNode;
  /** Small Button for the next step */
  action?: React.ReactNode;
  last?: boolean;
}

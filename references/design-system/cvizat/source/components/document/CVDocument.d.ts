/**
 * Rendered CV page in one of two single-column templates. Same facts, different presentation.
 * @startingPoint section="Document" subtitle="CV preview, Clar (serif) and Contur (sans) templates" viewport="700x400"
 */
export interface CVDocumentProps {
  /** clar = editorial serif; contur = sans with pine accent band */
  template?: 'clar' | 'contur';
  name: string;
  /** Up to two positioning titles */
  titles?: string[];
  contact?: React.ReactNode;
  sections?: Array<{ title: string; text?: string; items?: Array<{ heading?: string; dates?: string; sub?: string; bullets?: string[] }> }>;
  /** Bullet strings to highlight as newly added */
  highlight?: string[];
  scale?: number;
}

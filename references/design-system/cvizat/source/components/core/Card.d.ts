/** Panel container. White on the sage page; hero tone for the one welcoming block per screen. */
export interface CardProps {
  tone?: 'default' | 'hero' | 'sunken' | 'inverse';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
  children?: React.ReactNode;
  /** Makes the whole card a button */
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * File upload area with drag state and uploaded-file row.
 * @startingPoint section="Forms" subtitle="CV upload dropzone" viewport="560x220"
 */
export interface DropzoneProps {
  title?: string;
  /** input accept attribute */
  accept?: string;
  acceptLabel?: string;
  /** When set, shows the uploaded-file row instead */
  file?: { name: string; size?: string };
  onFile?: (f: { name: string; size: string; file: File }) => void;
  onRemove?: () => void;
}

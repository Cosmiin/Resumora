/** Clickable row-card that starts or resumes a task (an application, a journey). */
export interface TaskCardProps {
  icon?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  /** Pills */
  meta?: React.ReactNode;
  onClick?: () => void;
  /** Hero tint + filled icon for the recommended next task */
  emphasis?: boolean;
}

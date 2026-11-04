/** Decorative activity only: no invented percentages or processing milestones. */
export function ActivityAnimation({
  kind = "writing",
  active = true,
}: {
  kind?: "reading" | "writing";
  active?: boolean;
}) {
  return (
    <div
      className={`activity-art activity-art-${kind}${active ? "" : " is-paused"}`}
      aria-hidden="true"
    >
      <div className="activity-document">
        <span className="activity-document-heading" />
        <span />
        <span />
        <span />
        <span />
        <i className="activity-scan" />
      </div>
      <div className="activity-dots">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

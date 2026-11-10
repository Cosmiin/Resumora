/** How far along a count is, with its words: "2 of 4 answered". `tone="good"` for the keyword bar. */
export function Progress(props: { label: string; valueText: string; value: number; max: number; tone?: "coach" | "good" }) {
  const { label, valueText, value, max, tone = "coach" } = props;
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div className={tone === "good" ? "ui-progress ui-progress--good" : "ui-progress"}>
      <div className="ui-progress-top">
        <span>{label}</span>
        <span>{valueText}</span>
      </div>
      <div className="ui-progress-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}>
        <div className="ui-progress-fill" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}

/** The steps of a flow, in order, with the current one marked. Steps before it count as done. */
export function Stepper({ label, steps, current }: { label: string; steps: string[]; current: number }) {
  return (
    <ol className="ui-stepper" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step} className={index < current ? "ui-step ui-step--done" : "ui-step"} aria-current={index === current ? "step" : undefined}>
          <span className="ui-step-n" aria-hidden="true">
            {index + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

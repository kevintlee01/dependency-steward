import type { RunStepRecord } from "@dependency-steward/shared";

export function RunTimeline({ steps }: { steps: RunStepRecord[] }) {
  return (
    <ol className="ds-timeline">
      {steps.map((step) => (
        <li className="ds-timeline__item" key={step.id}>
          <div className={`ds-timeline__status ds-timeline__status--${step.status}`} />
          <div>
            <p className="ds-timeline__title">{step.stepKey}</p>
            <p className="ds-timeline__meta">{step.status.replaceAll("_", " ")}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
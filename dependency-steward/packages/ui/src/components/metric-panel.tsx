import type { ReactNode } from "react";

interface MetricPanelProps {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}

export function MetricPanel({ label, value, detail }: MetricPanelProps) {
  return (
    <div className="ds-metric-panel">
      <p className="ds-metric-panel__label">{label}</p>
      <p className="ds-metric-panel__value">{value}</p>
      {detail ? <p className="ds-metric-panel__detail">{detail}</p> : null}
    </div>
  );
}
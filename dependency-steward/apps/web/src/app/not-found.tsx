import Link from "next/link";

import { Card } from "@dependency-steward/ui";

export default function NotFound() {
  return (
    <Card eyebrow="Not Found" title="Requested item was not found" subtitle="The repository or run may not exist yet, or the API is unavailable.">
      <Link className="ds-button ds-button--primary" href="/">
        Return to dashboard
      </Link>
    </Card>
  );
}
import type { PropsWithChildren } from "react";

import "./globals.css";

export const metadata = {
  title: "Dependency Steward",
  description: "Coverage-aware dependency maintenance control plane"
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body>
        <div className="ds-shell">
          <header className="ds-topbar">
            <div>
              <p className="ds-topbar__kicker">Dependency Steward</p>
              <h1 className="ds-topbar__title">Safety-first dependency operations</h1>
            </div>
            <p className="ds-topbar__meta">Pinned to GPT-5.4 for structured reasoning and reviewable output</p>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
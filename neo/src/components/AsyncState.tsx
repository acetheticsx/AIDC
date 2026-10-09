import type { ReactNode } from "react";
type Props = { loading: boolean; error?: string | null; empty?: boolean; emptyTitle?: string; emptyText?: string; onRetry?: () => void; children: ReactNode };
export function AsyncState({ loading, error, empty, emptyTitle = "Nothing here yet", emptyText = "There is no data to display.", onRetry, children }: Props) {
  if (loading) return <div className="neo-state" aria-live="polite"><span className="neo-spinner" aria-hidden="true" /><strong>Loading</strong><span>Fetching the latest data.</span></div>;
  if (error) return <div className="neo-state neo-state-error" role="alert"><strong>Unable to load this view</strong><span>{error}</span>{onRetry && <button className="neo-button neo-button-secondary" onClick={onRetry}>Retry</button>}</div>;
  if (empty) return <div className="neo-state"><span className="neo-empty-icon" aria-hidden="true">○</span><strong>{emptyTitle}</strong><span>{emptyText}</span></div>;
  return <>{children}</>;
}

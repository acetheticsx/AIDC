export type User = { id: string; email?: string | null; name?: string | null; picture?: string | null; avatar_url?: string | null };
export type Application = { id: string; name: string; description?: string | null; client_id?: string | null; origin_url?: string | null; application_type?: string | null; status?: string | null; created_at?: string; updated_at?: string };
export type Quota = { plan?: string | null; name?: string | null; status?: string | null; count?: number | null; limit?: number | null; remaining?: number | null };
export type RedirectUri = { id: string; application_id: string; uri: string; created_at?: string };
export type ActivityEvent = { id: string; application_id: string; application_name?: string; event_type: string; success: boolean; metadata?: Record<string, unknown> | null; created_at: string };
export type LoginAnalytics = { days: number; items: { date: string; count: number; uniqueUsers: number; failedAttempts: number }[]; total: number; failedAttempts: number; uniqueUsers: number };
export type OperationsAnalytics = { days: number; sessions: { active: number; recent: unknown[] }; uptime: { operational: number; total: number; average_percent: number | null; applications: unknown[] } };
export type DiscoveryStatus = { status?: string; issuer?: string; lastAttemptAt?: number; lastError?: string | null };
export type ApiError = Error & { status?: number; code?: string; data?: unknown };

export type AppCredential = { id: string; application_id: string; secret_prefix: string; created_at: string; last_used_at?: string | null; revoked_at?: string | null; secret?: string };
export type AppBranding = { application_id: string; display_name?: string | null; logo_url?: string | null; accent_color?: string | null; updated_at?: string | null };

export type Entitlements = { plan?: string | null; name?: string | null; status?: string | null; applications?: number | null; mau?: number | null; limits?: Record<string, number | string | boolean | null>; features?: Record<string, boolean | string | number | null>; subscription?: { provider?: string | null; source?: string | null; paymentMethod?: string | null; payment_method?: string | null; billing_period_end?: string | null; grant_expires_at?: string | null } | null; manageUrl?: string | null; verified?: boolean; source?: string };
export type SessionRecord = { id: string; user_id: string; email?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null; created_at: string; last_seen_at?: string | null; expires_at: string; revoked_at?: string | null; user_agent?: string | null; authenticated_at?: string | null; status: "active" | "expired" | "revoked" };
export type UptimeReport = { days: number; summary: { total_checks: number; successful_checks: number; uptime_percent: number | null; last_checked_at: string | null; status: "operational" | "degraded" | "no_data" }; daily: { day: string; checks: number; successes: number; uptime_percent: number | null }[]; latest: { success: boolean; created_at: string; metadata?: Record<string, unknown> } | null };
export type UserRecord = { id: string; email?: string | null; username?: string | null; display_name?: string | null; avatar_url?: string | null; email_verified?: boolean; created_at: string; updated_at?: string; frozen_at?: string | null; onboarding_completed_at?: string | null };

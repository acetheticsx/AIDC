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

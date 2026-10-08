export type User = { id: string; email?: string; name?: string };
export type Application = {
  id: string; name: string; description?: string | null; origin_url?: string | null;
  application_type?: string | null; created_at?: string; updated_at?: string;
};
export type Quota = { plan?: string | null; name?: string | null; status?: string | null; count?: number | null; limit?: number | null; remaining?: number | null };
export type ApiError = Error & { status?: number; code?: string; data?: unknown };

export const routes = [
  { id: "overview", label: "Overview", icon: "⌂" },
  { id: "applications", label: "Applications", icon: "▣" },
  { id: "activity", label: "Activity", icon: "◷" },
  { id: "settings", label: "Settings", icon: "⚙" }
] as const;
export type RouteId = (typeof routes)[number]["id"];
export function readRoute(): RouteId {
  const value = window.location.hash.replace(/^#\/?/, "");
  return routes.some((route) => route.id === value) ? value as RouteId : "overview";
}
export function navigate(route: RouteId) {
  window.location.hash = route === "overview" ? "" : route;
}

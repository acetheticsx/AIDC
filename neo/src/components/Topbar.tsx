import { navigate, type RouteId } from "../lib/navigation";
type Props = { route: RouteId; onCommand: () => void };
export function Topbar({ route, onCommand }: Props) {
  const label = route[0].toUpperCase() + route.slice(1);
  return <header className="neo-topbar"><div><span className="neo-kicker">Developer Console</span><h1>{label}</h1></div><div className="neo-top-actions"><button className="neo-command" onClick={onCommand} aria-label="Open command palette"><span>⌕</span><span>Search</span><kbd>⌘ K</kbd></button><button className="neo-icon-button" onClick={() => navigate("settings")} aria-label="Open settings">⚙</button></div></header>;
}

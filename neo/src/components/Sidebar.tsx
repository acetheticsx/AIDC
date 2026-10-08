import { routes, navigate, type RouteId } from "../lib/navigation";
type Props = { route: RouteId; userName?: string; onSignIn: () => void };
export function Sidebar({ route, userName, onSignIn }: Props) {
  return <aside className="neo-sidebar">
    <div className="neo-brand"><span className="neo-mark" aria-hidden="true">A</span><div><strong>AIDC</strong><span>Neo</span></div></div>
    <nav aria-label="Primary navigation" className="neo-nav">
      {routes.map((item) => <button key={item.id} className={route === item.id ? "active" : ""} aria-current={route === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
    </nav>
    <div className="neo-sidebar-bottom">
      {userName ? <div className="neo-user"><span className="neo-avatar" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span><span className="neo-user-copy"><strong>{userName}</strong><small>Signed in</small></span></div> : <button className="neo-button neo-button-primary neo-full" onClick={onSignIn}>Continue with Ace ID</button>}
    </div>
  </aside>;
}

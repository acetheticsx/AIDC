import { useEffect, useRef, useState } from "react";
import { routes, navigate } from "../lib/navigation";
type Props = { open: boolean; onClose: () => void };
export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(""); window.setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => { if (!open) return; const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open, onClose]);
  if (!open) return null;
  const filtered = routes.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="neo-overlay" role="presentation" onMouseDown={onClose}><section className="neo-command-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Go to…" aria-label="Search commands" /><div className="neo-command-results">{filtered.length ? filtered.map((item) => <button key={item.id} onClick={() => { navigate(item.id); onClose(); }}><span>{item.icon}</span><span>{item.label}</span><small>Open</small></button>) : <p className="neo-command-empty">No matching commands.</p>}</div><div className="neo-command-footer"><span>Esc to close</span><span>Keyboard-first navigation.</span></div></section></div>;
}

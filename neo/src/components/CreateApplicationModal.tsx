import { FormEvent, useState } from "react";
import type { ApiError } from "../types";

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onCreate: (input: { name: string; description: string; origin_url?: string }) => Promise<void>;
};

export function CreateApplicationModal({ open, busy, error, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [originUrl, setOriginUrl] = useState("");

  if (!open) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    await onCreate({
      name: name.trim(),
      description: description.trim(),
      origin_url: originUrl.trim() || undefined
    });

    setName("");
    setDescription("");
    setOriginUrl("");
  };

  return (
    <div className="neo-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="neo-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-app-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="neo-modal-head">
          <div>
            <span className="neo-kicker">New application</span>
            <h2 id="create-app-title">Create a real client</h2>
          </div>
          <button className="neo-icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className="neo-modal-note">
          This creates the application through the server. Neo never fabricates
          client IDs or local application records.
        </p>

        <form onSubmit={submit} className="neo-form">
          <label>
            Application name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="My application"
              autoFocus
            />
          </label>

          <label>
            Description
            <textarea
              maxLength={2000}
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this application is used for"
            />
            <small>{description.length}/2000</small>
          </label>

          <label>
            Origin URL
            <input
              inputMode="url"
              type="url"
              value={originUrl}
              onChange={(event) => setOriginUrl(event.target.value)}
              placeholder="https://example.com"
            />
            <small>HTTPS origins require domain verification.</small>
          </label>

          {error && <div className="neo-form-error" role="alert">{error}</div>}

          <div className="neo-modal-actions">
            <button type="button" className="neo-button neo-button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="neo-button neo-button-primary" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create application"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

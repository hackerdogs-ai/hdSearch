'use client';

import { useCallback, useEffect, useState } from 'react';

interface AdminModel {
  id: string;
  provider: string;
  label: string;
  contextTokens: number;
  maxOutputTokens: number;
  capabilities: { tools: boolean; vision: boolean; thinking: boolean; streaming: boolean };
  defaultRank: number;
  enabled: boolean;
  plans: string[];
  source: string; // 'json' | 'admin'
}
interface Provider { id: string; name: string }

const BLANK = {
  id: '',
  providerId: '',
  label: '',
  contextTokens: 128000,
  maxOutputTokens: 8192,
  defaultRank: 100,
  capabilities: { tools: true, vision: false, thinking: false, streaming: true },
  enabled: true,
};
type Form = typeof BLANK;

const CAPS = ['tools', 'vision', 'thinking', 'streaming'] as const;

// Admin registry for AI Search models — add / edit / delete, wired to
// /v1/admin/llm-models. Pricing is intentionally omitted (no plan/credit tiers).
export function ModelRegistryManager() {
  const [models, setModels] = useState<AdminModel[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState<Form>(BLANK);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([
        fetch('/api/panel/llm-models').then((r) => r.json()),
        fetch('/api/panel/llm-providers').then((r) => r.json()),
      ]);
      setModels(m.models || []);
      setProviders((p.providers || []).map((x: any) => ({ id: x.id, name: x.name || x.id })));
    } catch {
      setMsg({ kind: 'err', text: 'Could not load the model registry.' });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const startAdd = () => { setForm(BLANK); setEditing(false); setOpen(true); setMsg(null); };
  const startEdit = (m: AdminModel) => {
    setForm({
      id: m.id, providerId: m.provider, label: m.label,
      contextTokens: m.contextTokens, maxOutputTokens: m.maxOutputTokens,
      defaultRank: m.defaultRank, capabilities: { ...m.capabilities }, enabled: m.enabled,
    });
    setEditing(true); setOpen(true); setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.providerId || !form.label.trim()) {
      setMsg({ kind: 'err', text: 'ID, provider, and label are required.' });
      return;
    }
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/panel/llm-models', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Save failed');
      setMsg({ kind: 'ok', text: `${editing ? 'Updated' : 'Added'} ${form.id}.` });
      setOpen(false); setForm(BLANK);
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const del = async (id: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/panel/llm-models/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Delete failed');
      setMsg({ kind: 'ok', text: `Deleted ${id}.` });
      await load();
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    } finally { setBusy(false); }
  };

  const setCap = (k: (typeof CAPS)[number], v: boolean) =>
    setForm((f) => ({ ...f, capabilities: { ...f.capabilities, [k]: v } }));

  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">AI Search models</h2>
          <p className="mt-0.5 text-sm text-ink-500">
            {models.length} model{models.length === 1 ? '' : 's'} registered. Add your own, or edit the shipped defaults.
          </p>
        </div>
        <button type="button" onClick={startAdd} className="btn-primary text-sm">+ Add model</button>
      </div>

      {msg && (
        <p className={`mt-3 rounded-md px-3 py-2 text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.text}
        </p>
      )}

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-lg border border-ink-100 bg-ink-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">Model ID</span>
              <input className="input font-mono text-sm" value={form.id} disabled={editing}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))} placeholder="e.g. llama3.1:70b" />
            </label>
            <label className="block">
              <span className="label">Provider</span>
              <select className="input" value={form.providerId} onChange={(e) => setForm((f) => ({ ...f, providerId: e.target.value }))}>
                <option value="">Select a provider…</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Label</span>
              <input className="input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Llama 3.1 70B" />
            </label>
            <label className="block">
              <span className="label">Context tokens</span>
              <input type="number" min={1} className="input" value={form.contextTokens}
                onChange={(e) => setForm((f) => ({ ...f, contextTokens: Number(e.target.value) }))} />
            </label>
            <label className="block">
              <span className="label">Max output tokens</span>
              <input type="number" min={1} className="input" value={form.maxOutputTokens}
                onChange={(e) => setForm((f) => ({ ...f, maxOutputTokens: Number(e.target.value) }))} />
            </label>
            <label className="block">
              <span className="label">Default rank (lower = higher priority)</span>
              <input type="number" className="input" value={form.defaultRank}
                onChange={(e) => setForm((f) => ({ ...f, defaultRank: Number(e.target.value) }))} />
            </label>
          </div>

          <div>
            <span className="label">Capabilities</span>
            <div className="mt-1 flex flex-wrap gap-3">
              {CAPS.map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm text-ink-700">
                  <input type="checkbox" checked={form.capabilities[k]} onChange={(e) => setCap(k, e.target.checked)} />
                  {k}
                </label>
              ))}
              <label className="flex items-center gap-1.5 text-sm text-ink-700">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
                enabled
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="btn-primary text-sm disabled:opacity-50">
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Add model'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setForm(BLANK); }} className="btn-ghost text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 text-ink-400">
              <th className="py-1.5 pr-2 font-medium">Model</th>
              <th className="py-1.5 pr-2 font-medium">Provider</th>
              <th className="py-1.5 pr-2 font-medium">Source</th>
              <th className="py-1.5 pr-2 font-medium">Status</th>
              <th className="py-1.5 pr-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-b border-ink-50">
                <td className="py-1.5 pr-2">
                  <span className="font-medium text-ink-800">{m.label}</span>
                  <code className="ml-2 text-sm text-ink-400">{m.id}</code>
                </td>
                <td className="py-1.5 pr-2 text-ink-600">{m.provider}</td>
                <td className="py-1.5 pr-2">
                  <span className={`chip py-0 text-sm ${m.source === 'admin' ? 'bg-brand-50 text-brand-700' : 'bg-ink-100 text-ink-500'}`}>{m.source}</span>
                </td>
                <td className="py-1.5 pr-2">
                  {m.enabled ? <span className="text-green-600">enabled</span> : <span className="text-ink-400">disabled</span>}
                </td>
                <td className="py-1.5 pr-2 text-right">
                  <button type="button" onClick={() => startEdit(m)} className="text-sm text-brand-600 hover:underline">Edit</button>
                  <button type="button" onClick={() => del(m.id)} disabled={busy} className="ml-3 text-sm text-red-600 hover:underline disabled:opacity-50">Delete</button>
                </td>
              </tr>
            ))}
            {models.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-ink-400">No models registered yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-sm text-ink-400">
        Editing or deleting a shipped (<code>json</code>) model persists in the database; local Ollama models are discovered automatically.
      </p>
    </div>
  );
}

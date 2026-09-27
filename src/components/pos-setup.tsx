"use client";

import { useState } from "react";
import Link from "next/link";
import type { PosCardConfig } from "@/lib/pos-config";

type Draft = {
  id: string;
  label: string;
  mode: "items" | "rollup";
  locations: string;
  items: string;
  categories: string;
  rollsUp: string[];
};

function lines(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function text(ids: string[]): string {
  return ids.join("\n");
}

function toDraft(card: PosCardConfig): Draft {
  return {
    id: card.id,
    label: card.label,
    mode: card.rollsUp.length > 0 ? "rollup" : "items",
    locations: text(card.locationIds),
    items: text(card.catalogObjectIds),
    categories: text(card.categoryIds),
    rollsUp: card.rollsUp,
  };
}

function Field({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
  placeholder: string;
}) {
  return (
    <label className="block text-sm text-white/70">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder={placeholder}
        className="mt-1 w-full rounded-sm border border-white/10 bg-page px-3 py-2 text-sm text-white placeholder:text-white/30"
      />
      <span className="mt-1 block text-xs text-white/45">{hint}</span>
    </label>
  );
}

export function PosSetup({ initial }: { initial: PosCardConfig[] }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => initial.map(toDraft));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(index: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...patch } : draft)));
  }

  function move(index: number, direction: -1 | 1) {
    setDrafts((current) => {
      const next = index + direction;
      if (next < 0 || next >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      if (!item) return current;
      copy.splice(next, 0, item);
      return copy;
    });
  }

  function remove(index: number) {
    setDrafts((current) => {
      const id = current[index]?.id;
      return current
        .filter((_, i) => i !== index)
        .map((draft) => ({ ...draft, rollsUp: id ? draft.rollsUp.filter((source) => source !== id) : draft.rollsUp }));
    });
  }

  async function save() {
    setError(null);
    setMessage(null);
    for (const draft of drafts) {
      const name = draft.label.trim();
      if (!name) {
        setError("Every card needs a name.");
        return;
      }
      if (draft.mode === "rollup" && draft.rollsUp.length === 0) {
        setError(`${name} needs at least one card to add.`);
        return;
      }
    }
    setSaving(true);
    const cards = drafts.map((draft) => ({
      id: draft.id,
      label: draft.label,
      locationIds: draft.mode === "items" ? lines(draft.locations) : [],
      catalogObjectIds: draft.mode === "items" ? lines(draft.items) : [],
      categoryIds: draft.mode === "items" ? lines(draft.categories) : [],
      rollsUp: draft.mode === "rollup" ? draft.rollsUp : [],
    }));
    try {
      const response = await fetch("/api/pos-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string; refreshed?: boolean };
      if (!response.ok) throw new Error(body.error ?? "Could not save cards.");
      setMessage(body.refreshed ? "Saved. The sales screen is using these cards." : "Saved. The next refresh will use these cards.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save cards.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-page text-white">
      <header className="border-b border-white/10 bg-header px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-label text-[10px] leading-none text-mark">Nashville Oktoberfest 2026</p>
            <h1 className="font-display text-base font-bold leading-tight">Card setup</h1>
          </div>
          <Link href="/" className="text-sm text-white/65">
            Sales
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <p className="text-sm text-white/70">
          Each card is one Square location plus the items sold there, or a total of other cards. For the alcohol booths, add one card per location and paste that booth&apos;s location id and item or category ids. Then add an Alcohol card, choose &quot;Add other cards together,&quot; and check those booths.
        </p>
        {drafts.map((draft, index) => (
          <section key={draft.id} className="space-y-4 rounded-sm border border-white/10 bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="block min-w-0 flex-1 text-sm text-white/70">
                Name
                <input
                  value={draft.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  className="mt-1 w-full rounded-sm border border-white/10 bg-page px-3 py-2 text-sm text-white"
                />
              </label>
              <div className="flex gap-2 text-xs text-white/55">
                <button type="button" onClick={() => move(index, -1)} className="rounded-sm border border-white/10 px-2 py-1">
                  Up
                </button>
                <button type="button" onClick={() => move(index, 1)} className="rounded-sm border border-white/10 px-2 py-1">
                  Down
                </button>
                <button type="button" onClick={() => remove(index)} className="rounded-sm border border-white/10 px-2 py-1">
                  Remove
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-white/70">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${draft.id}`}
                  checked={draft.mode === "items"}
                  onChange={() => update(index, { mode: "items" })}
                />
                This location
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`mode-${draft.id}`}
                  checked={draft.mode === "rollup"}
                  onChange={() => update(index, { mode: "rollup" })}
                />
                Add other cards together
              </label>
            </div>
            {draft.mode === "items" ? (
              <div className="grid gap-4">
                <Field
                  label="Location ids"
                  value={draft.locations}
                  onChange={(locations) => update(index, { locations })}
                  placeholder="LXXXXXXXXXXXX"
                  hint="One per line. Square location ids start with L. The same location can be on more than one card."
                />
                <Field
                  label="Item ids"
                  value={draft.items}
                  onChange={(items) => update(index, { items })}
                  placeholder="Variation id from the Square item library"
                  hint="One per line. An item on two cards stops those cards."
                />
                <Field
                  label="Category ids"
                  value={draft.categories}
                  onChange={(categories) => update(index, { categories })}
                  placeholder="Optional category id"
                  hint="Optional. A category includes every variation in it, which is the easier way to group alcohol, merch, or food."
                />
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-sm text-white/70">Include</legend>
                <p className="text-xs text-white/45">
                  Check the location cards that belong in this total. If you also check a total that already includes one of those cards, the sale would be counted twice and the save is rejected.
                </p>
                {drafts.filter((other) => other.id !== draft.id).map((other) => (
                  <label key={other.id} className="flex items-center gap-2 text-sm text-white/70">
                    <input
                      type="checkbox"
                      checked={draft.rollsUp.includes(other.id)}
                      onChange={(event) => {
                        const rollsUp = event.target.checked
                          ? [...draft.rollsUp, other.id]
                          : draft.rollsUp.filter((id) => id !== other.id);
                        update(index, { rollsUp });
                      }}
                    />
                    {other.label || "Untitled card"}
                  </label>
                ))}
              </fieldset>
            )}
          </section>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setDrafts((current) => [
                ...current,
                {
                  id: `card-${Date.now().toString(36)}`,
                  label: "",
                  mode: "items",
                  locations: "",
                  items: "",
                  categories: "",
                  rollsUp: [],
                },
              ])
            }
            className="rounded-sm border border-white/10 px-3 py-2 text-sm"
          >
            Add card
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-sm bg-mark px-3 py-2 font-label text-sm text-mark-ink disabled:opacity-60"
          >
            {saving ? "Saving" : "Save cards"}
          </button>
          {message ? <p className="text-sm text-white/70">{message}</p> : null}
          {error ? (
            <p className="text-sm text-mark" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

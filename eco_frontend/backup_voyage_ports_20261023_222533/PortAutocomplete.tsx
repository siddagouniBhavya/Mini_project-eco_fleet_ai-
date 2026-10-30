"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, Search } from "lucide-react";

export type SearchPort = {
  code: string;
  name: string;
  country: string;
};

type Props = {
  label: string;
  placeholder: string;
  selectedCode: string;
  onSelect: (code: string) => void;
};

function normalize(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];

    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }

    previous = current;
  }

  return previous[b.length];
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

export default function PortAutocomplete({
  label,
  placeholder,
  selectedCode,
  onSelect,
}: Props) {
  const [ports, setPorts] = useState<SearchPort[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/data/ports.json")
      .then((response) => {
        if (!response.ok) throw new Error("Port dataset could not be loaded.");
        return response.json();
      })
      .then((data: SearchPort[]) => {
        if (!cancelled) setPorts(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Port list unavailable. Refresh the page and try again.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPort = useMemo(
    () => ports.find((port) => port.code === selectedCode),
    [ports, selectedCode],
  );

  const matches = useMemo(() => {
    const term = normalize(query.trim());
    if (!term || term.length < 2) return [];

    const ranked = ports.map((port) => {
      const name = normalize(port.name);
      const country = normalize(countryName(port.country));
      const code = normalize(port.code);

      let score = 99;

      if (name === term) score = 0;
      else if (name.startsWith(term)) score = 1;
      else if (name.includes(term)) score = 2;
      else if (code.startsWith(term)) score = 3;
      else if (country.includes(term)) score = 4;
      else {
        const words = port.name.split(/[\s-]+/).map(normalize);
        const distance = Math.min(
          editDistance(term, name),
          ...words.map((word) => editDistance(term, word)),
        );

        // Fuzzy matching is limited to short queries to avoid noisy results.
        if (term.length >= 4 && distance <= (term.length >= 7 ? 2 : 1)) {
          score = 5 + distance;
        }
      }

      return { port, score };
    });

    return ranked
      .filter((item) => item.score < 99)
      .sort((a, b) => a.score - b.score || a.port.name.localeCompare(b.port.name))
      .slice(0, 7)
      .map((item) => item.port);
  }, [ports, query]);

  function choose(port: SearchPort) {
    setQuery(port.name);
    setOpen(false);
    onSelect(port.code);
  }

  return (
    <div className="relative min-w-0 text-sm">
      <label className="mb-1 block font-medium text-slate-600">{label}</label>

      <div className="relative">
        {selectedCode && selectedPort ? (
          <MapPin size={16} className="absolute left-3 top-3 text-emerald-600" />
        ) : (
          <Search size={16} className="absolute left-3 top-3 text-sky-700" />
        )}

        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            onSelect("");
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
          required
          aria-autocomplete="list"
          className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-slate-800 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
        />
      </div>

      {selectedCode && selectedPort && !open && (
        <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
          <Check size={12} />
          {countryName(selectedPort.country)} · {selectedPort.code}
        </p>
      )}

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {matches.length > 0 ? (
            matches.map((port) => (
              <button
                key={port.code}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(port)}
                className="flex w-full items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-b-0 hover:bg-sky-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-slate-800">
                    {port.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {countryName(port.country)}
                  </span>
                </span>
                <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                  {port.code}
                </span>
              </button>
            ))
          ) : (
            <p className="px-3 py-3 text-xs text-slate-500">
              {loadError || (ports.length === 0
                ? "Loading verified ports…"
                : "No matching ports. Try another spelling.")}
            </p>
          )}
        </div>
      )}

      {loadError && (
        <p role="alert" className="mt-1 text-xs text-rose-600">{loadError}</p>
      )}
    </div>
  );
}

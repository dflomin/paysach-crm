'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { RefreshCw, Calendar, Filter } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RunOption {
  id: number;
  label: string;
  started_at: string | null;
}

interface StateRow {
  state: string;
  with_phone: number;
  without_phone: number;
  total: number;
}

interface TimelineRow {
  bucket: string;
  state: string;
  count: number;
}

// ─── Colour palette for states ───────────────────────────────────────────────

const STATE_COLOURS = [
  '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#e11d48', '#d97706', '#7c3aed', '#0284c7',
  '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ca8a04',
];

// ─── Interval options ─────────────────────────────────────────────────────────

const INTERVAL_OPTIONS = [
  { value: '1',    label: '1 min'  },
  { value: '5',    label: '5 min'  },
  { value: '10',   label: '10 min' },
  { value: '15',   label: '15 min' },
  { value: '30',   label: '30 min' },
  { value: '60',   label: '1 hr'   },
  { value: '120',  label: '2 hr'   },
  { value: '360',  label: '6 hr'   },
  { value: '720',  label: '12 hr'  },
  { value: '1440', label: '1 day'  },
];

// ─── Small shared UI helpers ──────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{children}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

interface MultiSelectProps {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

function MultiSelect({ label, options, selected, onChange, placeholder = 'All' }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const allSelected = options.length > 0 && selected.length === options.length;

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const badge =
    selected.length === 0 ? placeholder
    : selected.length === options.length ? 'All'
    : `${selected.length} selected`;

  return (
    <div className="relative">
      <Label>{label}</Label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-w-[180px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-left text-xs text-slate-700 shadow-sm hover:border-slate-400 flex items-center justify-between gap-2"
      >
        <span className="truncate">{badge}</span>
        <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 z-40 mt-1 w-60 rounded-md border border-slate-200 bg-white shadow-lg p-2 space-y-1 max-h-64 overflow-auto"
          onMouseLeave={() => setOpen(false)}
        >
          <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : options.map((o) => o.value))}
            />
            All
          </label>
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => toggle(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Custom stacked-bar tooltip for states chart ──────────────────────────────

interface TooltipEntry {
  dataKey: string;
  value: number;
  fill: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function StatesTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const withPhone    = payload.find((p) => p.dataKey === 'with_phone');
  const withoutPhone = payload.find((p) => p.dataKey === 'without_phone');
  const total = (withPhone?.value ?? 0) + (withoutPhone?.value ?? 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-slate-800">{label}</p>
      <p className="text-emerald-600">With phone: <strong>{withPhone?.value?.toLocaleString() ?? 0}</strong></p>
      <p className="text-red-500">Without phone: <strong>{withoutPhone?.value?.toLocaleString() ?? 0}</strong></p>
      <p className="text-slate-500 pt-1 border-t border-slate-100">Total: <strong>{total.toLocaleString()}</strong></p>
    </div>
  );
}

// ─── Custom stacked-bar tooltip for timeline chart ────────────────────────────

function TimelineTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: TooltipEntry) => s + (p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs space-y-1 max-w-[220px]">
      <p className="font-semibold text-slate-800 text-[11px]">{label}</p>
      {payload.map((p: TooltipEntry) => (
        <p key={p.dataKey} style={{ color: p.fill }}>
          {p.dataKey}: <strong>{p.value?.toLocaleString()}</strong>
        </p>
      ))}
      <p className="text-slate-500 pt-1 border-t border-slate-100">Total: <strong>{total.toLocaleString()}</strong></p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsClient() {
  // ── Filter state ──
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [runOptions,   setRunOptions]   = useState<RunOption[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<string[]>([]);
  const [intervalMins, setIntervalMins] = useState('5');

  // ── Data state ──
  const [statesData,   setStatesData]   = useState<StateRow[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineRow[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  // ── Load run options on mount ──
  useEffect(() => {
    fetch('/api/analytics/run-ids')
      .then((r) => r.json())
      .then((data: RunOption[]) => {
        if (Array.isArray(data)) setRunOptions(data);
      })
      .catch(() => {/* non-fatal */});
  }, []);

  // ── Fetch chart data ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (dateFrom)           qs.set('dateFrom', dateFrom);
      if (dateTo)             qs.set('dateTo',   dateTo);
      if (selectedRuns.length) qs.set('runIds',  selectedRuns.join(','));
      qs.set('intervalMins', intervalMins);

      const [statesRes, timelineRes] = await Promise.all([
        fetch(`/api/analytics/states?${qs}`),
        fetch(`/api/analytics/timeline?${qs}`),
      ]);

      if (!statesRes.ok || !timelineRes.ok) throw new Error('Fetch failed');

      const [statesJson, timelineJson] = await Promise.all([
        statesRes.json(),
        timelineRes.json(),
      ]);

      setStatesData(Array.isArray(statesJson) ? statesJson : []);
      setTimelineData(Array.isArray(timelineJson) ? timelineJson : []);
    } catch {
      setError('Failed to load analytics data. Check your DB connection.');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedRuns, intervalMins]);

  // Auto-fetch on filter change (with debounce for text inputs)
  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
  }, [fetchData]);

  // ── Derive unique states list for timeline chart ──────────────────────────
  const timelineStates = useMemo(() => {
    const s = new Set(timelineData.map((r) => r.state));
    return Array.from(s).sort();
  }, [timelineData]);

  // ── Pivot timeline rows into per-bucket objects ───────────────────────────
  const pivotedTimeline = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    timelineData.forEach(({ bucket, state, count }) => {
      if (!map.has(bucket)) map.set(bucket, { bucket });
      map.get(bucket)![state] = (map.get(bucket)![state] ?? 0) + count;
    });
    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [timelineData]);

  // ── Format bucket label for X-axis ───────────────────────────────────────
  const formatBucket = (bucket: string) => {
    if (!bucket) return '';
    try {
      const d = new Date(bucket);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return bucket;
    }
  };

  const runSelectOptions = runOptions.map((r) => ({ value: String(r.id), label: r.label }));

  return (
    <div className="flex-1 min-h-0 bg-slate-50 p-4 space-y-4">
      {/* ── Filter bar ── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date range */}
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-slate-400 shrink-0" />
            <div>
              <Label>Date From</Label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 shadow-sm hover:border-slate-400"
              />
            </div>
            <div>
              <Label>Date To</Label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-xs text-slate-700 shadow-sm hover:border-slate-400"
              />
            </div>
          </div>

          {/* Run ID multi-select */}
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-slate-400 shrink-0 mt-4" />
            <MultiSelect
              label="Run IDs"
              options={runSelectOptions}
              selected={selectedRuns}
              onChange={setSelectedRuns}
              placeholder="All runs"
            />
          </div>

          {/* Timeline interval */}
          <div>
            <Label>Bucket Interval</Label>
            <select
              value={intervalMins}
              onChange={(e) => setIntervalMins(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:border-slate-400"
            >
              {INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="mt-4 flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-sm"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      {/* ── Chart 1: Businesses per state (with/without phone) ── */}
      <Card title="Businesses by State — Phone Coverage">
        {statesData.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-slate-400">No data for the selected filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={statesData}
              margin={{ top: 8, right: 16, left: 0, bottom: 8 }}
              barCategoryGap="30%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="state"
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<StatesTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                formatter={(value) => value === 'with_phone' ? 'With phone' : 'Without phone'}
              />
              <Bar dataKey="with_phone"    name="With phone"    stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="without_phone" name="Without phone" stackId="a" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Chart 2: Insert volume over time by state ── */}
      <Card title={`Insert Volume Over Time by State — ${INTERVAL_OPTIONS.find((o) => o.value === intervalMins)?.label ?? intervalMins + ' min'} buckets`}>
        {pivotedTimeline.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-slate-400">No data for the selected filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={pivotedTimeline}
              margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
              barCategoryGap="15%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="bucket"
                tickFormatter={formatBucket}
                tick={{ fontSize: 10, fill: '#64748b' }}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                angle={-35}
                textAnchor="end"
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <Tooltip content={<TimelineTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              />
              {timelineStates.map((state, i) => (
                <Bar
                  key={state}
                  dataKey={state}
                  stackId="b"
                  fill={STATE_COLOURS[i % STATE_COLOURS.length]}
                  radius={i === timelineStates.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

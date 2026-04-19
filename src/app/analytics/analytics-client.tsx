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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { RefreshCw, Calendar, Filter, FileText, Building2, Copy, DollarSign, Zap } from 'lucide-react';
import type { PieLabelRenderProps } from 'recharts';

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

interface TagRow {
  analytics_tag: string;
  count: number;
}

interface TotalsData {
  totalFilings: number;
  totalBusinesses: number;
  duplicateAddressCount: number;
  geminiCost: number;
  geminiTokens: number;
  geminiRequests: number;
}

interface FallbackData {
  ownerExaFound:      number;
  ownerSerperRescued: number;
  ownerBothFailed:    number;
  phoneSerperFound:   number;
  phoneExaRescued:    number;
  phoneBothFailed:    number;
}

// ─── Colour palette for states ───────────────────────────────────────────────

const STATE_COLOURS = [
  '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#e11d48', '#d97706', '#7c3aed', '#0284c7',
  '#16a34a', '#dc2626', '#9333ea', '#0891b2', '#ca8a04',
];

// ─── Colour palette for donut charts ─────────────────────────────────────────

const EXA_COLOURS    = ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#2e1065'];
const SERPER_COLOURS = ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#0284c7', '#0369a1', '#075985', '#0c4a6e', '#082f49'];

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

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const LS_FILTERS_KEY = 'analytics_filters';

function loadSavedFilters(): { dateFrom?: string; dateTo?: string; intervalMins?: string; selectedRuns?: string[] } {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(LS_FILTERS_KEY) ?? '{}');
  } catch (err) {
    console.warn('[analytics] Failed to parse saved filters from localStorage:', err);
    return {};
  }
}

// ─── Small shared UI helpers ──────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{children}</span>;
}

function Card({ title, children, headerExtra }: { title: string; children: React.ReactNode; headerExtra?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {headerExtra}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  colour: string;
  subtitle?: string;
}

function StatCard({ icon, label, value, colour, subtitle }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm min-w-0">
      <div className="shrink-0 rounded-lg p-2" style={{ backgroundColor: `${colour}20` }}>
        <span style={{ color: colour }}>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate">{label}</p>
        <p className="mt-0.5 text-xl font-bold text-slate-800 tabular-nums">{value}</p>
        {subtitle && <p className="text-[11px] text-slate-400 tabular-nums">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Donut chart with legend ───────────────────────────────────────────────────

interface DonutChartProps {
  data: { name: string; value: number }[];
  colours: string[];
  title: string;
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg text-xs">
      <p className="font-semibold text-slate-800 font-mono">{payload[0].name}</p>
      <p className="text-slate-600 mt-0.5">Count: <strong>{payload[0].value.toLocaleString()}</strong></p>
    </div>
  );
}

const RADIAN = Math.PI / 180;

function renderDonutLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, outerRadius, percent } = props;
  if ((percent ?? 0) < 0.04) return null;
  const r = (typeof outerRadius === 'number' ? outerRadius : 68) + 16;
  const angle = typeof midAngle === 'number' ? midAngle : 0;
  const cxN = typeof cx === 'number' ? cx : 0;
  const cyN = typeof cy === 'number' ? cy : 0;
  const x = cxN + r * Math.cos(-angle * RADIAN);
  const y = cyN + r * Math.sin(-angle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#64748b"
      textAnchor={x > cxN ? 'start' : 'end'}
      dominantBaseline="central"
      fontSize={9}
      fontFamily="sans-serif"
    >
      {`${((percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  );
}

function DonutChart({ data, colours, title }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      </div>
      <div className="p-3 flex-1">
        {data.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">No data.</p>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="46%"
                    innerRadius={45}
                    outerRadius={68}
                    paddingAngle={2}
                    dataKey="value"
                    label={renderDonutLabel}
                    labelLine={false}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={colours[i % colours.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-xs text-slate-500 mt-3">Total: <strong>{total.toLocaleString()}</strong></p>
            </div>
            <div className="w-full space-y-1 text-[11px] max-h-[140px] overflow-auto">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="shrink-0 h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: colours[i % colours.length] }} />
                  <span className="font-mono text-slate-600 truncate flex-1">{d.name}</span>
                  <span className="tabular-nums text-slate-800 font-semibold shrink-0">{d.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

// ─── Fallback flow section ────────────────────────────────────────────────────

interface FallbackFlowSectionProps {
  title: string;
  primaryLabel: string;
  primaryColour: string;
  fallbackLabel: string;
  fallbackColour: string;
  failLabel: string;
  failColour: string;
  primaryCount: number;
  fallbackCount: number;
  failCount: number;
}

function FallbackFlowSection({
  title,
  primaryLabel, primaryColour,
  fallbackLabel, fallbackColour,
  failLabel, failColour,
  primaryCount, fallbackCount, failCount,
}: FallbackFlowSectionProps) {
  const total = primaryCount + fallbackCount + failCount;
  const pct = (n: number) => total === 0 ? 0 : Math.round((n / total) * 100);

  const rows = [
    { label: primaryLabel,  colour: primaryColour,  count: primaryCount,  pct: pct(primaryCount)  },
    { label: fallbackLabel, colour: fallbackColour, count: fallbackCount, pct: pct(fallbackCount) },
    { label: failLabel,     colour: failColour,     count: failCount,     pct: pct(failCount)     },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-700">{title}</p>

      {/* Stacked progress bar */}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {rows.map((r) =>
          r.count > 0 ? (
            <div
              key={r.label}
              style={{ width: `${r.pct}%`, backgroundColor: r.colour }}
              title={`${r.label}: ${r.count.toLocaleString()} (${r.pct}%)`}
            />
          ) : null
        )}
      </div>

      {/* Legend rows */}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2">
            <span
              className="shrink-0 h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: r.colour }}
            />
            <span className="flex-1 text-[11px] text-slate-600 truncate">{r.label}</span>
            <span className="tabular-nums text-[11px] font-semibold text-slate-800 shrink-0">
              {r.count.toLocaleString()}
            </span>
            <span
              className="tabular-nums text-[11px] w-9 text-right shrink-0"
              style={{ color: r.colour }}
            >
              {total > 0 ? `${r.pct}%` : '—'}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 border-t border-slate-100 pt-1.5">
          <span className="shrink-0 h-2.5 w-2.5" />
          <span className="flex-1 text-[11px] text-slate-400">Total businesses</span>
          <span className="tabular-nums text-[11px] font-semibold text-slate-600 shrink-0">
            {total.toLocaleString()}
          </span>
          <span className="w-9" />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsClient() {
  // ── Filter state (initialised from localStorage) ──
  const [dateFrom,     setDateFrom]     = useState(() => loadSavedFilters().dateFrom     ?? '');
  const [dateTo,       setDateTo]       = useState(() => loadSavedFilters().dateTo       ?? '');
  const [runOptions,   setRunOptions]   = useState<RunOption[]>([]);
  const [selectedRuns, setSelectedRuns] = useState<string[]>(() => loadSavedFilters().selectedRuns ?? []);
  const [intervalMins, setIntervalMins] = useState(() => loadSavedFilters().intervalMins ?? '5');

  // ── Persist filter state to localStorage ──
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LS_FILTERS_KEY, JSON.stringify({ dateFrom, dateTo, intervalMins, selectedRuns }));
    } catch (err) {
      console.warn('[analytics] Failed to persist filters to localStorage:', err);
    }
  }, [dateFrom, dateTo, intervalMins, selectedRuns]);

  // ── Data state ──
  const [statesData,   setStatesData]   = useState<StateRow[]>([]);
  const [timelineData, setTimelineData] = useState<TimelineRow[]>([]);
  const [tagsData,     setTagsData]     = useState<TagRow[]>([]);
  const [totals,       setTotals]       = useState<TotalsData | null>(null);
  const [fallback,     setFallback]     = useState<FallbackData | null>(null);
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
      if (dateFrom)            qs.set('dateFrom', dateFrom);
      if (dateTo)              qs.set('dateTo',   dateTo);
      if (selectedRuns.length) qs.set('runIds',   selectedRuns.join(','));
      qs.set('intervalMins', intervalMins);

      const [statesRes, timelineRes, tagsRes, totalsRes, fallbackRes] = await Promise.all([
        fetch(`/api/analytics/states?${qs}`),
        fetch(`/api/analytics/timeline?${qs}`),
        fetch(`/api/analytics/tags?${qs}`),
        fetch(`/api/analytics/totals?${qs}`),
        fetch(`/api/analytics/fallback-coverage?${qs}`),
      ]);

      if (!statesRes.ok || !timelineRes.ok || !tagsRes.ok || !totalsRes.ok || !fallbackRes.ok) throw new Error('Fetch failed');

      const [statesJson, timelineJson, tagsJson, totalsJson, fallbackJson] = await Promise.all([
        statesRes.json(),
        timelineRes.json(),
        tagsRes.json(),
        totalsRes.json(),
        fallbackRes.json(),
      ]);

      setStatesData(Array.isArray(statesJson) ? statesJson : []);
      setTimelineData(Array.isArray(timelineJson) ? timelineJson : []);
      setTagsData(Array.isArray(tagsJson) ? tagsJson : []);
      setTotals(totalsJson && typeof totalsJson === 'object' && !Array.isArray(totalsJson) ? totalsJson : null);
      setFallback(fallbackJson && typeof fallbackJson === 'object' && !Array.isArray(fallbackJson) ? fallbackJson : null);
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
    const map = new Map<string, Record<string, unknown>>();
    timelineData.forEach(({ bucket, state, count }) => {
      if (!map.has(bucket)) map.set(bucket, { bucket });
      const entry = map.get(bucket)!;
      entry[state] = ((entry[state] as number) ?? 0) + count;
    });
    return Array.from(map.values()).sort((a, b) => (a.bucket as string).localeCompare(b.bucket as string));
  }, [timelineData]);

  // ── Derive donut data for exa* and serper* tags ───────────────────────────
  const exaContactsDonutData = useMemo(
    () => tagsData
      .filter((r) => r.analytics_tag.toLowerCase().startsWith('exa') && r.analytics_tag.toLowerCase().includes('contact'))
      .map((r) => ({ name: r.analytics_tag, value: Number(r.count) }))
      .sort((a, b) => b.value - a.value),
    [tagsData],
  );

  const exaPhoneDonutData = useMemo(
    () => tagsData
      .filter((r) => r.analytics_tag.toLowerCase().startsWith('exa') && r.analytics_tag.toLowerCase().includes('phone'))
      .map((r) => ({ name: r.analytics_tag, value: Number(r.count) }))
      .sort((a, b) => b.value - a.value),
    [tagsData],
  );

  const serperOwnerDonutData = useMemo(
    () => tagsData
      .filter((r) => r.analytics_tag.toLowerCase().startsWith('serper') && r.analytics_tag.toLowerCase().includes('owner'))
      .map((r) => ({ name: r.analytics_tag, value: Number(r.count) }))
      .sort((a, b) => b.value - a.value),
    [tagsData],
  );

  const serperPhonesDonutData = useMemo(
    () => tagsData
      .filter((r) => r.analytics_tag.toLowerCase().startsWith('serper') && r.analytics_tag.toLowerCase().includes('phone'))
      .map((r) => ({ name: r.analytics_tag, value: Number(r.count) }))
      .sort((a, b) => b.value - a.value),
    [tagsData],
  );

  // ── Exa cost: $0.012 per request ─────────────────────────────────────────────
  // Includes exactly the tags shown in the donut charts (contact OR phone tags)
  const exaCost = useMemo(
    () => tagsData
      .filter((r) => {
        const tag = r.analytics_tag.toLowerCase();
        return tag.startsWith('exa') && (tag.includes('contact') || tag.includes('phone'));
      })
      .reduce((sum, r) => sum + Number(r.count), 0) * 0.012,
    [tagsData],
  );

  const exaCallCount = useMemo(
    () => tagsData
      .filter((r) => {
        const tag = r.analytics_tag.toLowerCase();
        return tag.startsWith('exa') && (tag.includes('contact') || tag.includes('phone'));
      })
      .reduce((sum, r) => sum + Number(r.count), 0),
    [tagsData],
  );

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

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          icon={<FileText size={18} />}
          label="Total Filings"
          value={totals ? totals.totalFilings.toLocaleString() : '—'}
          colour="#3b82f6"
        />
        <StatCard
          icon={<Building2 size={18} />}
          label="Total Businesses"
          value={totals ? totals.totalBusinesses.toLocaleString() : '—'}
          colour="#10b981"
        />
        <StatCard
          icon={<Copy size={18} />}
          label="Duplicate Addresses"
          value={totals ? totals.duplicateAddressCount.toLocaleString() : '—'}
          colour="#f59e0b"
        />
        <StatCard
          icon={<DollarSign size={18} />}
          label={totals ? `${totals.geminiRequests.toLocaleString()} Gemini Requests` : 'Gemini Requests'}
          value={totals ? `$${totals.geminiCost.toFixed(4)}` : '—'}
          colour="#8b5cf6"
          subtitle={totals ? `${totals.geminiTokens.toLocaleString()} tokens` : undefined}
        />
        <StatCard
          icon={<Zap size={18} />}
          label={exaCallCount > 0 ? `${exaCallCount.toLocaleString()} Exa Calls` : 'Exa Cost (est.)'}
          value={tagsData.length > 0 ? `$${exaCost.toFixed(4)}` : '—'}
          colour="#06b6d4"
          subtitle={exaCallCount > 0 ? `contact + phone calls` : undefined}
        />
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
              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
              <Bar dataKey="with_phone"    name="With phone"    stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
              <Bar dataKey="without_phone" name="Without phone" stackId="a" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ── Chart 2: Insert volume over time by state ── */}
      <Card
        title="Insert Volume Over Time by State"
        headerExtra={
          <div className="flex items-center gap-2 shrink-0">
            <Label>Interval</Label>
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
        }
      >
        {pivotedTimeline.length === 0 && !loading ? (
          <p className="py-8 text-center text-xs text-slate-400">No data for the selected filters.</p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={pivotedTimeline}
              margin={{ top: 8, right: 16, left: 0, bottom: 24 }}
              barCategoryGap="0%"
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

      {/* ── Charts 3–6: Tag donuts ── */}
      <div className="flex gap-4">
        <div className="w-1/4 min-w-0">
          <DonutChart title="Exa Contacts" data={exaContactsDonutData} colours={EXA_COLOURS} />
        </div>
        <div className="w-1/4 min-w-0">
          <DonutChart title="Exa Phone" data={exaPhoneDonutData} colours={EXA_COLOURS} />
        </div>
        <div className="w-1/4 min-w-0">
          <DonutChart title="Serper Owner" data={serperOwnerDonutData} colours={SERPER_COLOURS} />
        </div>
        <div className="w-1/4 min-w-0">
          <DonutChart title="Serper Phones" data={serperPhonesDonutData} colours={SERPER_COLOURS} />
        </div>
      </div>

      {/* ── Chart 7: Enrichment fallback coverage ── */}
      <Card title="Enrichment Fallback Coverage — per business × run">
        {!fallback && !loading ? (
          <p className="py-8 text-center text-xs text-slate-400">No data for the selected filters.</p>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            <FallbackFlowSection
              title="Owner Search Flow"
              primaryLabel="Exa found owner"
              primaryColour="#6366f1"
              fallbackLabel="Serper rescued (Exa failed)"
              fallbackColour="#f59e0b"
              failLabel="Both failed"
              failColour="#ef4444"
              primaryCount={fallback?.ownerExaFound ?? 0}
              fallbackCount={fallback?.ownerSerperRescued ?? 0}
              failCount={fallback?.ownerBothFailed ?? 0}
            />
            <FallbackFlowSection
              title="Phone Search Flow"
              primaryLabel="Serper found phone"
              primaryColour="#0ea5e9"
              fallbackLabel="Exa rescued (Serper failed)"
              fallbackColour="#f59e0b"
              failLabel="Both failed"
              failColour="#ef4444"
              primaryCount={fallback?.phoneSerperFound ?? 0}
              fallbackCount={fallback?.phoneExaRescued ?? 0}
              failCount={fallback?.phoneBothFailed ?? 0}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

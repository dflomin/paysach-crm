'use client';

import React, { useEffect, useMemo, useState, useTransition } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  Search, Phone, CheckCircle, FileText,
  Building, User, PhoneOff, Briefcase, ChevronRight, ArrowLeft
} from 'lucide-react';
import { addManualNote, logDisposition, togglePhoneDead } from '@/app/actions/crm';

type MultiOption = { value: string; label: string };

function MultiSelectFilter({
  popupId,
  label,
  options,
  selectedValues,
  onChange,
  activePopup,
  setActivePopup,
  align = 'left',
}: {
  popupId: string;
  label: string;
  options: MultiOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  activePopup: string | null;
  setActivePopup: React.Dispatch<React.SetStateAction<string | null>>;
  align?: 'left' | 'right';
}) {
  const allSelected = options.length > 0 && selectedValues.length === options.length;
  const isOpen = activePopup === popupId;

  const toggleOne = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((entry) => entry !== value));
      return;
    }
    onChange([...selectedValues, value]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setActivePopup((current) => (current === popupId ? null : popupId))}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 cursor-pointer flex items-center justify-between"
      >
        <span>{label}</span>
        <span className="text-slate-400">{selectedValues.length}/{options.length}</span>
      </button>
      {isOpen && (
      <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-30 w-56 rounded-md border border-slate-200 bg-white shadow-lg p-2 space-y-1 max-h-56 overflow-auto`}>
        <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => onChange(allSelected ? [] : options.map((option) => option.value))}
          />
          All
        </label>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={selectedValues.includes(option.value)}
              onChange={() => toggleOne(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      )}
    </div>
  );
}

function DateRangeFilter({
  popupId,
  label,
  value,
  onChange,
  activePopup,
  setActivePopup,
  align = 'left',
}: {
  popupId: string;
  label: string;
  value: { from: string; to: string };
  onChange: (next: { from: string; to: string }) => void;
  activePopup: string | null;
  setActivePopup: React.Dispatch<React.SetStateAction<string | null>>;
  align?: 'left' | 'right';
}) {
  const isOpen = activePopup === popupId;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setActivePopup((current) => (current === popupId ? null : popupId))}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 cursor-pointer flex items-center justify-between"
      >
        <span>{label}</span>
        <span className="text-slate-400">{value.from || value.to ? 'Set' : 'Any'}</span>
      </button>
      {isOpen && (
      <div className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1 z-30 w-64 rounded-md border border-slate-200 bg-white shadow-lg p-2 space-y-2`}>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">From</label>
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">To</label>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          />
        </div>
      </div>
      )}
    </div>
  );
}

export default function CrmClient({
  businesses = [],
  selectedLead = null,
  phones = [],
  contacts = [],
  filings = [],
  notes = [],
  initialTab = 'New',
  initialQuery = '',
  initialPage = 1,
  pageSize = 25,
  totalCount = 0,
}: any) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(initialQuery);
  const sourceBusinesses = businesses;
  const [sortKey, setSortKey] = useState('lastCalled');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState({
    lead: '',
    status: '',
    lastCalled: '',
    filedDate: '',
  });
  const [selectedPhoneFilters, setSelectedPhoneFilters] = useState<Array<'present' | 'missing'>>(['present']);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [lastCalledRange, setLastCalledRange] = useState({ from: '', to: '' });
  const [filedDateRange, setFiledDateRange] = useState({ from: '', to: '' });
  const [filingDateMin, setFilingDateMin] = useState('');
  const [activePopup, setActivePopup] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 350);

    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  // URL State Manager replacing local useState
  const updateUrlParams = (updates: any) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        current.delete(key);
      } else {
        current.set(key, value as string);
      }
    });
    const search = current.toString();
    const query = search ? `?${search}` : "";

    startTransition(() => {
      router.push(`${pathname}${query}`);
    });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTimeAgo = (dateString: string) => {
    if (!dateString) return 'Never';
    const diff = new Date().getTime() - new Date(dateString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const formatStateName = (state: string) => {
    if (!state) return 'N/A';
    const trimmed = state.trim();
    if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
    return trimmed
      .toLowerCase()
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  const isWithinDateRange = (dateString: string | null | undefined, range: { from: string; to: string }) => {
    if (!range.from && !range.to) return true;
    if (!dateString) return false;

    const value = new Date(dateString);
    if (Number.isNaN(value.getTime())) return false;

    if (range.from) {
      const start = new Date(`${range.from}T00:00:00`);
      if (value < start) return false;
    }

    if (range.to) {
      const end = new Date(`${range.to}T23:59:59.999`);
      if (value > end) return false;
    }

    return true;
  };

  const statusOptions = useMemo<string[]>(() => {
    const statuses: string[] = businesses
      .map((business: any) => business.status)
      .filter((status: unknown): status is string => typeof status === 'string' && status.trim().length > 0);

    return Array.from(new Set<string>(statuses)).sort((a, b) => a.localeCompare(b));
  }, [businesses]);

  const stateOptions = useMemo<string[]>(() => {
    const states: string[] = businesses
      .map((business: any) => business.filing_state)
      .filter((state: unknown): state is string => typeof state === 'string' && state.trim().length > 0);

    return Array.from(new Set<string>(states)).sort((a, b) => a.localeCompare(b));
  }, [businesses]);

  const effectiveSelectedStates = selectedStates.length > 0 ? selectedStates : stateOptions;

  const phoneFilterOptions: MultiOption[] = [
    { value: 'present', label: 'Present' },
    { value: 'missing', label: 'Missing' },
  ];

  const stateFilterOptions: MultiOption[] = stateOptions.map((state) => ({
    value: state,
    label: formatStateName(state),
  }));

  const filteredBusinesses = useMemo(() => {
    const normalize = (value: unknown) => String(value ?? '').toLowerCase();

    const filtered = sourceBusinesses.filter((business: any) => {
      const leadText = `${normalize(business.name)} ${normalize(business.contact_name)}`;
      const statusText = normalize(business.status);
      const searchText = normalize(debouncedSearchQuery);
      const hasPhone = typeof business.primary_phone === 'string' && business.primary_phone.trim().length > 0;
      const phoneMatch =
        (selectedPhoneFilters.includes('present') && hasPhone) ||
        (selectedPhoneFilters.includes('missing') && !hasPhone);
      const stateMatch = effectiveSelectedStates.length === 0 || effectiveSelectedStates.includes(String(business.filing_state ?? ''));
      const businessNameMatch = !searchText || normalize(business.name).includes(searchText);

      const filingDateMinMatch = isWithinDateRange(business.most_recent_filing_date, { from: filingDateMin, to: '' });

      return (
        businessNameMatch &&
        leadText.includes(normalize(columnFilters.lead)) &&
        phoneMatch &&
        statusText.includes(normalize(columnFilters.status)) &&
        stateMatch &&
        isWithinDateRange(business.last_called_ts, lastCalledRange) &&
        isWithinDateRange(business.insert_ts, filedDateRange) &&
        filingDateMinMatch
      );
    });

    const sorted = [...filtered].sort((a: any, b: any) => {
      const dir = sortDirection === 'asc' ? 1 : -1;

      if (sortKey === 'lead') {
        return normalize(a.name).localeCompare(normalize(b.name)) * dir;
      }
      if (sortKey === 'phone') {
        return normalize(a.primary_phone).localeCompare(normalize(b.primary_phone)) * dir;
      }
      if (sortKey === 'status') {
        return normalize(a.status).localeCompare(normalize(b.status)) * dir;
      }
      if (sortKey === 'state') {
        return normalize(a.filing_state).localeCompare(normalize(b.filing_state)) * dir;
      }
      if (sortKey === 'filedDate') {
        const aTime = a.most_recent_filing_date ? new Date(a.most_recent_filing_date).getTime() : 0;
        const bTime = b.most_recent_filing_date ? new Date(b.most_recent_filing_date).getTime() : 0;
        return (aTime - bTime) * dir;
      }

      const aTime = a.last_called_ts ? new Date(a.last_called_ts).getTime() : 0;
      const bTime = b.last_called_ts ? new Date(b.last_called_ts).getTime() : 0;
      return (aTime - bTime) * dir;
    });

    return sorted;
  }, [columnFilters, debouncedSearchQuery, effectiveSelectedStates, filedDateRange, filingDateMin, lastCalledRange, selectedPhoneFilters, sortDirection, sortKey, sourceBusinesses]);

  const filteredCount = filteredBusinesses.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const currentPage = Math.min(Math.max(initialPage, 1), totalPages);
  const pagedBusinesses = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredBusinesses.slice(start, start + pageSize);
  }, [currentPage, filteredBusinesses, pageSize]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(key);
    setSortDirection(key === 'lead' || key === 'status' || key === 'state' ? 'asc' : 'desc');
  };

  const sortIndicator = (key: string) => {
    if (sortKey !== key) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleDisposition = async (status: string) => {
    if (!selectedLead) return;
    await logDisposition(selectedLead.id, status);
  };

  const handleTogglePhoneDead = async (phoneId: number, isDead: boolean) => {
    await togglePhoneDead(phoneId, isDead);
  };

  const handleAddManualNote = async (e: any) => {
    e.preventDefault();
    const body = e.target.note.value;
    if (!body.trim() || !selectedLead) return;
    await addManualNote(selectedLead.id, body);
    e.target.reset();
  };

  const contactCards = useMemo(() => {
    const normalizeName = (contact: any) => {
      if (typeof contact.name === 'string' && contact.name.trim().length > 0) return contact.name.trim();
      const fullName = `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim();
      return fullName || 'Unknown Contact';
    };

    const mappedContacts = contacts.map((contact: any) => {
      const linkedPhones = phones.filter((phone: any) => Number(phone.contact_id) === Number(contact.id));
      return {
        id: `contact-${contact.id}`,
        label: normalizeName(contact),
        role: contact.role || null,
        phones: linkedPhones,
        isBusinessFallback: false,
      };
    });

    const unlinkedPhones = phones.filter((phone: any) => !phone.contact_id);
    if (unlinkedPhones.length > 0) {
      mappedContacts.push({
        id: 'contact-unlinked',
        label: selectedLead?.name || 'Business',
        role: 'Business Numbers',
        phones: unlinkedPhones,
        isBusinessFallback: true,
      });
    }

    if (mappedContacts.length === 0 && selectedLead) {
      mappedContacts.push({
        id: `contact-business-${selectedLead.id}`,
        label: selectedLead.name,
        role: 'No contacts available',
        phones: [],
        isBusinessFallback: true,
      });
    }

    return mappedContacts;
  }, [contacts, phones, selectedLead]);

  return (
    <div className="h-[100dvh] bg-slate-100 p-2 sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-[1700px] overflow-hidden rounded-xl border border-slate-200 bg-white font-sans text-slate-900 shadow-sm relative">

      {/* LEFT PANE: Master Table */}
      <div className={`flex-1 flex flex-col min-w-0 border-r border-slate-200 bg-white w-full ${isPending ? 'opacity-70 pointer-events-none' : ''} transition-opacity`}>

        {/* Header & Controls */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-col gap-4 bg-slate-50/50">
          <div className="flex justify-between items-center">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <Briefcase className="text-blue-600 hidden sm:block" size={24} />
              UCC Leads
            </h1>
            <div className="text-xs sm:text-sm font-medium text-slate-500 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-200">
              {filteredCount} found
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex overflow-x-auto pb-1 sm:pb-0 hide-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
              <div className="flex bg-slate-200/50 p-1 rounded-lg">
                {['All', 'New', 'Interested', 'Callbacks', 'Not Interested', 'Dead'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => updateUrlParams({ tab, leadId: null, page: '1' })}
                    className={`px-3 sm:px-4 py-1.5 text-xs sm:text-sm whitespace-nowrap font-medium rounded-md transition-all duration-200 ${initialTab === tab
                        ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-900/5'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                      }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full xl:max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                placeholder="Search business name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort('lead')} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Lead <span className="text-slate-400">{sortIndicator('lead')}</span>
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort('phone')} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Phone <span className="text-slate-400">{sortIndicator('phone')}</span>
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort('status')} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Status <span className="text-slate-400">{sortIndicator('status')}</span>
                  </button>
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort('state')} className="inline-flex items-center gap-1 hover:text-slate-700">
                    State <span className="text-slate-400">{sortIndicator('state')}</span>
                  </button>
                </th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort('lastCalled')} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Last Called <span className="text-slate-400">{sortIndicator('lastCalled')}</span>
                  </button>
                </th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <button type="button" onClick={() => toggleSort('filedDate')} className="inline-flex items-center gap-1 hover:text-slate-700">
                    Filing Date <span className="text-slate-400">{sortIndicator('filedDate')}</span>
                  </button>
                </th>
              </tr>
              <tr className="bg-slate-50/70 border-t border-slate-200">
                <th className="px-4 sm:px-6 py-2">
                  <input
                    type="text"
                    value={columnFilters.lead}
                    onChange={(e) => setColumnFilters((current) => ({ ...current, lead: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 placeholder-slate-400"
                    placeholder="Filter..."
                  />
                </th>
                <th className="px-4 sm:px-6 py-2">
                  <MultiSelectFilter
                    popupId="phone-filter"
                    label="Phone"
                    options={phoneFilterOptions}
                    selectedValues={selectedPhoneFilters}
                    onChange={(values) => setSelectedPhoneFilters(values as Array<'present' | 'missing'>)}
                    activePopup={activePopup}
                    setActivePopup={setActivePopup}
                  />
                </th>
                <th className="px-4 sm:px-6 py-2">
                  <select
                    value={columnFilters.status}
                    onChange={(e) => setColumnFilters((current) => ({ ...current, status: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 bg-white"
                  >
                    <option value="">All</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </th>
                <th className="px-4 sm:px-6 py-2">
                  <MultiSelectFilter
                    popupId="state-filter"
                    label="State"
                    options={stateFilterOptions}
                    selectedValues={effectiveSelectedStates}
                    onChange={setSelectedStates}
                    activePopup={activePopup}
                    setActivePopup={setActivePopup}
                  />
                </th>
                <th className="hidden sm:table-cell px-6 py-2">
                  <DateRangeFilter
                    popupId="last-called-filter"
                    label="Last Called"
                    value={lastCalledRange}
                    onChange={setLastCalledRange}
                    activePopup={activePopup}
                    setActivePopup={setActivePopup}
                  />
                </th>
                <th className="hidden md:table-cell px-6 py-2">
                  <div className="flex flex-col gap-1">
                    <input
                      type="date"
                      value={filingDateMin}
                      onChange={(e) => setFilingDateMin(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
                      title="Filing date on or after"
                    />
                    {filingDateMin && (
                      <button
                        type="button"
                        onClick={() => setFilingDateMin('')}
                        className="text-[10px] text-slate-400 hover:text-slate-600 text-left"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {pagedBusinesses.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 text-sm">
                    No records matched the current filters.
                  </td>
                </tr>
              )}
              {pagedBusinesses.map((business: any) => {
                const isSelected = selectedLead?.id === business.id;

                const statusColors: any = {
                  'New': 'bg-blue-100 text-blue-800 border-blue-200',
                  'Interested': 'bg-green-100 text-green-800 border-green-200',
                  'Callbacks': 'bg-yellow-100 text-yellow-800 border-yellow-200',
                  'Not Interested': 'bg-slate-200 text-slate-700 border-slate-300',
                  'Dead': 'bg-red-100 text-red-800 border-red-200',
                };

                return (
                  <tr
                    key={business.id}
                    onClick={() => updateUrlParams({ leadId: business.id })}
                    className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'}`}
                  >
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-slate-900 truncate max-w-[150px] sm:max-w-xs">{business.name}</div>
                      <div className="text-xs sm:text-sm text-slate-500 flex items-center gap-1 mt-0.5">
                        <User size={12} /> <span className="truncate">{business.contact_name || 'No owner/contact on file'}</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      {business.primary_phone ? (
                        <a
                          href={`tel:${business.primary_phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`text-sm font-medium flex items-center gap-1.5 ${business.primary_phone_dead ? 'text-slate-400 line-through' : 'text-blue-600 hover:text-blue-800'}`}
                        >
                          <Phone size={14} className="shrink-0" />
                          <span className="hidden sm:inline">{business.primary_phone}</span>
                          <span className="sm:hidden">Call</span>
                        </a>
                      ) : (
                        <span className="text-sm text-slate-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-[10px] sm:text-xs leading-5 font-semibold rounded-full border ${statusColors[business.status] || statusColors['New']}`}>
                        {business.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                      {business.filing_state ? formatStateName(business.filing_state) : 'N/A'}
                    </td>
                    <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {business.last_called_ts ? formatTimeAgo(business.last_called_ts) : 'Never'}
                    </td>
                    <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {formatDate(business.most_recent_filing_date)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-700">{pagedBusinesses.length}</span> of <span className="font-semibold text-slate-700">{filteredCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1 || isPending}
              onClick={() => updateUrlParams({ page: String(currentPage - 1), leadId: null })}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-md border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs sm:text-sm text-slate-600 min-w-[96px] text-center">
              Page {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || isPending}
              onClick={() => updateUrlParams({ page: String(currentPage + 1), leadId: null })}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-md border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Detail Workspace */}
      <div
        className={`fixed inset-0 z-50 bg-slate-50 flex flex-col h-[100dvh] md:h-auto border-l border-slate-200 transition-transform duration-300 ease-in-out md:relative md:w-[400px] md:translate-x-0 ${selectedLead ? 'translate-x-0' : 'translate-x-full hidden md:flex'}`}
      >
        {selectedLead ? (
          <>
            <div className="px-4 sm:px-5 py-4 bg-white border-b border-slate-200 flex items-start gap-3">
              <button
                onClick={() => updateUrlParams({ leadId: null })}
                className="mt-1 md:hidden p-1 -ml-1 text-slate-500 hover:text-slate-900 bg-slate-100 rounded-md"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex-1 overflow-hidden">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight truncate">{selectedLead.name}</h2>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-slate-500 text-xs sm:text-sm">
                  <span className="flex items-center gap-1"><User size={12} /> {selectedLead.contact_name || 'No owner/contact on file'}</span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1"><Building size={12} /> {selectedLead.industry}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-6">

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Phone size={14} /> Contacts & Phones
                </h3>
                <div className="space-y-2">
                  {contactCards.map((contactCard: any) => (
                    <div key={contactCard.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{contactCard.label}</div>
                          {contactCard.role && (
                            <div className="text-xs text-slate-500">{contactCard.role}</div>
                          )}
                        </div>
                        {contactCard.isBusinessFallback && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                            Business
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {contactCard.phones.map((phone: any) => (
                          <div key={phone.id} className={`flex items-center justify-between rounded-md border p-2 ${phone.is_dead ? 'bg-slate-100 border-slate-200' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                              <span className={`text-[10px] sm:text-xs font-semibold uppercase px-2 py-0.5 rounded-sm ${phone.type === 'primary' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                {phone.category || phone.type}
                              </span>
                              <a
                                href={`tel:${phone.phone}`}
                                className={`text-sm sm:text-base font-medium tracking-wide ${phone.is_dead ? 'text-slate-400 line-through' : 'text-slate-900 hover:text-blue-600'}`}
                              >
                                {phone.phone}
                              </a>
                            </div>
                            <button
                              onClick={() => handleTogglePhoneDead(phone.id, phone.is_dead)}
                              className={`p-1.5 rounded-md transition-colors ${phone.is_dead ? 'text-red-500 hover:bg-red-50' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
                            >
                              <PhoneOff size={16} />
                            </button>
                          </div>
                        ))}

                        {contactCard.phones.length === 0 && (
                          <p className="text-sm italic text-slate-500">No phone numbers mapped.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <CheckCircle size={14} /> Dispositions
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleDisposition('Interested')} className="cursor-pointer bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Interested</button>
                  <button onClick={() => handleDisposition('Callbacks')} className="cursor-pointer bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Callback</button>
                  <button onClick={() => handleDisposition('Not Interested')} className="cursor-pointer bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Not Interested</button>
                  <button onClick={() => handleDisposition('Dead')} className="cursor-pointer bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Dead</button>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <FileText size={14} /> UCC Filings
                </h3>
                <div className="space-y-3">
                  {filings.map((filing: any) => (
                    <div key={filing.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-sm font-bold text-slate-800">{filing.secured_party}</span>
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{filing.state}</span>
                      </div>
                      <div className="text-xs text-slate-500 mb-2">{formatDate(filing.filing_date)}</div>
                      {typeof filing.collateral === 'string' && filing.collateral.trim().length > 0 && (
                        <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 italic">
                          {filing.collateral}
                        </p>
                      )}
                    </div>
                  ))}
                  {filings.length === 0 && <p className="text-sm text-slate-500 italic">No filings found.</p>}
                </div>
              </section>

              <section className="pb-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <FileText size={14} /> Notes & Activity
                </h3>

                <form onSubmit={handleAddManualNote} className="mb-4">
                  <textarea
                    name="note"
                    rows={2}
                    className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none placeholder-slate-400"
                    placeholder="Add a conversation note..."
                  ></textarea>
                  <button type="submit" className="mt-2 w-full bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold py-2 rounded-md transition-colors">
                    Save Note
                  </button>
                </form>

                <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {notes.map((note: any) => (
                    <div key={note.id} className="relative flex items-start gap-3 pl-7 group">
                      <div className={`absolute left-1 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white shadow ${note.is_system_generated ? 'bg-slate-400' : 'bg-blue-500'}`}>
                      </div>
                      <div className="w-full p-2.5 rounded-lg border border-slate-200 bg-white shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400">
                            {formatTimeAgo(note.created_ts)}
                          </span>
                        </div>
                        <p className={`text-sm ${note.is_system_generated ? 'text-slate-500 italic' : 'text-slate-800'}`}>
                          {note.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          </>
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-500">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 border border-slate-200">
              <ChevronRight className="text-slate-400" size={32} />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No Lead Selected</h3>
            <p className="text-sm">Select a lead to view their details, make calls, and log notes.</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
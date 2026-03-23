'use client';

import React, { useState, useTransition } from 'react';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  Search, Phone, Calendar, CheckCircle, FileText,
  Building, User, Clock, PhoneOff, ArrowRight, Briefcase, ChevronRight, ArrowLeft
} from 'lucide-react';
import { addManualNote, logDisposition, togglePhoneDead } from '@/app/actions/crm';

export default function CrmClient({ businesses = [], selectedLead = null, phones = [], filings = [], notes = [], initialTab = 'All', initialQuery = '' }: any) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

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

  return (
    <div className="flex h-[100dvh] bg-slate-100 font-sans text-slate-900 overflow-hidden relative">

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
              {businesses.length} found
            </div>
          </div>

          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <div className="flex overflow-x-auto pb-1 sm:pb-0 hide-scrollbar -mx-2 px-2 sm:mx-0 sm:px-0">
              <div className="flex bg-slate-200/50 p-1 rounded-lg">
                {['All', 'New', 'Interested', 'Callbacks', 'Not Interested', 'Dead'].map(tab => (
                  <button
                    key={tab}
                    onClick={() => updateUrlParams({ tab, leadId: null })}
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
                placeholder="Search names or phones..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateUrlParams({ q: searchQuery });
                }}
                onBlur={() => updateUrlParams({ q: searchQuery })}
              />
            </div>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Last Called</th>
                <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Filed Date</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {businesses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 text-sm">
                    No records matched the server query. Ensure MariaDB is connected.
                  </td>
                </tr>
              )}
              {businesses.map((business: any) => {
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
                        <User size={12} /> <span className="truncate">{business.contact_name}</span>
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
                    <td className="hidden sm:table-cell px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {business.last_called_ts ? formatTimeAgo(business.last_called_ts) : 'Never'}
                    </td>
                    <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {formatDate(business.insert_ts)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
                  <span className="flex items-center gap-1"><User size={12} /> {selectedLead.contact_name}</span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1"><Building size={12} /> {selectedLead.industry}</span>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-6">

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <Phone size={14} /> Contact Numbers
                </h3>
                <div className="space-y-2">
                  {phones.map((phone: any) => (
                    <div key={phone.id} className={`flex items-center justify-between p-3 rounded-lg border ${phone.is_dead ? 'bg-slate-100 border-slate-200' : 'bg-white border-slate-200 shadow-sm'}`}>
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
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <CheckCircle size={14} /> Dispositions
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleDisposition('Interested')} className="bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Interested</button>
                  <button onClick={() => handleDisposition('Callbacks')} className="bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Callback</button>
                  <button onClick={() => handleDisposition('Not Interested')} className="bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Not Interested</button>
                  <button onClick={() => handleDisposition('Dead')} className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 py-2 sm:py-2.5 rounded-md text-sm font-semibold transition-colors">Dead</button>
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
                      <p className="text-xs text-slate-700 bg-slate-50 p-2 rounded border border-slate-100 italic">
                        "{filing.collateral}"
                      </p>
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
  );
}
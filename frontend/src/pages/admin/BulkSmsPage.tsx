import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChatText, PaperPlaneRight, Users, UsersThree, Handshake, Hash,
  Plus, Trash, FloppyDisk, Coins, CheckCircle, XCircle,
} from '@phosphor-icons/react';
import api from '../../api/client';
import { SmsContact, SmsMessage, SmsTemplate } from '../../types/api';
import { useNotificationStore } from '../../stores/notificationStore';

const inputCls = 'w-full border rounded-xl px-4 py-3 text-sm font-semibold outline-none transition-all';
const inputStyle = { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink)' };
const labelCls = 'block text-[10px] font-black uppercase tracking-widest mb-2';
const card = 'rounded-xl border shadow-sm';
const cardStyle = { background: 'var(--surface)', borderColor: 'var(--border)' };

const ROLE_OPTIONS = ['DISPATCHER', 'DRIVER', 'EMT', 'NURSE', 'WATCHER', 'PARTNER', 'ADMIN'];
const NICHES = ['GBV', 'MCI'];

type Tab = 'groups' | 'roles' | 'partners' | 'individual';

export default function BulkSmsPage() {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [tab, setTab] = useState<Tab>('groups');
  const [message, setMessage] = useState('');
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [partnerScope, setPartnerScope] = useState<string>('');
  const [numbersText, setNumbersText] = useState('');
  const [lastResult, setLastResult] = useState<{ total: number; sent: number; failed: number } | null>(null);

  // contact form
  const [newContact, setNewContact] = useState({ name: '', phone: '', group: 'SURVEILLANCE' });
  // template editing
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateBody, setTemplateBody] = useState('');

  const { data: balance } = useQuery({
    queryKey: ['sms', 'balance'],
    queryFn: async () => (await api.get('/sms/balance')).data.data as { ok: boolean; balance?: string; error?: string },
    staleTime: 60_000,
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ['sms', 'contacts'],
    queryFn: async () => (await api.get('/sms/contacts')).data.data as SmsContact[],
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['sms', 'templates'],
    queryFn: async () => (await api.get('/sms/templates')).data.data as SmsTemplate[],
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['sms', 'logs'],
    queryFn: async () => (await api.get('/sms/logs?limit=100')).data.data as SmsMessage[],
    refetchInterval: 20_000,
  });

  const groups = useMemo(() => {
    const map = new Map<string, number>();
    map.set('SURVEILLANCE', 0);
    for (const c of contacts) map.set(c.group, (map.get(c.group) ?? 0) + (c.isActive ? 1 : 0));
    return [...map.entries()].map(([group, count]) => ({ group, count }));
  }, [contacts]);

  const parsedNumbers = useMemo(
    () => numbersText.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean),
    [numbersText],
  );

  const recipientSummary = [
    selectedGroups.length ? `${selectedGroups.length} group(s)` : '',
    selectedRoles.length ? `${selectedRoles.length} role(s)` : '',
    partnerScope ? `partners: ${partnerScope}` : '',
    parsedNumbers.length ? `${parsedNumbers.length} number(s)` : '',
  ].filter(Boolean).join(' · ') || 'none';

  const hasRecipients = selectedGroups.length || selectedRoles.length || partnerScope || parsedNumbers.length;

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post('/sms/send', {
        message,
        contactGroups: selectedGroups.length ? selectedGroups : undefined,
        userRoles: selectedRoles.length ? selectedRoles : undefined,
        partnerNiche: partnerScope || undefined,
        numbers: parsedNumbers.length ? parsedNumbers : undefined,
      }),
    onSuccess: (res) => {
      const result = res.data.data as { total: number; sent: number; failed: number };
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: ['sms', 'logs'] });
      queryClient.invalidateQueries({ queryKey: ['sms', 'balance'] });
      addNotification({
        type: result.failed > 0 ? 'warning' : 'success',
        title: 'SMS Sent',
        message: `${result.sent}/${result.total} delivered${result.failed ? `, ${result.failed} failed` : ''}.`,
      });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Send Failed', message: err?.response?.data?.message || 'Could not send SMS.' });
    },
  });

  const addContactMutation = useMutation({
    mutationFn: () => api.post('/sms/contacts', newContact),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms', 'contacts'] });
      setNewContact({ name: '', phone: '', group: newContact.group });
      addNotification({ type: 'success', title: 'Contact Added', message: 'Recipient saved.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not add contact.' }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sms/contacts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sms', 'contacts'] }),
  });

  const saveTemplateMutation = useMutation({
    mutationFn: ({ key, body }: { key: string; body: string }) => api.patch(`/sms/templates/${key}`, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms', 'templates'] });
      setEditingTemplate(null);
      addNotification({ type: 'success', title: 'Template Saved', message: 'Message template updated.' });
    },
    onError: (err: any) => addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not save template.' }),
  });

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const chip = (label: string, count?: number, active?: boolean, onClick?: () => void) => (
    <button
      key={label}
      onClick={onClick}
      className="px-3 py-2 rounded-lg border text-xs font-bold transition-all"
      style={active
        ? { background: 'var(--brand-teal, #0f766e)', color: '#fff', borderColor: 'transparent' }
        : { background: 'var(--surface-2)', color: 'var(--ink)', borderColor: 'var(--border)' }}
    >
      {label}{count !== undefined ? ` · ${count}` : ''}
    </button>
  );

  return (
    <div className="col" style={{ gap: 24 }}>
      {/* Header */}
      <div className={`flex flex-col sm:flex-row justify-between sm:items-center gap-4 p-4 sm:p-6 lg:p-8 ${card}`} style={cardStyle}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em] uppercase" style={{ color: 'var(--muted)' }}>
              Messaging
            </p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight uppercase" style={{ color: 'var(--ink)' }}>
            Bulk SMS
          </h2>
        </div>
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
          <Coins size={20} weight="fill" className="text-brand-green" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Provider Balance</p>
            <p className="font-black" style={{ color: 'var(--ink)' }}>
              {balance?.ok ? balance.balance : (balance?.error ?? '—')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose + recipients */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Compose */}
          <div className={`p-5 ${card}`} style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <ChatText size={18} weight="fill" className="text-brand-teal" />
              <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Compose</h3>
            </div>

            {/* Template picker */}
            <div className="flex flex-wrap gap-2 mb-3">
              {templates.map(t => (
                <button
                  key={t.key}
                  onClick={() => setMessage(t.body)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold transition-all"
                  style={{ background: 'var(--surface-2)', color: 'var(--ink)', borderColor: 'var(--border)' }}
                  title={`Insert ${t.label}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <textarea
              className={inputCls}
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
              placeholder="Type your message… placeholders like {{caseNumber}} are only substituted for automated sends."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
            <p className="text-[11px] mt-1.5" style={{ color: 'var(--muted)' }}>
              {message.length} chars · {Math.max(1, Math.ceil(message.length / 160))} SMS segment(s)
            </p>
          </div>

          {/* Recipients */}
          <div className={`p-5 ${card}`} style={cardStyle}>
            <div className="flex items-center gap-2 mb-4">
              <Users size={18} weight="fill" className="text-brand-teal" />
              <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recipients</h3>
              <span className="text-xs ml-auto" style={{ color: 'var(--muted)' }}>{recipientSummary}</span>
            </div>

            {/* tabs */}
            <div className="flex flex-wrap gap-2 mb-4">
              {([['groups', 'Groups', UsersThree], ['roles', 'By Role', Users], ['partners', 'Partners', Handshake], ['individual', 'Individual', Hash]] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all"
                  style={tab === id
                    ? { background: 'var(--brand-teal, #0f766e)', color: '#fff', borderColor: 'transparent' }
                    : { background: 'transparent', color: 'var(--muted)', borderColor: 'var(--border)' }}
                >
                  <Icon size={14} weight="bold" />{label}
                </button>
              ))}
            </div>

            {tab === 'groups' && (
              <div className="flex flex-wrap gap-2">
                {groups.map(g => chip(g.group, g.count, selectedGroups.includes(g.group), () => toggle(selectedGroups, g.group, setSelectedGroups)))}
                {groups.length === 0 && <p className="text-xs" style={{ color: 'var(--muted)' }}>No contact groups yet — add contacts on the right.</p>}
              </div>
            )}
            {tab === 'roles' && (
              <div className="flex flex-wrap gap-2">
                {ROLE_OPTIONS.map(r => chip(r, undefined, selectedRoles.includes(r), () => toggle(selectedRoles, r, setSelectedRoles)))}
              </div>
            )}
            {tab === 'partners' && (
              <div className="flex flex-wrap gap-2">
                {chip('All Partners', undefined, partnerScope === 'ALL', () => setPartnerScope(partnerScope === 'ALL' ? '' : 'ALL'))}
                {NICHES.map(n => chip(`Niche: ${n}`, undefined, partnerScope === n, () => setPartnerScope(partnerScope === n ? '' : n)))}
              </div>
            )}
            {tab === 'individual' && (
              <textarea
                className={inputCls}
                style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
                placeholder="Enter numbers separated by commas or new lines, e.g. 0712345678, 254701234567"
                value={numbersText}
                onChange={e => setNumbersText(e.target.value)}
              />
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              {lastResult && (
                <p className="text-xs font-bold" style={{ color: 'var(--muted)' }}>
                  Last: {lastResult.sent} sent · {lastResult.failed} failed
                </p>
              )}
              <button
                onClick={() => sendMutation.mutate()}
                disabled={!message.trim() || !hasRecipients || sendMutation.isPending}
                className="ml-auto flex items-center gap-2 px-6 py-3 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
              >
                <PaperPlaneRight size={16} weight="fill" />
                {sendMutation.isPending ? 'Sending…' : 'Send SMS'}
              </button>
            </div>
          </div>
        </div>

        {/* Contacts manager */}
        <div className={`p-5 ${card}`} style={cardStyle}>
          <div className="flex items-center gap-2 mb-4">
            <UsersThree size={18} weight="fill" className="text-brand-teal" />
            <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recipient Contacts</h3>
          </div>
          <div className="space-y-2 mb-4">
            <input className={inputCls} style={inputStyle} placeholder="Name" value={newContact.name} onChange={e => setNewContact(c => ({ ...c, name: e.target.value }))} />
            <input className={inputCls} style={inputStyle} placeholder="Phone e.g. 0712345678" value={newContact.phone} onChange={e => setNewContact(c => ({ ...c, phone: e.target.value }))} />
            <input className={inputCls} style={inputStyle} placeholder="Group e.g. SURVEILLANCE" value={newContact.group} onChange={e => setNewContact(c => ({ ...c, group: e.target.value.toUpperCase() }))} />
            <button
              onClick={() => addContactMutation.mutate()}
              disabled={!newContact.name.trim() || !newContact.phone.trim() || !newContact.group.trim() || addContactMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-green text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
            >
              <Plus size={16} weight="bold" />Add Contact
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-1.5">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{c.name}</p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>{c.phone} · <span className="font-bold">{c.group}</span></p>
                </div>
                <button onClick={() => deleteContactMutation.mutate(c.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 transition-all flex-shrink-0">
                  <Trash size={16} weight="bold" />
                </button>
              </div>
            ))}
            {contacts.length === 0 && <p className="text-xs" style={{ color: 'var(--muted)' }}>No contacts yet.</p>}
          </div>
        </div>
      </div>

      {/* Templates editor */}
      <div className={`p-5 ${card}`} style={cardStyle}>
        <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Message Templates</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.key} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{t.label}</p>
                {editingTemplate === t.key ? (
                  <button onClick={() => saveTemplateMutation.mutate({ key: t.key, body: templateBody })} className="text-brand-teal" title="Save">
                    <FloppyDisk size={16} weight="fill" />
                  </button>
                ) : (
                  <button onClick={() => { setEditingTemplate(t.key); setTemplateBody(t.body); }} className="text-xs font-bold text-brand-teal">Edit</button>
                )}
              </div>
              {editingTemplate === t.key ? (
                <textarea className={inputCls} style={{ ...inputStyle, minHeight: 90, fontSize: 12 }} value={templateBody} onChange={e => setTemplateBody(e.target.value)} />
              ) : (
                <p className="text-xs" style={{ color: 'var(--ink)' }}>{t.body}</p>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] mt-3" style={{ color: 'var(--muted)' }}>
          Placeholders: <code>{'{{caseNumber}}'}</code>, <code>{'{{location}}'}</code>, <code>{'{{count}}'}</code>, <code>{'{{nature}}'}</code> — filled automatically for auto/surveillance sends.
        </p>
      </div>

      {/* Logs */}
      <div className={`${card} overflow-hidden`} style={cardStyle}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--ink)' }}>SMS Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--muted)' }} className="text-left text-[10px] font-black uppercase tracking-widest">
                <th className="px-5 py-3">When</th>
                <th className="px-5 py-3">Recipient</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-5 py-3 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                    {new Date(l.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-5 py-3 font-mono" style={{ color: 'var(--ink)' }}>{l.recipient}</td>
                  <td className="px-5 py-3"><span className="text-[10px] font-black uppercase" style={{ color: 'var(--muted)' }}>{l.category}</span></td>
                  <td className="px-5 py-3">
                    {l.status === 'SENT'
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold text-brand-green"><CheckCircle size={14} weight="fill" />Sent</span>
                      : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500" title={l.error ?? ''}><XCircle size={14} weight="fill" />Failed</span>}
                  </td>
                  <td className="px-5 py-3 max-w-xs truncate" style={{ color: 'var(--ink)' }}>{l.message}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>No messages sent yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

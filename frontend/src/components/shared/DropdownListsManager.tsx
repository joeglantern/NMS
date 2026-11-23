import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { useNotificationStore } from '../../stores/notificationStore';
import { sortAZ } from '../../lib/sortOptions';
import {
  ADDED_OPTIONS_KEY, DROPDOWN_LISTS, useAddedDropdownOptions,
  type AddedDropdownOption, type DropdownField,
} from '../../lib/dropdownLists';

const FIELDS = Object.keys(DROPDOWN_LISTS) as DropdownField[];
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface Row { label: string; added?: AddedDropdownOption }

/**
 * Admin section: add options to the form dropdowns that are not natures.
 * Built-in options cannot be removed; added ones can.
 */
export default function DropdownListsManager() {
  const [field, setField] = useState<DropdownField>('originOfAlert');
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const { data: added = [], isLoading, isError, refetch } = useAddedDropdownOptions();

  const list = DROPDOWN_LISTS[field];
  const rowsFor = (f: DropdownField): Row[] => {
    const rows: Row[] = DROPDOWN_LISTS[f].builtIn.map(label => ({ label }));
    added.filter(o => o.field === f).forEach(o => {
      if (!rows.some(r => same(r.label, o.label))) rows.push({ label: o.label, added: o });
    });
    return sortAZ(rows, r => r.label);
  };
  const rows = rowsFor(field);

  const addMutation = useMutation({
    mutationFn: (label: string) => api.post('/options/dropdowns', { field, label }),
    onSuccess: (_res, label) => {
      queryClient.invalidateQueries({ queryKey: ADDED_OPTIONS_KEY });
      setDraft('');
      addNotification({ type: 'success', title: 'Added', message: `"${label}" is now in ${list.name}.` });
    },
    onError: (err: any) => {
      setProblem(err?.response?.data?.message || 'Could not save. Check the connection and try again.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (option: AddedDropdownOption) => api.delete(`/options/dropdowns/${option.id}`),
    onSuccess: (_res, option) => {
      queryClient.invalidateQueries({ queryKey: ADDED_OPTIONS_KEY });
      addNotification({ type: 'success', title: 'Removed', message: `"${option.label}" was removed. Old cases keep it.` });
    },
    onError: () => {
      addNotification({ type: 'error', title: 'Not removed', message: 'Could not remove the option. Try again.' });
    },
  });

  function submit() {
    const label = draft.trim().replace(/\s+/g, ' ');
    if (!label) { setProblem('Type the new option first.'); return; }
    const clash = rows.find(r => same(r.label, label));
    if (clash) { setProblem(`"${clash.label}" is already in this list.`); return; }
    setProblem('');
    addMutation.mutate(label);
  }

  const cell = { fontSize: 13, color: 'var(--ink)', fontWeight: 600 } as const;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--ink)', letterSpacing: '-0.01em' }}>Other dropdown lists</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          Add an option here and it shows in the form, in A to Z order.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
        {/* Which list */}
        <div style={{ flex: '1 1 240px', maxWidth: 320, borderRight: '1px solid var(--border)' }}>
          {FIELDS.map(f => {
            const on = f === field;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => { setField(f); setDraft(''); setProblem(''); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 24px', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', textAlign: 'left',
                  background: on ? 'rgba(34,197,94,0.1)' : 'transparent',
                  boxShadow: on ? 'inset 3px 0 0 var(--green)' : 'none',
                }}
              >
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{DROPDOWN_LISTS[f].name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{DROPDOWN_LISTS[f].where}</span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {isLoading ? '' : rowsFor(f).length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Its options */}
        <div style={{ flex: '999 1 320px', minWidth: 0 }}>
          {isError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>
                Could not load the options you added. The built-in ones are shown.
              </span>
              <button type="button" onClick={() => refetch()} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', background: 'none', border: '1.5px solid var(--border)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
                Try again
              </button>
            </div>
          )}

          {rows.map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px', minHeight: 44, borderBottom: '1px solid var(--border)' }}>
              <span style={{ ...cell, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{r.label}</span>
              {r.added ? (
                <button
                  type="button"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(r.added!)}
                  style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}
                >
                  {removeMutation.isPending && removeMutation.variables?.id === r.added.id ? 'Removing…' : 'Remove'}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Built in</span>
              )}
            </div>
          ))}
          {isLoading && (
            <div style={{ padding: '10px 24px', fontSize: 13, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              Loading the options you added…
            </div>
          )}

          <div style={{ padding: '14px 24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <input
                aria-label={`New option for ${list.name}`}
                placeholder="New option"
                maxLength={60}
                value={draft}
                onChange={e => { setDraft(e.target.value); if (problem) setProblem(''); }}
                onKeyDown={e => e.key === 'Enter' && submit()}
                style={{
                  flex: '1 1 200px', minWidth: 0, padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, outline: 'none',
                  border: `1px solid ${problem ? '#ef4444' : 'var(--border)'}`, background: 'var(--surface-2)', color: 'var(--ink)',
                }}
              />
              <button
                type="button"
                onClick={submit}
                disabled={addMutation.isPending}
                style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--green)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: addMutation.isPending ? 0.7 : 1 }}
              >
                {addMutation.isPending ? 'Adding…' : `Add to ${list.name}`}
              </button>
            </div>
            {problem && <p role="alert" style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600, marginTop: 8 }}>{problem}</p>}
          </div>
        </div>
      </div>

      <p style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
        Built-in options stay. Removing one you added does not change old cases. They keep the words they were saved with.
      </p>
    </div>
  );
}

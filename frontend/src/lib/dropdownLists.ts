import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { sortAZ } from './sortOptions';

/**
 * The form dropdowns an admin can add options to. Built-in options are fixed
 * here; options added under Nature Options > Other dropdown lists come from
 * the server and are merged in, A to Z.
 */
export const DROPDOWN_LISTS = {
  alertMode: {
    name: 'Alert mode',
    where: 'New alert form',
    builtIn: ['Phone', 'Radio', 'Walk-in', 'Other'],
  },
  facilityType: {
    name: 'Facility type',
    where: 'Facilities',
    builtIn: ['Clinic', 'Dispensary', 'Health Centre', 'Hospital', 'Maternity', 'Nursing Home'],
  },
  modeOfDelivery: {
    name: 'Mode of delivery',
    where: 'New alert form, maternity',
    builtIn: ['Assisted Vaginal (Forceps)', 'Assisted Vaginal (Vacuum)', 'Breech', 'Caesarean Section', 'SVD', 'Other'],
  },
  newbornSex: {
    name: 'Newborn sex',
    where: 'New alert form, maternity',
    builtIn: ['Female', 'Indeterminate', 'Male'],
  },
  originOfAlert: {
    name: 'Origin of alert',
    where: 'New alert form',
    builtIn: ['Community', 'Fire Department', 'Health Facility', 'National Dispatch (SHA)', 'Other EMS', 'Police', 'Self-referral', 'Other'],
  },
  patientSex: {
    name: 'Sex',
    where: 'New alert form, patient',
    builtIn: ['Female', 'Male', 'Other'],
  },
} as const;

export type DropdownField = keyof typeof DROPDOWN_LISTS;

export interface AddedDropdownOption {
  id: string;
  field: string;
  label: string;
  createdAt: string;
}

export const ADDED_OPTIONS_KEY = ['dropdown-options'] as const;

export function useAddedDropdownOptions() {
  return useQuery<AddedDropdownOption[]>({
    queryKey: ADDED_OPTIONS_KEY,
    queryFn: async () => {
      const res = await api.get('/options/dropdowns');
      return res.data.data as AddedDropdownOption[];
    },
    staleTime: 5 * 60_000,
  });
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Options for one dropdown: built-in plus added, A to Z with "Other" last.
 * Pass the field's current value so a record saved with an option that was
 * later removed still shows what it was saved with.
 */
export function useDropdownList(field: DropdownField, current?: string | null): string[] {
  const { data: added } = useAddedDropdownOptions();
  return useMemo(() => {
    const labels: string[] = [...DROPDOWN_LISTS[field].builtIn];
    const push = (label?: string | null) => {
      if (label && label.trim() && !labels.some(l => sameLabel(l, label))) labels.push(label);
    };
    (added ?? []).filter(o => o.field === field).forEach(o => push(o.label));
    push(current);
    return sortAZ(labels);
  }, [added, field, current]);
}

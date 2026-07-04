import { useCallback, useState } from 'react';
import { usePatientsListInfinite } from '@repo/api-client';
import type { Patient } from '@repo/schemas';

const PAGE_SIZE = 20;

/**
 * ViewModel for the patient list: the generated infinite query plus a
 * client-side name search. Returns one typed object — the view renders it
 * and nothing else.
 */
export function usePatientList() {
  const [search, setSearch] = useState('');

  const query = usePatientsListInfinite(
    { search: search.trim() || undefined, limit: PAGE_SIZE },
    {
      query: {
        initialPageParam: undefined,
        getNextPageParam: (lastPage: { nextCursor: string | null }) =>
          lastPage.nextCursor ?? undefined,
      },
    },
  );

  const patients: Patient[] = query.data?.pages.flatMap((page) => page.items) ?? [];

  return {
    patients,
    search,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    onSearchChange: setSearch,
    onLoadMore: useCallback(() => void query.fetchNextPage(), [query]),
  };
}

export type PatientListViewModel = ReturnType<typeof usePatientList>;

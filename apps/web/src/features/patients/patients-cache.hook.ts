import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getConsultationsListUrl, getPatientsListUrl } from '@repo/api-client';

/**
 * Invalidate every patients + consultations query (all filters, cursors,
 * and details) after a mutation. Generated query keys start with the
 * endpoint URL, so a prefix predicate covers every variant at once.
 */
export function useInvalidatePatients(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const bases = [getPatientsListUrl({}), getConsultationsListUrl({ patientId: '' })].map(
      (url) => url.split('?')[0] ?? url,
    );
    await queryClient.invalidateQueries({
      // Infinite query keys are ['infinite', <url>, ...]; plain ones [<url>, ...].
      predicate: (query) =>
        query.queryKey.some(
          (part) => typeof part === 'string' && bases.some((base) => part.startsWith(base)),
        ),
    });
  }, [queryClient]);
}

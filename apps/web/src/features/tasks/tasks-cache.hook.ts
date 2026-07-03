import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getTasksListUrl } from '@repo/api-client';

/**
 * Invalidate every tasks query (all filters, cursors, and details) after a
 * mutation. Generated query keys start with the endpoint URL, so a prefix
 * predicate covers every variant at once.
 */
export function useInvalidateTasks(): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(async () => {
    const url = getTasksListUrl({});
    const base = url.split('?')[0] ?? url;
    await queryClient.invalidateQueries({
      // Infinite query keys are ['infinite', <url>, ...]; plain ones [<url>, ...].
      predicate: (query) =>
        query.queryKey.some((part) => typeof part === 'string' && part.startsWith(base)),
    });
  }, [queryClient]);
}

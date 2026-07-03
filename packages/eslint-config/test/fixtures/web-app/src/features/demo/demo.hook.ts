// FIXTURE: must PASS lint — hooks are the home of the data layer.
import { useQuery } from '@tanstack/react-query';

export function useDemo() {
  return useQuery({ queryKey: ['demo'], queryFn: async () => 'demo' });
}

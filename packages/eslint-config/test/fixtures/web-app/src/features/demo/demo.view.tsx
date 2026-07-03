// FIXTURE: must FAIL lint — a view importing the data layer.
import { useQuery } from '@tanstack/react-query';

export function DemoView() {
  const { data } = useQuery({ queryKey: ['demo'], queryFn: async () => 'demo' });
  return <p>{data}</p>;
}

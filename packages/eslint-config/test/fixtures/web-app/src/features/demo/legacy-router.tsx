// FIXTURE: must FAIL lint — react-router-dom is banned everywhere (stale-training trap).
import { Link } from 'react-router-dom';

export function LegacyLink() {
  return <Link to="/">home</Link>;
}

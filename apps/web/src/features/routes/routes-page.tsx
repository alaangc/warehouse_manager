import { useSession } from '../../app/session.js';
import { AdminRoutePages } from './admin-route-pages.js';
import { DriverRoutePages } from './driver-route-pages.js';

export function RoutesPage() {
  const session = useSession();
  return session.user?.role === 'ADMINISTRATOR' ? <AdminRoutePages /> : <DriverRoutePages />;
}

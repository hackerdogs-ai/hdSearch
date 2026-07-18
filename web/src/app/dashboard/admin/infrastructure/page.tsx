import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { api, ApiError } from '@/lib/api';
import { SetupWizard } from '@/components/setup-wizard';

export const dynamic = 'force-dynamic';

// Admin-only editor for the infrastructure endpoints first set in the /setup wizard.
// Reuses SetupWizard in `edit` mode (no welcome/progress, saves keep setup complete).
export default async function InfrastructurePage() {
  const user = getSession();
  if (!user) redirect('/login');

  let acc: any = null;
  try {
    acc = await api.account();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/api/auth/logout');
  }

  if ((acc?.role || 'user') !== 'admin') {
    return (
      <div className="card p-8 text-center">
        <h1 className="text-xl font-bold text-ink-900">Access Denied</h1>
        <p className="mt-2 text-sm text-ink-500">Infrastructure settings are restricted to administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">Infrastructure</h1>
        <p className="mt-1 text-sm text-ink-500">
          Connection endpoints for datastores and providers. Changes to infrastructure require an API restart to reconnect.
        </p>
      </div>
      <SetupWizard edit />
    </div>
  );
}

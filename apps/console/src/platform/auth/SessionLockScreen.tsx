import { Button, Modal } from '@scheduler/design-system';
import { useAuth } from '../../context/AuthContext';
import { LoginPage } from './LoginPage';
import { MfaCeremony } from './MfaCeremony';
import { PageBody } from '../../components/control-plane/PageBody';

const TITLE_ID = 'session-lock-title';

/** Full-screen, focus-trapped lock over retained (inert) work. Only a
 *  re-authentication prompt can be dismissed; an expired session cannot. */
export function SessionLockScreen() {
  const { user, lockReason, refresh, cancelReauthentication } = useAuth();
  const reauth = lockReason === 'reauth' && !!user && !user.isBootstrap;
  return <Modal titleId={TITLE_ID} locked={!reauth} onClose={cancelReauthentication}
    panelClassName="fixed inset-0 overflow-auto bg-background text-foreground">
    <h2 id={TITLE_ID} className="sr-only">Session verification</h2>
    <p role="status" className="px-6 pt-6 text-center text-sm text-muted-foreground">
      Your unsent changes are kept in this tab.
    </p>
    {user?.isBootstrap ? <PageBody variant="form" className="space-y-4">
      <h1 className="text-xl font-semibold">Reconnect to continue</h1>
      <Button onClick={() => void refresh()}>Retry connection</Button>
    </PageBody> : reauth ? <PageBody variant="form" className="flex flex-col items-center gap-4">
      <MfaCeremony user={user} mode="verify" onComplete={refresh} />
      <Button variant="ghost" onClick={cancelReauthentication}>Cancel verification</Button>
    </PageBody> : <LoginPage locked />}
  </Modal>;
}

import { useEffect, useState } from 'react';
import { useKindeAuth } from '@kinde-oss/kinde-auth-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import api from '@/apis/client';
import axios from 'axios';

/**
 * Installation method for app integrations.
 * - 'oauth': Redirect user to OAuth flow (e.g., Google Calendar, LinkedIn)
 * - 'input': Show input dialog for API keys/credentials before installing
 * - 'direct': Install immediately without additional user input
 */
export type InstallMethod = 'oauth' | 'input' | 'direct';

export type InstallAppProps = {
  type: string;
  slug: string;
  variant: string;
  allowedMultipleInstalls: boolean;
  isGlobal?: boolean;
  /** Installation method: 'oauth' for OAuth flow, 'input' for input dialog, 'direct' for immediate install */
  installMethod?: InstallMethod;
  /**
   * Optional custom OAuth redirect path. If not provided, defaults to convention: `/integrations/{slug}/add`
   * Only used when installMethod is 'oauth'
   */
  oauthPath?: string;
  /** @deprecated Use installMethod='input' instead. For 'input' method: show input dialog before installing */
  isInputDialog?: boolean;
  inputKeys?: { code: string; name: string }[];
  inputDialogTitle?: string;
};

// Simplified InstallApp based on provided sample, mocked locally
export default function InstallApp({
  type,
  slug,
  variant,
  allowedMultipleInstalls,
  isGlobal = false,
  installMethod = 'direct',
  oauthPath,
  isInputDialog = false,
  inputKeys,
  inputDialogTitle,
}: InstallAppProps) {
  const { toast } = useToast();
  const { login } = useKindeAuth();
  const [existingCount, setExistingCount] = useState<number>(0);
  const [credentialIds, setCredentialIds] = useState<number[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState<boolean>(true);
  const [installing, setInstalling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [inputOpen, setInputOpen] = useState(false);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const doInstall = async () => {
    setInstalling(true);
    await new Promise((r) => setTimeout(r, 500));
    setExistingCount((c) => c + 1);
    setInstalling(false);
    toast({ title: `Installed ${slug}`, description: `${type} (${variant}) installed.` });
  };

  const doDisconnect = async () => {
    if (credentialIds.length === 0) {
      toast({ title: 'No credentials to disconnect' });
      return;
    }

    setDisconnecting(true);
    const id = credentialIds[0];
    try {
      // Try DELETE endpoint (may not exist yet)
      await api.delete(`/credentials/${id}`);
      toast({ title: `Disconnected ${slug}`, description: `Credential ${id} removed.` });
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const status = e.response?.status;
        if (status === 401 || status === 403) {
          toast({
            title: 'Please sign in',
            description: 'You need to log in to disconnect this app.',
          });
          await login?.();
          setDisconnecting(false);
          return;
        }
        if (status === 404 || status === 405) {
          // Endpoint not implemented server-side yet - inform the user
          toast({
            title: 'Disconnect not supported',
            description: 'Server does not support remote disconnect for this integration yet.',
          });
        } else {
          toast({ title: 'Failed to disconnect', description: e.message });
        }
      } else {
        toast({ title: 'Failed to disconnect', description: 'Unknown error' });
      }
    } finally {
      setDisconnecting(false);
      // Refresh credentials list to reflect any server-side changes
      try {
        const resp = await api.get('/credentials', { params: { appId: type, owner: 'user' } });
        const creds = resp.data?.data ?? [];
        setCredentialIds(
          Array.isArray(creds)
            ? creds
                .map((c: unknown) => {
                  if (
                    typeof c === 'object' &&
                    c !== null &&
                    'id' in (c as Record<string, unknown>)
                  ) {
                    return Number((c as Record<string, unknown>).id);
                  }
                  return NaN;
                })
                .filter((n) => !Number.isNaN(n))
            : [],
        );
        setExistingCount(Array.isArray(creds) ? creds.length : 0);
      } catch {
        // ignore refresh errors
      }
    }
  };

  const getApiBaseUrl = () => {
    if (typeof window === 'undefined') return 'http://localhost:3000';
    const fromEnv = import.meta.env?.VITE_API_BASE_URL as string | undefined;
    if (fromEnv) return fromEnv;
    return `${window.location.protocol}//${window.location.hostname}:3000`;
  };

  // Fetch existing credentials for this app on mount
  useEffect(() => {
    let mounted = true;
    const fetchCredentials = async () => {
      setLoadingCredentials(true);
      try {
        const resp = await api.get('/credentials', { params: { appId: type, owner: 'user' } });
        // API returns { success: true, data: [...] }
        const creds = resp.data?.data ?? [];
        if (mounted) {
          const arr = Array.isArray(creds) ? creds : [];
          setExistingCount(arr.length);
          // Capture credential ids so the Disconnect button knows what to delete
          const ids = arr
            .map((c: unknown) => {
              if (typeof c === 'object' && c !== null && 'id' in (c as Record<string, unknown>)) {
                return Number((c as Record<string, unknown>).id);
              }
              return NaN;
            })
            .filter((n) => Number.isFinite(n)) as number[];
          setCredentialIds(ids);
        }
      } catch (e) {
        if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          if (status === 401 || status === 403) {
            // Not authenticated—kick off login
            toast({
              title: 'Please sign in',
              description: 'You need to log in to manage integrations.',
            });
            await login?.();
          }
        }
        // keep existingCount as-is on other errors
      } finally {
        if (mounted) setLoadingCredentials(false);
      }
    };

    void fetchCredentials();

    return () => {
      mounted = false;
    };
  }, [type, login, toast]);

  const onClickInstall = async () => {
    // Handle OAuth flow - redirect to backend OAuth initiation endpoint
    // Convention: /integrations/{slug}/add
    if (installMethod === 'oauth') {
      const apiBaseUrl = getApiBaseUrl();
      const redirectPath = oauthPath || `/integrations/${slug}/add`;

      const fetchAddUrl = async () =>
        api.get<{ url?: string }>(redirectPath, { params: { format: 'json' } });

      try {
        const resp = await fetchAddUrl();
        if (resp.status === 200 && resp.data?.url) {
          window.location.href = resp.data.url;
          return;
        }
      } catch (e) {
        if (axios.isAxiosError(e)) {
          const status = e.response?.status;
          if (status === 401 || status === 403) {
            // Not authenticated — login, then retry once
            toast({
              title: 'Please sign in',
              description: 'You need to log in to install this app.',
            });
            await login?.();
            try {
              const resp2 = await fetchAddUrl();
              if (resp2.status === 200 && resp2.data?.url) {
                window.location.href = resp2.data.url;
                return;
              }
            } catch {
              // ignore; toast below
            }
          }
        }
        toast({ title: 'Failed to start install', description: 'Please try again.' });
      }
      return;
    }

    // Handle input dialog method - show credentials input before installing
    if (installMethod === 'input' && inputKeys && inputKeys.length > 0) {
      setInputOpen(true);
      return;
    }

    // Handle direct install method - install immediately
    void doInstall();
  };

  const handleSaveInputs = async () => {
    // In real app, send inputValues to API before installing
    await doInstall();
    setInputOpen(false);
  };

  const LeftStatus = (
    <Button variant="secondary" size="sm" className="px-2" disabled>
      {existingCount > 0 ? `${existingCount} active` : 'Not installed'}
    </Button>
  );

  // Rendering branches (simplified from sample)
  if (isGlobal || (existingCount > 0 && allowedMultipleInstalls)) {
    return (
      <div className="flex items-center gap-3">
        {LeftStatus}
        {!isGlobal && (
          <Button size="sm" onClick={onClickInstall} disabled={installing}>
            {installing ? 'Installing...' : existingCount > 0 ? 'Install another' : 'Install'}
          </Button>
        )}

        {/* Optional input dialog */}
        <Dialog open={inputOpen} onOpenChange={setInputOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{inputDialogTitle ?? 'Add credentials'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {(inputKeys ?? []).map((k) => (
                <div key={k.code} className="grid gap-2">
                  <Label htmlFor={k.code}>{k.name}</Label>
                  <Input
                    id={k.code}
                    value={inputValues[k.code] ?? ''}
                    onChange={(e) => setInputValues((v) => ({ ...v, [k.code]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setInputOpen(false)}>
                Close
              </Button>
              <Button onClick={handleSaveInputs} disabled={installing}>
                {installing ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (existingCount > 0) {
    return (
      <div className="flex items-center gap-3">
        {LeftStatus}
        <Button variant="destructive" size="sm" onClick={doDisconnect} disabled={disconnecting}>
          {disconnecting ? 'Disconnecting...' : 'Disconnect'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {LeftStatus}
      <Button size="sm" onClick={onClickInstall} disabled={installing}>
        {installing ? 'Installing...' : 'Install'}
      </Button>

      {/* Optional input dialog */}
      <Dialog open={inputOpen} onOpenChange={setInputOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{inputDialogTitle ?? 'Add credentials'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {(inputKeys ?? []).map((k) => (
              <div key={k.code} className="grid gap-2">
                <Label htmlFor={k.code}>{k.name}</Label>
                <Input
                  id={k.code}
                  value={inputValues[k.code] ?? ''}
                  onChange={(e) => setInputValues((v) => ({ ...v, [k.code]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setInputOpen(false)}>
              Close
            </Button>
            <Button onClick={handleSaveInputs} disabled={installing}>
              {installing ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import InstallApp from '@/components/apps/InstallApp';
import type { InstallMethod } from '@/components/apps/InstallApp';
import type { FC } from 'react';
import { useEffect, useState } from 'react';
import api from '@/apis/client';

export type AppCardInstallProps = {
  type: string;
  slug: string;
  variant: string;
  allowedMultipleInstalls: boolean;
  installMethod?: InstallMethod;
};

export type AppCardProps = {
  title: string;
  description: string;
  logoSrc: string;
  installProps: AppCardInstallProps;
};

const AppCard: FC<AppCardProps> = ({ title, description, logoSrc, installProps }) => {
  const [installedUser, setInstalledUser] = useState<{
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null>(null);

  const refreshInstalledUser = async () => {
    try {
      console.log('[AppCard] Fetching credentials', {
        appType: installProps.type,
        slug: installProps.slug,
      });
      const resp = await api.get('/credentials', {
        params: { appId: installProps.type, owner: 'user' },
      });
      console.log('[AppCard] Credentials response', resp.status, resp.data);
      const list = Array.isArray(resp.data?.data) ? resp.data.data : [];
      console.log('[AppCard] Credentials parsed list length', list.length);
      if (list.length > 0) {
        const c = list[0] as any;
        console.log('[AppCard] Using first credential', {
          id: c?.id,
          name: c?.name,
          emailOrUserName: c?.emailOrUserName,
          avatarUrl: c?.avatarUrl,
        });
        setInstalledUser({
          name: c?.name ?? undefined,
          email: c?.emailOrUserName ?? undefined,
          avatarUrl: c?.avatarUrl ?? undefined,
        });
      } else {
        console.log('[AppCard] No credentials found for app', installProps.type);
        setInstalledUser(null);
      }
    } catch {
      console.error('[AppCard] Failed to fetch credentials for app', installProps.type);
    }
  };

  useEffect(() => {
    console.log('[AppCard] Mount/dep change; refreshing installed user for app', installProps.type);
    void refreshInstalledUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installProps.type]);

  return (
    <div className="flex flex-col rounded-xl border bg-card p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="h-12 w-12 sm:h-[50px] sm:w-[50px] overflow-hidden rounded-md bg-muted">
        <img src={logoSrc} alt={`${title} logo`} className="h-full w-full object-contain" />
      </div>
      <div className="mt-3 sm:mt-4 text-sm sm:text-base font-semibold text-foreground">{title}</div>
      <div className="mb-3 flex-1 text-xs sm:text-sm leading-5 sm:leading-6 text-muted-foreground">{description}</div>

      {installedUser && (
        <div className="mb-3 sm:mb-4 text-xs text-muted-foreground">
          Connected as{' '}
          <span className="text-foreground font-medium">
            {installedUser.name || installedUser.email}
          </span>
        </div>
      )}

      <div>
        <InstallApp
          type={installProps.type}
          slug={installProps.slug}
          variant={installProps.variant}
          allowedMultipleInstalls={installProps.allowedMultipleInstalls}
          installMethod={installProps.installMethod}
          onInstalled={() => refreshInstalledUser()}
        />
      </div>
    </div>
  );
};

export default AppCard;

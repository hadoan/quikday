import InstallApp from '@/components/apps/InstallApp';
import type { InstallMethod } from '@/components/apps/InstallApp';
import type { FC } from 'react';

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
  return (
    <div className="flex flex-col rounded-xl border bg-card p-6 shadow-sm">
      <div className="h-[50px] w-[50px] overflow-hidden rounded-md bg-muted">
        <img src={logoSrc} alt={`${title} logo`} className="h-full w-full object-contain" />
      </div>
      <div className="mt-4 text-sm font-semibold text-foreground">{title}</div>
      <div className="mb-4 flex-1 text-xs leading-6 text-muted-foreground">{description}</div>
      <div>
        <InstallApp
          type={installProps.type}
          slug={installProps.slug}
          variant={installProps.variant}
          allowedMultipleInstalls={installProps.allowedMultipleInstalls}
          installMethod={installProps.installMethod}
        />
      </div>
    </div>
  );
};

export default AppCard;

import React from 'react';

import { Button } from '@/components/ui/button';
import { Menu, Plus } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { UserMenu } from '@/components/layout/UserMenu';

interface ChatHeaderProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewTask: () => void;
  onViewProfile: () => void;
  onEditProfile: () => void;
  onLogout: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({
  isSidebarCollapsed,
  onToggleSidebar,
  onNewTask,
  onViewProfile,
  onEditProfile,
  onLogout,
}) => {
  return (
    <header className="border-b border-border bg-card px-3 sm:px-4 md:px-6 lg:px-8 py-3 sm:py-4 flex-shrink-0">
      <div className="flex items-center gap-2 md:gap-3">
        {/* Mobile menu button */}
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="md:hidden h-9 w-9">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex-1 min-w-0">
          <h1 className="text-base sm:text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <img
              src="/logo/logo-light-bg.svg"
              alt="Quik.day"
              className="h-5 sm:h-6 w-auto dark:hidden flex-shrink-0"
            />
            <img
              src="/logo/logo-dark-bg.svg"
              alt="Quik.day"
              className="h-5 sm:h-6 w-auto hidden dark:block flex-shrink-0"
            />
            <span className="hidden sm:inline truncate">One Prompt. One Run. Done.</span>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" onClick={onNewTask} className="gap-2 h-9">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Task</span>
          </Button>
          <UserMenu
            onViewProfile={onViewProfile}
            onEditProfile={onEditProfile}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
};

export default ChatHeader;

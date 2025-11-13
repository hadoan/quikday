import React from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import AppHeader from '@/components/layout/AppHeader';

interface ChatHeaderProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewTask: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ onToggleSidebar, onNewTask }) => {
  return (
    <AppHeader
      title="One Prompt. One Run. Done."
      onToggleSidebar={onToggleSidebar}
      actions={
        <Button size="sm" onClick={onNewTask} className="gap-2 h-9">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Task</span>
        </Button>
      }
    />
  );
};

export default ChatHeader;

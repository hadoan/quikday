import { Calendar, MessageSquare, FileText, Mail, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const toolIcons: Record<string, React.ReactNode> = {
  'Google Calendar': <Calendar className="h-3 w-3" />,
  Calendar: <Calendar className="h-3 w-3" />,
  Slack: <MessageSquare className="h-3 w-3" />,
  Notion: <FileText className="h-3 w-3" />,
  Email: <Mail className="h-3 w-3" />,
  HubSpot: <Database className="h-3 w-3" />,
  Jira: <FileText className="h-3 w-3" />,
};

interface ToolBadgeProps {
  tool: string;
  status?: 'connected' | 'disconnected';
}

export const ToolBadge = ({ tool, status = 'connected' }: ToolBadgeProps) => {
  return (
    <Badge variant="secondary" className="gap-1.5 px-3 py-1 border border-border">
      {toolIcons[tool] || <Database className="h-3 w-3" />}
      <span className="text-xs">{tool}</span>
      {status === 'connected' && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
    </Badge>
  );
};

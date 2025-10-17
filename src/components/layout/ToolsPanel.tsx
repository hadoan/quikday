import { ToolBadge } from "@/components/cards/ToolBadge";
import { Activity, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Tool {
  name: string;
  status: "connected" | "disconnected";
}

interface ToolsPanelProps {
  tools: Tool[];
  stats?: {
    runsToday: number;
    successRate: number;
  };
}

export const ToolsPanel = ({ tools, stats }: ToolsPanelProps) => {
  return (
    <div className="w-80 border-l border-border bg-sidebar h-screen flex flex-col p-6 space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-sidebar-foreground mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Connected Tools
        </h3>
        <div className="space-y-2">
          {tools.map((tool) => (
            <div
              key={tool.name}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-sidebar-accent transition-smooth"
            >
              <ToolBadge tool={tool.name} status={tool.status} />
            </div>
          ))}
        </div>
      </div>

      {stats && (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Today's Metrics
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Runs</span>
              <span className="text-lg font-bold text-primary">
                {stats.runsToday}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <span className="text-lg font-bold text-success">
                {stats.successRate}%
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

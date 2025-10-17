import { Clock, Zap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface Run {
  id: string;
  prompt: string;
  timestamp: string;
  status: "completed" | "running" | "failed";
}

interface SidebarProps {
  runs: Run[];
  activeRunId?: string;
  onSelectRun: (runId: string) => void;
}

export const Sidebar = ({ runs, activeRunId, onSelectRun }: SidebarProps) => {
  const filters = [
    { label: "All Runs", icon: Clock },
    { label: "My Runs", icon: Zap },
    { label: "Team", icon: Users },
  ];

  return (
    <div className="w-80 border-r border-border bg-sidebar h-screen flex flex-col">
      <div className="p-6 border-b border-sidebar-border">
        <h2 className="text-lg font-semibold text-sidebar-foreground flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Runfast.now
        </h2>
        <p className="text-sm text-sidebar-foreground/60 mt-1">
          Execution Console
        </p>
      </div>

      <div className="p-4 space-y-2 border-b border-sidebar-border">
        {filters.map((filter) => (
          <Button
            key={filter.label}
            variant="ghost"
            className="w-full justify-start gap-2"
            size="sm"
          >
            <filter.icon className="h-4 w-4" />
            {filter.label}
          </Button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => onSelectRun(run.id)}
              className={cn(
                "w-full text-left p-3 rounded-lg transition-smooth hover:bg-sidebar-accent",
                activeRunId === run.id && "bg-sidebar-accent"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-sm font-medium text-sidebar-foreground line-clamp-1">
                  {run.prompt}
                </p>
                <span
                  className={cn(
                    "h-2 w-2 rounded-full shrink-0 mt-1.5",
                    run.status === "completed" && "bg-success",
                    run.status === "running" && "bg-primary animate-pulse",
                    run.status === "failed" && "bg-destructive"
                  )}
                />
              </div>
              <p className="text-xs text-sidebar-foreground/60">
                {new Date(run.timestamp).toLocaleTimeString()}
              </p>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

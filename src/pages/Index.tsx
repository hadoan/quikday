import { useState } from "react";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { PromptInput } from "@/components/chat/PromptInput";
import { PlanCard } from "@/components/cards/PlanCard";
import { RunCard } from "@/components/cards/RunCard";
import { LogCard } from "@/components/cards/LogCard";
import { UndoCard } from "@/components/cards/UndoCard";
import { OutputCard } from "@/components/cards/OutputCard";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToolsPanel } from "@/components/layout/ToolsPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { mockRuns, mockTools, mockStats } from "@/data/mockRuns";
import { Zap, Plug2 } from "lucide-react";

const Index = () => {
  const [activeRunId, setActiveRunId] = useState(mockRuns[0].id);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(true);
  const activeRun = mockRuns.find((run) => run.id === activeRunId);

  const handleNewPrompt = (prompt: string) => {
    console.log("New prompt:", prompt);
    // In a real app, this would trigger the execution flow
  };

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar
        runs={mockRuns}
        activeRunId={activeRunId}
        onSelectRun={setActiveRunId}
      />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border bg-card px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                One Prompt. One Run. Done.
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Conversational execution interface for founders and teams
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsToolsPanelOpen(!isToolsPanelOpen)}
              className="gap-2"
            >
              <Plug2 className="h-4 w-4" />
              Integrations
            </Button>
          </div>
        </header>

        {/* Chat Area */}
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto px-8 py-8 space-y-6">
            {activeRun?.messages.map((message, idx) => {
              if (message.role === "user") {
                return (
                  <ChatMessage key={idx} role="user">
                    <p className="text-sm">{message.content}</p>
                  </ChatMessage>
                );
              }

              return (
                <ChatMessage key={idx} role="assistant">
                  {message.type === "plan" && <PlanCard data={message.data} />}
                  {message.type === "run" && <RunCard data={message.data} />}
                  {message.type === "log" && <LogCard logs={message.data} />}
                  {message.type === "undo" && <UndoCard data={message.data} />}
                  {message.type === "output" && (
                    <OutputCard
                      title={message.data.title}
                      content={message.data.content}
                      type={message.data.type}
                    />
                  )}
                </ChatMessage>
              );
            })}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-card p-6">
          <div className="max-w-4xl mx-auto">
            <PromptInput onSubmit={handleNewPrompt} />
          </div>
        </div>
      </div>

      {isToolsPanelOpen && (
        <ToolsPanel
          tools={mockTools}
          stats={mockStats}
          onClose={() => setIsToolsPanelOpen(false)}
        />
      )}
    </div>
  );
};

export default Index;

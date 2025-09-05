import { useState } from 'react';
import { ChatWidget } from './chat-widget';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { TimelineWrapper } from '@/components/traces/timeline/timeline-wrapper';
import { useChatActivitiesPolling } from '@/hooks/use-chat-activities-polling';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface PlaygroundProps {
  graphId: string;
  projectId: string;
  tenantId: string;
  setShowPlayground: (show: boolean) => void;
}

export const Playground = ({
  graphId,
  projectId,
  tenantId,
  setShowPlayground,
}: PlaygroundProps) => {
  const [conversationId, setConversationId] = useState<string>(nanoid());

  const {
    chatActivities,
    isPolling,
    error: _error,
    startPolling,
    stopPolling,
  } = useChatActivitiesPolling({
    conversationId,
  });

  return (
    <div className="bg-background h-full w-full z-10 flex flex-col">
      <div className="flex min-h-0 items-center justify-start py-2 px-4 border-b flex-shrink-0">
        <Button variant="ghost" size="sm" className="h-6" onClick={() => setShowPlayground(false)}>
          <ArrowLeft className="h-4 w-4" />
          <span>Back to graph</span>
        </Button>
      </div>
      <div className="flex-1 min-h-0 w-full">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel order={1}>
            <ChatWidget
              conversationId={conversationId}
              setConversationId={setConversationId}
              startPolling={startPolling}
              stopPolling={stopPolling}
              graphId={graphId}
              projectId={projectId}
              tenantId={tenantId}
            />
          </ResizablePanel>
          <ResizableHandle />
          <TimelineWrapper
            isPolling={isPolling}
            conversation={chatActivities}
            enableAutoScroll={true}
          />
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

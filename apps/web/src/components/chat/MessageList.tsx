import React from 'react';
import MessageItem from './MessageItem';
import type { UiRunSummary } from '@/apis/runs';

interface MessageListProps {
  runId?: string;
  messages: UiRunSummary['messages'];
}

const MessageList: React.FC<MessageListProps> = ({ runId, messages }) => {
  return (
    <div className="space-y-6">
      {messages?.map((m, i) => (
        <MessageItem key={i} message={m} runId={runId} />
      ))}
    </div>
  );
};

export default MessageList;

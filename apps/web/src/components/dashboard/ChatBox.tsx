import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ChatBox({ onContinue }: { onContinue: (text: string) => void }) {
  const [draft, setDraft] = useState('');

  return (
    <section className="space-y-2">
      <label className="font-medium">Quick chat</label>
      <textarea
        className="w-full h-32 p-4 border rounded-lg"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write your request…"
      />
      <div>
        <Button
          variant="outline"
          onClick={() => onContinue(draft)}
        >
          Continue in Chat
        </Button>
      </div>
    </section>
  );
}


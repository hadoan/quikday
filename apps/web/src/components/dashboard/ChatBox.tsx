import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ChatBox({ onContinue }: { onContinue: (text: string) => void }) {
  const [draft, setDraft] = useState('');

  return (
    <section className="space-y-2">
      <label className="font-medium text-sm sm:text-base">Quick chat</label>
      <textarea
        className="w-full h-24 sm:h-32 p-3 sm:p-4 border rounded-lg text-sm sm:text-base resize-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write your request…"
      />
      <div>
        <Button variant="outline" onClick={() => onContinue(draft)} className="text-sm">
          Continue in Chat
        </Button>
      </div>
    </section>
  );
}

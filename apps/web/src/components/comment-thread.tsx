'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorMessage, Textarea } from '@fintech/ui';
import { submitCommand } from '@/lib/command';
import { formatDateTime } from '@/lib/format';

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

export function CommentThread({ endpoint, comments, canComment }: { endpoint: string; comments: CommentRow[]; canComment: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await submitCommand(endpoint, { body });
    setPending(false);
    if (!result.ok) {
      setError(`${result.errorCode}: ${result.errorMessage}`);
      return;
    }
    setBody('');
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-sm text-slate-500">No comments yet.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-md bg-slate-50 p-3">
              <p className="text-sm text-slate-800">{comment.body}</p>
              <p className="mt-1 text-xs text-slate-500">
                {comment.author.name} · {formatDateTime(comment.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {canComment ? (
        <form onSubmit={submit} className="space-y-2">
          <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment" aria-label="Comment" required />
          <ErrorMessage>{error}</ErrorMessage>
          <Button type="submit" variant="secondary" disabled={pending}>
            Add comment
          </Button>
        </form>
      ) : null}
    </div>
  );
}

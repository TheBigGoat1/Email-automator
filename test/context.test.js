import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildStructuredContext } from '../src/context.js';

describe('buildStructuredContext', () => {
  it('returns empty structure when messages is empty', () => {
    const out = buildStructuredContext([]);
    assert.strictEqual(out.participants?.length, 0);
    assert.strictEqual(out.byContact?.length, 0);
    assert.strictEqual(out.threads?.length, 0);
    assert.ok(out.summary?.includes('No messages'));
  });

  it('returns empty structure when messages is null/undefined', () => {
    const out = buildStructuredContext(null);
    assert.strictEqual(out.participants?.length, 0);
    assert.ok(out.summary?.includes('No messages'));
  });

  it('extracts participants and byContact from messages', () => {
    const messages = [
      {
        id: '1',
        from: { emailAddress: { address: 'a@x.com' } },
        toRecipients: [{ emailAddress: { address: 'b@x.com' } }],
        subject: 'Hi',
        receivedDateTime: '2024-01-01T12:00:00Z',
        conversationId: 'c1',
        bodyPreview: 'Hello',
      },
    ];
    const out = buildStructuredContext(messages);
    assert.strictEqual(out.participants?.length, 2);
    assert.strictEqual(out.byContact?.length, 1);
    assert.strictEqual(out.threads?.length, 1);
    assert.strictEqual(out.totalMessages, 1);
    assert.ok(out.toneSignals?.suggestedTone);
  });

  it('includes recentBodies when includeBody is true', () => {
    const messages = [
      {
        id: '1',
        from: { emailAddress: { address: 'a@x.com' } },
        toRecipients: [],
        subject: 'Re: meeting',
        receivedDateTime: '2024-01-01T12:00:00Z',
        conversationId: 'c1',
        bodyPreview: 'Short body here',
      },
    ];
    const out = buildStructuredContext(messages, { includeBody: true, bodyMaxChars: 50 });
    assert.ok(Array.isArray(out.recentBodies));
    assert.strictEqual(out.recentBodies.length, 1);
    assert.strictEqual(out.recentBodies[0].length, Math.min(50, 'Short body here'.length));
  });
});

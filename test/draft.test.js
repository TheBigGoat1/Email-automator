import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getContentBlocks, assembleDraftBody } from '../src/draft.js';

describe('getContentBlocks', () => {
  it('returns defaults when no options', () => {
    const b = getContentBlocks();
    assert.ok(b.opener);
    assert.ok(b.closing);
    assert.strictEqual(typeof b.signature, 'string');
  });

  it('uses overrides when provided', () => {
    const b = getContentBlocks({ opener: 'Hi,', closing: 'Cheers,', signature: '— Me' });
    assert.strictEqual(b.opener, 'Hi,');
    assert.strictEqual(b.closing, 'Cheers,');
    assert.strictEqual(b.signature, '— Me');
  });
});

describe('assembleDraftBody', () => {
  it('joins opener, generated body, closing, and optional signature', () => {
    const blocks = getContentBlocks({ opener: 'Hi,', closing: 'Bye,', signature: '' });
    const body = assembleDraftBody('Generated middle paragraph.', blocks);
    assert.ok(body.includes('Hi,'));
    assert.ok(body.includes('Generated middle paragraph.'));
    assert.ok(body.includes('Bye,'));
  });

  it('appends signature when non-empty', () => {
    const blocks = getContentBlocks({ opener: 'Hi,', closing: 'Bye,', signature: '— Alice' });
    const body = assembleDraftBody('Text', blocks);
    assert.ok(body.includes('— Alice'));
  });
});

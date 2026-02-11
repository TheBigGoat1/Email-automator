import { describe, it } from 'node:test';
import assert from 'node:assert';
import { logger } from '../src/logger.js';

describe('logger', () => {
  it('exports info, warn, error', () => {
    assert.strictEqual(typeof logger.info, 'function');
    assert.strictEqual(typeof logger.warn, 'function');
    assert.strictEqual(typeof logger.error, 'function');
  });

  it('info and warn do not throw', () => {
    logger.info('test_event', { count: 1 });
    logger.warn('test_warn', {});
    logger.error('test_error', { message: 'test' });
  });
});

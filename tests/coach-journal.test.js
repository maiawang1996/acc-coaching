import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/coach-journal.js';
import { createJournalFixture, invoke } from './coach-journal-fixture.js';

test('coaching journal: independent records, retries, edits, validation and paging', async () => {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://fixture.supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
  const fixture = createJournalFixture([{ key: 'reflections', value: ['existing reflection'], updated_at: '2026-11-01T00:00:00Z' }]);
  globalThis.fetch = fixture.fetch;
  try {
    const first = { id: '11111111-1111-4111-8111-111111111111', section: 'experience', date: '2026-11-01', content: '我喜欢陪伴客户自己发现答案。', prompt: '有能量的瞬间' };
    const second = { ...first, id: '22222222-2222-4222-8222-222222222222', section: 'clients', content: '愿意主动探索的客户。' };
    assert.equal((await invoke(handler, 'POST', first)).code, 200);
    assert.equal((await invoke(handler, 'POST', first)).code, 200);
    assert.equal((await invoke(handler, 'POST', second)).code, 200);
    assert.equal((await invoke(handler, 'GET')).data.entries.length, 2);
    assert.equal(fixture.rows.size, 3, 'retry must not duplicate entries');
    const edited = await invoke(handler, 'POST', { ...first, content: '更新后的体验。' });
    assert.equal(edited.data.date, '2026-11-01', 'editing preserves the original date');
    assert.equal(edited.data.content, '更新后的体验。');
    assert.deepEqual(fixture.rows.get('reflections').value, ['existing reflection']);
    for (const change of [{ id: 'reflections' }, { section: 'learning' }, { date: '2026-02-30' }, { content: ' ' }, { content: 'a'.repeat(20001) }, { prompt: 5 }]) {
      const before = fixture.calls.length;
      assert.equal((await invoke(handler, 'POST', { ...first, ...change })).code, 400);
      assert.equal(fixture.calls.length, before);
    }
    assert.equal((await invoke(handler, 'DELETE', { id: '*' })).code, 400);
    assert.equal((await invoke(handler, 'DELETE', { id: first.id })).code, 204);
    assert.equal((await invoke(handler, 'GET')).data.entries.length, 1);
    assert(fixture.rows.has('reflections'));
    for (let i = 0; i < 503; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      fixture.rows.set(`coach-journal.${id}`, { key: `coach-journal.${id}`, value: { ...first, id }, updated_at: '2026-11-04T00:00:00Z' });
    }
    assert.equal((await invoke(handler, 'GET')).data.entries.length, 504, 'read all pages');
    fixture.offline = true;
    assert.equal((await invoke(handler, 'POST', first)).code, 502);
    assert.equal((await invoke(handler, 'GET')).code, 502);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});

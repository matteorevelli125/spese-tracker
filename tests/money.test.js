// node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const Money = require('../money.js');

test('toCents: interi, decimali, virgola e errore binario', () => {
  assert.equal(Money.toCents(0), 0);
  assert.equal(Money.toCents(12), 1200);
  assert.equal(Money.toCents(12.3), 1230);
  assert.equal(Money.toCents(0.1 + 0.2), 30);
  assert.equal(Money.toCents(1.005), 101);
  assert.equal(Money.toCents(1234.56), 123456);
  assert.equal(Money.toCents('18,9'), 1890);
  assert.equal(Money.toCents('7.05'), 705);
  assert.ok(Number.isNaN(Money.toCents('abc')));
  assert.ok(Number.isNaN(Money.toCents(Infinity)));
});

test('fromCents e sum', () => {
  assert.equal(Money.fromCents(1234), 12.34);
  assert.equal(Money.sum([333, 333, 334]), 1000);
  assert.equal(Money.sum([]), 0);
});

test('splitEqual: il resto va a me (RC-11)', () => {
  assert.deepEqual(Money.splitEqual(1000, 2), { me: 334, others: [333, 333] });
  assert.deepEqual(Money.splitEqual(8000, 1), { me: 4000, others: [4000] });
  assert.deepEqual(Money.splitEqual(9600, 3), { me: 2400, others: [2400, 2400, 2400] });
  assert.deepEqual(Money.splitEqual(1, 3), { me: 1, others: [0, 0, 0] });
});

test('splitEqual: non partecipo, resto ai primi', () => {
  assert.deepEqual(Money.splitEqual(1000, 3, false), { me: 0, others: [334, 333, 333] });
  assert.deepEqual(Money.splitEqual(3000, 1, false), { me: 0, others: [3000] });
});

test('splitEqual: la somma torna sempre al totale', () => {
  for (let total = 0; total <= 2000; total += 7) {
    for (let others = 0; others <= 6; others++) {
      for (const includeMe of [true, false]) {
        if (!includeMe && others === 0) continue;
        const r = Money.splitEqual(total, others, includeMe);
        assert.equal(r.me + Money.sum(r.others), total, `${total}/${others}/${includeMe}`);
        if (!includeMe) assert.equal(r.me, 0);
      }
    }
  }
});

test('splitEqual: input non validi', () => {
  assert.throws(() => Money.splitEqual(10.5, 1), RangeError);
  assert.throws(() => Money.splitEqual(-1, 1), RangeError);
  assert.throws(() => Money.splitEqual(100, 0, false), RangeError);
});

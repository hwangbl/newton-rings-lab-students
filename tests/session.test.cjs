const { test } = require("node:test");
const assert = require("node:assert/strict");
const session = require("../session-support.js");

function sampleTraining(count = 4) {
  const readings = Array.from({ length: count }, (_, i) =>
    Number(session.targetPosition(i).toFixed(3)),
  );
  return {
    ...session.freshTraining(),
    readings,
    position: readings.at(-1) || 13,
    zoom: 1.25,
  };
}
test("a failed save can retry the latest unsaved edits without changing other records", () => {
  const values = new Map(),
    statuses = [];
  let blocked = true;
  const persistence = session.createPersistence(
    () => ({
      getItem: (key) => values.get(key) ?? null,
      setItem(key, value) {
        if (blocked) throw Error("quota");
        values.set(key, value);
      },
    }),
    (key, saved) => statuses.push({ key, saved }),
  );
  assert.equal(persistence.save("data", { reading: 1 }), false);
  assert.equal(persistence.save("data", { reading: 2 }), false);
  blocked = false;
  assert.equal(persistence.retry("data"), true);
  assert.equal(values.get("data"), '{"reading":2}');
  assert.equal(values.has("progress"), false);
  assert.deepEqual(statuses.at(-1), { key: "data", saved: true });
});
test("unavailable storage and serialization failures are reported without throwing", () => {
  const statuses = [];
  const persistence = session.createPersistence(
    () => {
      throw Error("blocked");
    },
    (key, saved) => statuses.push(saved),
  );
  assert.equal(persistence.read("data"), null);
  assert.equal(persistence.save("data", {}), false);
  const cycle = {};
  cycle.self = cycle;
  assert.equal(persistence.save("data", cycle), false);
  assert.equal(persistence.retry("data"), false);
  assert.ok(statuses.every((saved) => saved === false));
});
test("undo history keeps exact values and nested metadata without retaining live references", () => {
  const history = session.createHistory(2),
    state = {
      readings: [1, 2],
      options: { delta: NaN },
      image: { source: "image" },
    };
  history.push(state);
  state.readings[0] = 99;
  state.image.source = "changed";
  const restored = history.pop();
  assert.deepEqual(restored.readings, [1, 2]);
  assert.ok(Number.isNaN(restored.options.delta));
  assert.equal(restored.image.source, "image");
  history.push({ n: 1 });
  history.push({ n: 2 });
  history.push({ n: 3 });
  assert.equal(history.size, 2);
  assert.equal(history.pop().n, 3);
  assert.equal(history.pop().n, 2);
  assert.equal(history.pop(), undefined);
  history.push({ n: 4 });
  history.clear();
  assert.equal(history.size, 0);
});
test("partial and completed training restore readings, position, zoom and valid pairs", () => {
  for (const count of [0, 4, 6, 12]) {
    const state = sampleTraining(count),
      restored = session.restoreTraining(JSON.stringify(state));
    assert.deepEqual(restored, state);
    assert.equal(session.trainingRows(restored).length, count === 12 ? 6 : 0);
  }
  const rows = session.trainingRows(sampleTraining(12));
  assert.deepEqual(
    rows.map((r) => r.k),
    [5, 10, 15, 20, 25, 30],
  );
  assert.ok(rows.every((row) => row.xR > row.xL));
});
test("refresh never clears a training invalidation or accepts a position behind recorded readings", () => {
  const state = sampleTraining();
  state.invalid = true;
  assert.equal(session.restoreTraining(JSON.stringify(state)).invalid, true);
  assert.deepEqual(session.trainingRows(state), []);
  state.invalid = false;
  state.position = 13;
  assert.equal(session.restoreTraining(JSON.stringify(state)).invalid, true);
});
test("malformed training versions, readings and coordinates are rejected", () => {
  for (const state of [
    null,
    [],
    {},
    { ...sampleTraining(), version: 2 },
    { ...sampleTraining(), zoom: 20 },
    { ...sampleTraining(), position: 30 },
    { ...sampleTraining(), invalid: "false" },
    { ...sampleTraining(), readings: [null] },
    { ...sampleTraining(), readings: [13] },
    { ...sampleTraining(), readings: Array(13).fill(20) },
  ])
    assert.equal(session.restoreTraining(JSON.stringify(state)), null);
  assert.equal(session.restoreTraining("{bad"), null);
});

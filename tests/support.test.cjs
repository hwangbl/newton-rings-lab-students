const { test } = require("node:test");
const assert = require("node:assert/strict");
const support = require("../release-support.js");
const rows = [
  { k: 5, xL: -2, xR: 2 },
  { k: 10, xL: -3, xR: 3 },
  { k: 15, xL: -4, xR: 4 },
];
const options = {
  lambdaNm: 632.8,
  deltaX: 0.005,
  uLambdaNm: 0.2,
  distribution: "paper",
  fitMode: "all",
  uncertaintyDigits: 1,
};
const results = {
  rows: rows.map((row) => ({ d: row.xR - row.xL, y: (row.xR - row.xL) ** 2 })),
};

test("numbers exclude whitespace, booleans, objects and infinities", () => {
  for (const value of [
    "",
    "  ",
    null,
    undefined,
    true,
    [],
    {},
    Infinity,
    "1e999",
  ])
    assert.equal(support.isNumeric(value), false);
  for (const value of [0, "0", -0.001, "2.5e-3"])
    assert.equal(support.isNumeric(value), true);
});
test("progress recovery accepts only known boolean flags", () => {
  for (const value of ["null", "true", "[]", '"broken"', "{"])
    assert.deepEqual(support.restoreProgress(value), {});
  assert.deepEqual(
    support.restoreProgress('{"principle":true,"quiz":"yes","unknown":true}'),
    { principle: true },
  );
});
test("damaged rows preserve valid readings and do not crash recovery", () => {
  const value = support.restoreData(
    JSON.stringify({
      rows: [null, rows[0], 42, { k: 10, xL: true, xR: " " }],
      origin: 17,
      imageMeta: "bad",
    }),
  );
  assert.deepEqual(value.rows, [
    { k: "", xL: "", xR: "" },
    rows[0],
    { k: "", xL: "", xR: "" },
    { k: 10, xL: "", xR: "" },
  ]);
  assert.equal(value.origin, "浏览器保存记录");
  assert.equal(value.imageMeta.source, "image");
  assert.equal(support.restoreData("{bad"), null);
  assert.equal(
    support.restoreData(JSON.stringify({ rows: Array(121).fill(rows[0]) })),
    null,
  );
});
test("blank saved uncertainty stays invalid instead of silently becoming zero", () => {
  const value = support.restoreData(
    JSON.stringify({ rows, options: { deltaX: null, uLambdaNm: null } }),
  );
  assert.ok(Number.isNaN(value.options.deltaX));
  assert.ok(Number.isNaN(value.options.uLambdaNm));
  assert.equal(value.options.lambdaNm, 589.3);
});
test("legacy CSV headers, delimiters, BOM and quoted values remain supported", () => {
  for (const delimiter of [",", "\t", ";"]) {
    assert.deepEqual(
      support.parseCsv(
        "\uFEFFk" +
          delimiter +
          "xL_mm" +
          delimiter +
          "xR_mm\r\n5" +
          delimiter +
          "-2" +
          delimiter +
          "2",
      ),
      [rows[0]],
    );
  }
  assert.deepEqual(support.parseCsv("5,-2,2\n10,-3,3"), rows.slice(0, 2));
  assert.deepEqual(support.parseCsv('环级次,左读数,右读数\n"5","-2","2"'), [
    rows[0],
  ]);
});
test("CSV rejects missing cells, invalid orders, zero diameter and overflow", () => {
  for (const csv of [
    "k,xL_mm,xR_mm\n5,,2",
    "5,-2",
    "1.5,0,2",
    "9007199254740992,0,2",
    "5,2,2",
    "5,-1e308,1e308",
    '"5,2,3',
  ])
    assert.throws(() => support.parseCsv(csv));
});
test("image CSV round trip preserves calibration, source and all calculation options", () => {
  const meta = {
    source: "image",
    image: '照片,"A"; test.png',
    mmPerPixel: 0.012,
  };
  const parsed = support.parseCsv(
    support.exportCsv(rows, results, options, meta, false),
  );
  assert.deepEqual(parsed, rows);
  assert.deepEqual(parsed.metadata.imageMeta, meta);
  assert.deepEqual(parsed.metadata.options, options);
  assert.equal(parsed.metadata.synthetic, false);
});
test("synthetic CSV never silently turns into experimental measurements", () => {
  const parsed = support.parseCsv(
    support.exportCsv(rows, results, options, null, true),
  );
  assert.equal(parsed.metadata.synthetic, true);
  assert.match(parsed.metadata.origin, /非实测/);
});
test("mixed or incomplete CSV metadata is rejected", () => {
  const csv = support.exportCsv(
    rows,
    results,
    options,
    { source: "image", image: "x.png", mmPerPixel: 0.01 },
    false,
  );
  assert.throws(
    () =>
      support.parseCsv(csv.replace('"image","x.png"', '"measurement","x.png"')),
    /不一致/,
  );
  assert.throws(
    () => support.parseCsv(csv.replace("source_kind", "unknown")),
    /不完整/,
  );
  assert.throws(
    () => support.parseCsv(csv.replaceAll('"0.01"', '"-1"')),
    /标定无效/,
  );
});
test("filenames are quoted and spreadsheet formula prefixes are escaped", () => {
  const csv = support.exportCsv(
    rows,
    results,
    options,
    { image: "=1+1.png", mmPerPixel: 0.01 },
    false,
  );
  assert.equal(support.parseCsv(csv).metadata.imageMeta.image, "'=1+1.png");
});
test("image parameter bounds prevent unbounded convolution work", () => {
  for (const [value, expected] of [
    ["1e100", 10],
    ["-10", 0.3],
    ["", 1.3],
    ["2", 2],
  ]) {
    const input = { value };
    assert.equal(support.boundedInput(input, 1.3, 0.3, 10), expected);
    assert.equal(input.value, String(expected));
  }
});

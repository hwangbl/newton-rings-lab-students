const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "test-results");
const baseline = process.env.BASELINE_REF;
let server, browser, base;
before(async () => {
  await fs.mkdir(output, { recursive: true });
  server = http.createServer(async (req, res) => {
    try {
      const relative =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        ).replace(/^\//, "") || "index.html";
      if (relative === "favicon.ico") {
        res.writeHead(204);
        res.end();
        return;
      }
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const content = baseline
        ? execFileSync("git", ["show", baseline + ":" + relative], {
            cwd: root,
            maxBuffer: 10 * 1024 * 1024,
          })
        : await fs.readFile(target);
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
        }[path.extname(target)] || "application/octet-stream",
      );
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    headless: true,
    ...(process.env.BROWSER_CHANNEL
      ? { channel: process.env.BROWSER_CHANNEL }
      : {}),
  });
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function pageFor(t, setup, viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport });
  if (setup) await context.addInitScript(setup);
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    try {
      if (!page.isClosed())
        await page.screenshot({
          path: path.join(
            output,
            t.name.replace(/[^a-zA-Z0-9-]/g, "_") + ".png",
          ),
          animations: "disabled",
          timeout: 5000,
        });
      assert.deepEqual(errors, [], "uncaught browser errors");
    } finally {
      await context.close();
    }
  });
  await page.goto(base);
  return page;
}
async function view(page, name) {
  await page.goto(base + "/#" + name);
  await page.locator("#view-" + name + ".active").waitFor();
}
async function download(page, selector) {
  const pending = page.waitForEvent("download");
  await page.locator(selector).click();
  const result = await pending;
  const destination = path.join(output, result.suggestedFilename());
  await result.saveAs(destination);
  return destination;
}
async function imageSample(page) {
  await view(page, "image");
  await page.locator("#imgExample").click();
  await page.waitForFunction(
    () =>
      document.querySelector("#imgRows input") &&
      !document.querySelector("#imgAuto").disabled,
  );
}

test("seven modules, assets, and numeric synthetic result work", async (t) => {
  const page = await pageFor(t);
  const failed = [];
  page.on("response", (response) => {
    if (response.status() >= 400) failed.push(response.url());
  });
  for (const name of [
    "overview",
    "principle",
    "instruments",
    "procedure",
    "data",
    "image",
    "quiz",
  ])
    await view(page, name);
  const result = await page.evaluate(() =>
    window.NewtonDataTest.calculate(window.NewtonDataTest.makeSynthetic()),
  );
  assert.ok(Math.abs(result.paired.rM - 3) < 0.002);
  assert.ok(Math.abs(result.ols.rM - 3) < 0.002);
  assert.ok(result.paired.uM > 0);
  assert.deepEqual(failed, []);
});
test("null or wrongly typed progress cannot prevent startup or marking progress", async (t) => {
  for (const value of ["null", "true", "[]", '"broken"', "{"]) {
    const context = await browser.newContext();
    try {
      await context.addInitScript(
        (value) => localStorage.setItem("newton-progress", value),
        value,
      );
      const page = await context.newPage();
      page.setDefaultTimeout(2500);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(base + "/#principle");
      await page.locator("#view-principle.active").waitFor();
      await page.locator('[data-done="principle"]').click();
      assert.equal(await page.locator("#progressText").innerText(), "1 / 5");
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  }
});
test("damaged saved rows preserve valid readings and module initialization", async (t) => {
  const page = await pageFor(t, () =>
    localStorage.setItem(
      "newton-data",
      JSON.stringify({
        rows: [null, { k: 5, xL: 12.125, xR: 16.125 }],
        origin: 42,
        options: { fitMode: "all" },
      }),
    ),
  );
  await view(page, "data");
  assert.equal(
    await page.locator('[data-index="1"][data-col="xL"]').inputValue(),
    "12.125",
  );
  assert.equal(
    await page.locator('[data-index="0"][data-col="xL"]').inputValue(),
    "",
  );
  await page.locator('[data-index="0"][data-col="xL"]').fill("10");
  await view(page, "image");
  assert.equal(await page.locator("#imgExample").count(), 1);
});
test("blank uncertainty remains invalid after reload", async (t) => {
  const page = await pageFor(t);
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  await page.locator("#dataDelta").fill("");
  await page.reload();
  assert.match(await page.locator("#dataErrors").innerText(), /误差限/);
  assert.equal(await page.locator("#dataDelta").inputValue(), "");
});
test("complete twelve-position training transfers six pairs with R about 3 m", async (t) => {
  const page = await pageFor(t);
  await view(page, "procedure");
  for (let i = 0; i < 12; i++) {
    await page.locator("#showHint").click();
    await page.locator("#recordReading").click();
  }
  assert.equal(
    await page.locator("#trainingCount").innerText(),
    "已记录 12 / 12",
  );
  await page.locator("#sendToData").click();
  await page.locator("#view-data.active").waitFor();
  const result = await page.evaluate(() =>
    window.NewtonDataTest.calculate(window.newtonTrainingData),
  );
  assert.equal(result.completeRows.length, 6);
  assert.ok(Math.abs(result.paired.rM - 3) < 0.002);
  assert.match(await page.locator("#dataOrigin").innerText(), /模拟数据/);
});
test("reverse movement invalidates a training set and reset recovers", async (t) => {
  const page = await pageFor(t);
  await view(page, "procedure");
  await page.locator("#showHint").click();
  await page.locator("#recordReading").click();
  await page.locator("#moveBack").click();
  assert.equal(await page.locator("#recordReading").isDisabled(), true);
  assert.match(await page.locator("#measureFeedback").innerText(), /反向移动/);
  await page.locator("#resetTraining").click();
  assert.equal(await page.locator("#recordReading").isDisabled(), false);
  assert.equal(
    await page.locator("#trainingCount").innerText(),
    "已记录 0 / 12",
  );
});
test("synthetic CSV retains source and options and both chart exports work", async (t) => {
  const page = await pageFor(t);
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  await page.locator("#dataLambda").fill("632.8");
  await page.locator("#dataFitMode").selectOption("all");
  const csv = await download(page, '[data-action="export"]');
  await page.locator('[data-action="clear"]').click();
  await page.locator("#dataLambda").fill("500");
  await page.locator("#dataFile").setInputFiles(csv);
  await page.waitForFunction(() =>
    document.querySelector("#dataStatus").textContent.includes("已导入"),
  );
  assert.match(await page.locator("#dataOrigin").innerText(), /模拟/);
  assert.equal(await page.locator("#dataLambda").inputValue(), "632.8");
  assert.equal(await page.locator("#dataFitMode").inputValue(), "all");
  const svg = await fs.readFile(
    await download(page, '[data-action="chart-svg"]'),
    "utf8",
  );
  assert.match(svg, /<svg/);
  assert.match(svg, /拟合/);
  const png = await fs.readFile(
    await download(page, '[data-action="chart-png"]'),
  );
  assert.equal(png.readUInt32BE(16), 2700);
  assert.equal(png.readUInt32BE(20), 1950);
});
test("image CSV retains calibration and keeps independent-reading uncertainty disabled", async (t) => {
  const page = await pageFor(t);
  await imageSample(page);
  await page.locator("#imgScale").fill("0.01");
  assert.ok((await page.locator("#imgRows tr").count()) >= 3);
  await page.locator("#imgSend").click();
  await page.locator("#view-data.active").waitFor();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("newton-data")),
  );
  const csv = await download(page, '[data-action="export"]');
  await page.locator('[data-action="synthetic"]').click();
  await page.locator("#dataFile").setInputFiles(csv);
  await page.waitForFunction(() =>
    document.querySelector("#dataStatus").textContent.includes("已导入"),
  );
  assert.equal(await page.locator("#dataDelta").isDisabled(), true);
  assert.match(await page.locator("#dataOrigin").innerText(), /影像/);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("newton-data")),
  );
  assert.deepEqual(after.rows, before.rows);
  assert.deepEqual(after.imageMeta, before.imageMeta);
  const report = JSON.parse(
    await fs.readFile(await download(page, '[data-action="report"]'), "utf8"),
  );
  assert.equal(report.uncertaintyApplicable, false);
  assert.equal(report.ols.uM, null);
});
test("image parameter maxima are enforced before expensive filtering", async (t) => {
  const page = await pageFor(t);
  await imageSample(page);
  await page.locator("#imgSmoothing").fill("11");
  await page.locator("#imgDistance").fill("101");
  await page.locator("#imgProminence").fill("101");
  await page.locator("#imgDetect").click();
  assert.equal(await page.locator("#imgSmoothing").inputValue(), "10");
  assert.equal(await page.locator("#imgDistance").inputValue(), "100");
  assert.equal(await page.locator("#imgProminence").inputValue(), "100");
});
test("small image rejection releases blob URLs and the same file can be selected again", async (t) => {
  const page = await pageFor(t, () => {
    window.created = [];
    window.revoked = [];
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      const url = create(value);
      window.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      window.revoked.push(url);
      revoke(url);
    };
  });
  await view(page, "image");
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  for (let i = 1; i <= 2; i++) {
    await page
      .locator("#imgFile")
      .setInputFiles({ name: "small.png", mimeType: "image/png", buffer });
    await page.waitForFunction((count) => window.revoked.length === count, i);
    assert.match(await page.locator("#imgStatus").innerText(), /太小/);
  }
  assert.deepEqual(
    await page.evaluate(() => window.revoked),
    await page.evaluate(() => window.created),
  );
});
test("latest image selection wins over a slower previous decode", async (t) => {
  const page = await pageFor(t, () => {
    const NativeImage = window.Image;
    const src = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    );
    let count = 0;
    window.Image = class extends NativeImage {
      set src(value) {
        if (String(value).startsWith("blob:") && ++count === 1)
          setTimeout(() => src.set.call(this, value), 500);
        else src.set.call(this, value);
      }
      get src() {
        return src.get.call(this);
      }
    };
  });
  await view(page, "image");
  const buffer = Buffer.from(
    await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 128;
      const x = c.getContext("2d");
      x.fillStyle = "white";
      x.fillRect(0, 0, 128, 128);
      for (let r = 10; r < 60; r += 10) {
        x.beginPath();
        x.arc(64, 64, r, 0, 2 * Math.PI);
        x.stroke();
      }
      return c.toDataURL().split(",")[1];
    }),
    "base64",
  );
  await page
    .locator("#imgFile")
    .setInputFiles({ name: "first.png", mimeType: "image/png", buffer });
  await page
    .locator("#imgFile")
    .setInputFiles({ name: "second.png", mimeType: "image/png", buffer });
  await page.waitForFunction(() =>
    document.querySelector("#imgFileInfo").textContent.includes("second.png"),
  );
  await page.waitForTimeout(800);
  assert.match(await page.locator("#imgFileInfo").innerText(), /second\.png/);
});
test("all views fit mobile and desktop widths, including loaded data", async (t) => {
  const page = await pageFor(t);
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of [
      "overview",
      "principle",
      "instruments",
      "procedure",
      "data",
      "image",
      "quiz",
    ]) {
      await view(page, name);
      const sizes = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        sizes.scroll <= sizes.width + 1,
        `${name} overflows at ${width}px: ${sizes.scroll}`,
      );
    }
  }
  await view(page, "overview");
  await page.screenshot({
    path: path.join(output, "desktop-overview.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await view(page, "data");
  await page.screenshot({
    path: path.join(output, "mobile-data.png"),
    fullPage: true,
    animations: "disabled",
  });
});
test("quiz and study progress survive refresh", async (t) => {
  const page = await pageFor(t);
  await view(page, "quiz");
  const answers = [0, 1, 1, 2, 1, 1, 1, 2];
  for (let i = 0; i < answers.length; i++)
    await page.locator(`input[name="q${i}"]`).nth(answers[i]).check();
  await page.locator("#submitQuiz").click();
  assert.match(await page.locator("#quizScore").innerText(), /答对 8 \/ 8/);
  await page.reload();
  assert.equal(await page.locator("#progressText").innerText(), "1 / 5");
});
test("published files also work directly through file://", async (t) => {
  const page = await pageFor(t);
  await page.goto(pathToFileURL(path.join(root, "index.html")).href + "#data");
  await page.locator('[data-action="synthetic"]').click();
  assert.match(await page.locator("#dataResults").innerText(), /3\.00/);
});
test("legacy CSV remains compatible and explicitly warns about missing source metadata", async (t) => {
  const page = await pageFor(t);
  await view(page, "data");
  await page.locator("#dataFile").setInputFiles({
    name: "legacy.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("k,xL_mm,xR_mm\n20,0,10\n25,0,12\n30,0,14"),
  });
  await page.waitForFunction(() =>
    document.querySelector("#dataStatus").textContent.includes("已导入"),
  );
  assert.equal(await page.locator("#dataBody tr").count(), 3);
  assert.match(await page.locator("#dataStatus").innerText(), /未包含来源信息/);
});
test("unavailable localStorage does not block learning or data calculations", async (t) => {
  const page = await pageFor(t, () =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    }),
  );
  await view(page, "principle");
  await page.locator('[data-done="principle"]').click();
  assert.equal(await page.locator("#progressText").innerText(), "1 / 5");
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  assert.match(await page.locator("#dataResults").innerText(), /3\.00/);
});

test("training resumes a partial group and continues with the next target after reload", async (t) => {
  const page = await pageFor(t);
  await view(page, "procedure");
  for (let i = 0; i < 4; i++) {
    await page.locator("#showHint").click();
    await page.locator("#recordReading").click();
  }
  await page.locator("#measureZoomIn").click();
  await page.locator("#moveNext").click();
  const reading = await page.locator("#measureReading").innerText();
  await page.reload();
  assert.equal(
    await page.locator("#trainingCount").innerText(),
    "已记录 4 / 12",
  );
  assert.equal(await page.locator("#measureReading").innerText(), reading);
  assert.match(await page.locator("#measureZoomValue").innerText(), /^1\.25/);
  assert.match(await page.locator("#measureTarget").innerText(), /第 10 暗环/);
  for (let i = 4; i < 12; i++) {
    await page.locator("#showHint").click();
    await page.locator("#recordReading").click();
  }
  await page.locator("#sendToData").click();
  await page.locator("#view-data.active").waitFor();
  const result = await page.evaluate(() =>
    window.NewtonDataTest.calculate(window.newtonTrainingData),
  );
  assert.ok(Math.abs(result.paired.rM - 3) < 0.002);
});
test("invalid training stays invalid across refresh and undo restart", async (t) => {
  const page = await pageFor(t);
  await view(page, "procedure");
  await page.locator("#showHint").click();
  await page.locator("#recordReading").click();
  await page.locator("#moveBack").click();
  await page.reload();
  assert.equal(await page.locator("#recordReading").isDisabled(), true);
  assert.match(await page.locator("#measureFeedback").innerText(), /失效/);
  await page.locator("#resetTraining").click();
  assert.equal(await page.locator("#recordReading").isDisabled(), false);
  await page.locator("#undoTrainingReset").click();
  assert.equal(await page.locator("#recordReading").isDisabled(), true);
  assert.equal(
    await page.locator("#trainingCount").innerText(),
    "已记录 1 / 12",
  );
  await page.reload();
  assert.equal(await page.locator("#recordReading").isDisabled(), true);
});
test("undo restart restores valid readings but expires after new training input", async (t) => {
  const page = await pageFor(t);
  await view(page, "procedure");
  await page.locator("#showHint").click();
  await page.locator("#recordReading").click();
  const reading = await page.locator("#measureReading").innerText();
  await page.locator("#resetTraining").click();
  await page.locator("#undoTrainingReset").click();
  assert.equal(
    await page.locator("#trainingCount").innerText(),
    "已记录 1 / 12",
  );
  assert.equal(await page.locator("#measureReading").innerText(), reading);
  await page.locator("#resetTraining").click();
  await page.locator("#moveNext").click();
  assert.equal(await page.locator("#undoTrainingReset").isDisabled(), true);
});
test("completed restored training does not replace saved experimental data until explicit transfer", async (t) => {
  const page = await pageFor(t);
  await view(page, "procedure");
  for (let i = 0; i < 12; i++) {
    await page.locator("#showHint").click();
    await page.locator("#recordReading").click();
  }
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  await page.locator("#dataLambda").fill("632.8");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("newton-data")),
  );
  await page.reload();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("newton-data"))),
    saved,
  );
  assert.equal(await page.locator("#dataLambda").inputValue(), "632.8");
  await page.locator('[data-action="training"]').click();
  assert.match(await page.locator("#dataOrigin").innerText(), /操作训练记录/);
});
test("consecutive row deletions and clear can be undone with exact source and parameters", async (t) => {
  const page = await pageFor(t);
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  await page.locator("#dataLambda").fill("632.8");
  const original = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("newton-data")),
  );
  await page.locator('[data-remove="0"]').click();
  await page.locator('[data-remove="0"]').click();
  assert.equal(await page.locator("#dataBody tr").count(), 4);
  await page.locator("#dataUndo").click();
  await page.locator("#dataUndo").click();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("newton-data"))),
    original,
  );
  await page.locator('[data-action="clear"]').click();
  await page.locator("#dataUndo").click();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("newton-data"))),
    original,
  );
  await page.reload();
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("newton-data"))),
    original,
  );
});
test("undoing clear preserves image metadata and the independent uncertainty model stays disabled", async (t) => {
  const page = await pageFor(t);
  await imageSample(page);
  await page.locator("#imgScale").fill("0.01");
  await page.locator("#imgSend").click();
  await page.locator("#view-data.active").waitFor();
  const original = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("newton-data")),
  );
  await page.locator('[data-action="clear"]').click();
  assert.equal(await page.locator("#dataDelta").isDisabled(), false);
  await page.locator("#dataUndo").click();
  assert.equal(await page.locator("#dataDelta").isDisabled(), true);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem("newton-data"))),
    original,
  );
});
test("subsequent edits invalidate destructive undo instead of replacing newer readings", async (t) => {
  const page = await pageFor(t);
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  await page.locator('[data-remove="0"]').click();
  await page.locator('[data-index="0"][data-col="xL"]').fill("123.456");
  assert.equal(await page.locator("#dataUndo").isDisabled(), true);
  assert.equal(
    await page.locator('[data-index="0"][data-col="xL"]').inputValue(),
    "123.456",
  );
});
test("progress reset can be undone and the restored marks persist", async (t) => {
  const page = await pageFor(t);
  await view(page, "principle");
  await page.locator('[data-done="principle"]').click();
  await page.locator("#resetProgress").click();
  assert.equal(await page.locator("#progressText").innerText(), "0 / 5");
  await page.locator("#undoProgress").click();
  assert.equal(await page.locator("#progressText").innerText(), "1 / 5");
  await page.reload();
  assert.equal(await page.locator("#progressText").innerText(), "1 / 5");
});
test("storage failure is visible and retry saves the latest data without claiming other records saved", async (t) => {
  const page = await pageFor(t, () => {
    window.blockWrites = true;
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (window.blockWrites)
        throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await view(page, "data");
  await page.locator('[data-action="synthetic"]').click();
  await page.locator("#dataLambda").fill("632.8");
  assert.equal(
    await page.locator("#dataSaveStatus").getAttribute("data-state"),
    "error",
  );
  assert.match(await page.locator("#dataSaveStatus").innerText(), /未保存/);
  const csv = await download(
    page,
    '#dataSaveTools [data-action="export-backup"]',
  );
  assert.match(await fs.readFile(csv, "utf8"), /632\.8/);
  await page.evaluate(() => {
    window.blockWrites = false;
  });
  await page.locator('[data-retry-storage="newton-data"]').click();
  assert.equal(
    await page.locator("#dataSaveStatus").getAttribute("data-state"),
    "saved",
  );
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("newton-data")).options.lambdaNm,
    ),
    632.8,
  );
  assert.equal(
    await page.locator("#progressSaveStatus").getAttribute("data-state"),
    "error",
  );
  await page.screenshot({
    path: path.join(output, "data-save-recovered.png"),
    animations: "disabled",
  });
});
test("training save failure offers export of partial invalid readings and independent retry", async (t) => {
  const page = await pageFor(t, () => {
    window.blockTraining = true;
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "newton-training" && window.blockTraining)
        throw new DOMException("quota", "QuotaExceededError");
      return write.call(this, key, value);
    };
  });
  await view(page, "procedure");
  await page.locator("#showHint").click();
  await page.locator("#recordReading").click();
  await page.locator("#moveBack").click();
  assert.equal(
    await page.locator("#trainingSaveStatus").getAttribute("data-state"),
    "error",
  );
  const csv = await fs.readFile(
    await download(page, "#exportTraining"),
    "utf8",
  );
  assert.match(csv, /left,30,/);
  assert.match(csv, /,true,/);
  await page.evaluate(() => {
    window.blockTraining = false;
  });
  await page.locator('[data-retry-storage="newton-training"]').click();
  assert.equal(
    await page.locator("#trainingSaveStatus").getAttribute("data-state"),
    "saved",
  );
  await page.reload();
  assert.equal(await page.locator("#recordReading").isDisabled(), true);
});

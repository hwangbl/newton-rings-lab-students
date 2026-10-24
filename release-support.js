/* Public-release compatibility helpers. No private teaching sources are included. */
(function (root) {
  "use strict";

  const isObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const isNumeric = (value) =>
    (typeof value === "number" || typeof value === "string") &&
    String(value).trim() !== "" &&
    Number.isFinite(Number(value));
  const cell = (value) => (isNumeric(value) ? value : "");
  const optionDefaults = Object.freeze({
    lambdaNm: 589.3,
    deltaX: 0.01,
    uLambdaNm: 0,
    distribution: "rectangular",
    fitMode: "rubric",
    uncertaintyDigits: 2,
  });

  function normalizeOptions(value) {
    const result = { ...optionDefaults };
    if (!isObject(value)) return result;
    for (const key of ["lambdaNm", "deltaX", "uLambdaNm"]) {
      if (Object.hasOwn(value, key))
        result[key] = isNumeric(value[key]) ? Number(value[key]) : NaN;
    }
    result.distribution =
      value.distribution === "paper" ? "paper" : "rectangular";
    result.fitMode = value.fitMode === "all" ? "all" : "rubric";
    result.uncertaintyDigits = Number(value.uncertaintyDigits) === 1 ? 1 : 2;
    return result;
  }

  function restoreProgress(text) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return {};
    }
    if (!isObject(value)) return {};
    return Object.fromEntries(
      ["principle", "instruments", "procedure", "data", "quiz"]
        .filter((key) => value[key] === true)
        .map((key) => [key, true]),
    );
  }

  function restoreData(text) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return null;
    }
    if (
      !isObject(value) ||
      !Array.isArray(value.rows) ||
      value.rows.length > 120
    )
      return null;
    // Keep valid readings and row positions, even if another saved row is damaged.
    const rows = value.rows.map((row) => ({
      k: cell(row?.k),
      xL: cell(row?.xL),
      xR: cell(row?.xR),
    }));
    // A damaged image descriptor must never re-enable the independent-endpoint model.
    const imageMeta = value.imageMeta
      ? {
          source: "image",
          image:
            typeof value.imageMeta.image === "string"
              ? value.imageMeta.image
              : "保存的影像数据",
          mmPerPixel:
            isNumeric(value.imageMeta.mmPerPixel) &&
            Number(value.imageMeta.mmPerPixel) > 0
              ? Number(value.imageMeta.mmPerPixel)
              : null,
        }
      : null;
    return {
      rows,
      origin:
        typeof value.origin === "string" ? value.origin : "浏览器保存记录",
      synthetic: value.synthetic === true,
      imageMeta,
      options: normalizeOptions(value.options),
    };
  }

  function csvRecords(text) {
    const records = [];
    let row = [],
      field = "",
      quoted = false;
    text = String(text).replace(/^\uFEFF/, "");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (quoted && text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = !quoted;
      } else if (!quoted && [",", "\t", ";"].includes(ch)) {
        row.push(field.trim());
        field = "";
      } else if (!quoted && (ch === "\r" || ch === "\n")) {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field.trim());
        if (row.some((value) => value !== "")) records.push(row);
        row = [];
        field = "";
      } else field += ch;
    }
    if (quoted) throw Error("CSV 引号未闭合。");
    row.push(field.trim());
    if (row.some((value) => value !== "")) records.push(row);
    if (!records.length) throw Error("CSV 没有数据。");
    return records;
  }

  const metadataHeaders = [
    "source_kind",
    "source_image",
    "mm_per_pixel",
    "lambda_nm",
    "delta_x_mm",
    "u_lambda_nm",
    "distribution",
    "fit_mode",
    "uncertainty_digits",
  ];

  function parseCsv(text) {
    const records = csvRecords(text);
    const header = records[0].map((value) =>
      value.toLowerCase().replace(/\s/g, ""),
    );
    let columns = [
      ["k", "环级次", "级次", "环数"],
      ["xl", "xl_mm", "x_l", "左", "左/mm", "左读数"],
      ["xr", "xr_mm", "x_r", "右", "右/mm", "右读数"],
    ].map((names) => header.findIndex((value) => names.includes(value)));
    const hasHeader = columns.every((index) => index >= 0);
    if (!hasHeader) {
      if (records[0].length >= 3 && records[0].slice(0, 3).every(isNumeric))
        columns = [0, 1, 2];
      else throw Error("表头请使用 k,xL_mm,xR_mm，或直接填写三列数字。");
    }
    const body = records.slice(hasHeader ? 1 : 0);
    if (!body.length || body.length > 120) throw Error("请导入 1–120 行读数。");
    const rows = body.map((row, index) => {
      const values = columns.map((column) => row[column]);
      const line = index + (hasHeader ? 2 : 1);
      if (!values.every(isNumeric))
        throw Error(`CSV 第 ${line} 行包含空值或非数字。`);
      const [k, xL, xR] = values.map(Number);
      if (!Number.isSafeInteger(k) || k < 0)
        throw Error(`CSV 第 ${line} 行级次不是非负安全整数。`);
      if (xL === xR || !Number.isFinite((xR - xL) ** 2))
        throw Error(`CSV 第 ${line} 行直径为 0 或超出有效范围。`);
      return { k, xL, xR };
    });
    if (hasHeader && metadataHeaders.some((name) => header.includes(name))) {
      if (
        !metadataHeaders.every(
          (name) => header.filter((value) => value === name).length === 1,
        )
      )
        throw Error("CSV 来源信息不完整，请保留全部来源与实验参数列。");
      const metadataRows = body.map((row) =>
        metadataHeaders.map((name) => row[header.indexOf(name)]),
      );
      const values = metadataRows[0];
      if (
        metadataRows.some((row) => row.some((value, i) => value !== values[i]))
      )
        throw Error("CSV 中的来源或实验参数不一致，请分批导入。");
      const [
        kind,
        imageName,
        scale,
        lambda,
        delta,
        uLambda,
        distribution,
        fitMode,
        digits,
      ] = values;
      if (!["image", "synthetic", "measurement"].includes(kind))
        throw Error("CSV 数据来源标记无效。");
      if (
        ![lambda, delta, uLambda].every(isNumeric) ||
        +lambda <= 0 ||
        +delta < 0 ||
        +uLambda < 0 ||
        !["paper", "rectangular"].includes(distribution) ||
        !["all", "rubric"].includes(fitMode) ||
        !["1", "2"].includes(digits)
      )
        throw Error("CSV 实验参数无效，请先检查波长和不确定度设置。");
      if (kind === "image" && (!isNumeric(scale) || +scale <= 0))
        throw Error("CSV 影像标定无效。");
      const imageMeta =
        kind === "image"
          ? { source: "image", image: imageName, mmPerPixel: +scale }
          : null;
      Object.defineProperty(rows, "metadata", {
        value: {
          imageMeta,
          synthetic: kind === "synthetic",
          origin:
            kind === "image"
              ? "影像提取 · " + imageName
              : kind === "synthetic"
                ? "CSV 导入 · 模拟数据，非实测"
                : "CSV 导入 · 来源由使用者确认",
          options: {
            lambdaNm: +lambda,
            deltaX: +delta,
            uLambdaNm: +uLambda,
            distribution,
            fitMode,
            uncertaintyDigits: +digits,
          },
        },
      });
    }
    return rows;
  }

  function exportCsv(rows, result, options, imageMeta, synthetic) {
    const quote = (value) =>
      '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const numeric = (value) => (isNumeric(value) ? value : "");
    // Escape a user-controlled filename when the CSV is opened in a spreadsheet.
    const imageName = String(imageMeta?.image || "").replace(
      /^([=+@-])/,
      "'$1",
    );
    const metadata = [
      imageMeta ? "image" : synthetic ? "synthetic" : "measurement",
      imageName,
      imageMeta?.mmPerPixel ?? "",
      numeric(options.lambdaNm),
      numeric(options.deltaX),
      numeric(options.uLambdaNm),
      options.distribution,
      options.fitMode,
      options.uncertaintyDigits,
    ];
    const body = rows.map((row, i) => [
      row.k,
      row.xL,
      row.xR,
      numeric(result.rows[i].d),
      numeric(result.rows[i].y),
      ...metadata,
    ]);
    return (
      "\uFEFF" +
      [["k", "xL_mm", "xR_mm", "D_mm", "D2_mm2", ...metadataHeaders], ...body]
        .map((row) => row.map(quote).join(","))
        .join("\r\n")
    );
  }

  function boundedInput(input, fallback, min, max) {
    const value = isNumeric(input.value) ? Number(input.value) : fallback;
    const bounded = Math.min(max, Math.max(min, value));
    input.value = String(bounded);
    return bounded;
  }

  const api = Object.freeze({
    isNumeric,
    normalizeOptions,
    restoreProgress,
    restoreData,
    parseCsv,
    exportCsv,
    boundedInput,
  });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NewtonReleaseSupport = api;
})(globalThis);

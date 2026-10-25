/* Session persistence and recovery for the public student release. */
(function (root) {
  "use strict";

  function createPersistence(getStorage, onStatus = () => {}) {
    const pending = new Map();
    return {
      read(key) {
        try {
          return getStorage().getItem(key);
        } catch {
          onStatus(key, false);
          return null;
        }
      },
      save(key, value) {
        try {
          pending.set(key, JSON.stringify(value));
        } catch {
          pending.delete(key);
          onStatus(key, false);
          return false;
        }
        return this.retry(key);
      },
      retry(key) {
        if (!pending.has(key)) return false;
        try {
          getStorage().setItem(key, pending.get(key));
          onStatus(key, true);
          return true;
        } catch {
          onStatus(key, false);
          return false;
        }
      },
    };
  }

  function createHistory(limit = 20) {
    const history = [];
    return {
      push(snapshot) {
        history.push(structuredClone(snapshot));
        if (history.length > limit) history.shift();
      },
      pop() {
        return history.pop();
      },
      clear() {
        history.length = 0;
      },
      get size() {
        return history.length;
      },
    };
  }

  const orders = Object.freeze([30, 25, 20, 15, 10, 5, 5, 10, 15, 20, 25, 30]);
  const targetPosition = (index) =>
    21 + (index < 6 ? -1 : 1) * Math.sqrt(orders[index] * 3000 * 0.0005893);
  const freshTraining = () => ({
    version: 1,
    readings: [],
    invalid: false,
    position: 13,
    zoom: 1,
  });

  function restoreTraining(text) {
    let saved;
    try {
      saved = JSON.parse(text);
    } catch {
      return null;
    }
    if (
      !saved ||
      saved.version !== 1 ||
      !Array.isArray(saved.readings) ||
      saved.readings.length > 12 ||
      typeof saved.invalid !== "boolean" ||
      !Number.isFinite(saved.position) ||
      saved.position < 13 ||
      saved.position > 29 ||
      !Number.isFinite(saved.zoom) ||
      saved.zoom < 0.5 ||
      saved.zoom > 8
    )
      return null;
    if (
      saved.readings.some(
        (value, index) =>
          !Number.isFinite(value) ||
          Math.abs(value - targetPosition(index)) > 0.018000001 ||
          (index > 0 && value <= saved.readings[index - 1]),
      )
    )
      return null;
    // Never make an invalid group usable merely by refreshing the page.
    const invalid =
      saved.invalid ||
      (saved.readings.length > 0 &&
        saved.position < saved.readings.at(-1) - 0.0005);
    return {
      version: 1,
      readings: [...saved.readings],
      invalid,
      position: saved.position,
      zoom: saved.zoom,
    };
  }

  function trainingRows(state) {
    if (state.invalid || state.readings.length !== 12) return [];
    return [5, 10, 15, 20, 25, 30].map((k) => ({
      k,
      xL: state.readings[orders.slice(0, 6).indexOf(k)],
      xR: state.readings[6 + orders.slice(6).indexOf(k)],
    }));
  }

  const api = {
    createPersistence,
    createHistory,
    restoreTraining,
    freshTraining,
    targetPosition,
    trainingRows,
  };
  if (typeof module === "object" && module.exports) {
    module.exports = api;
    return;
  }

  const get = (id) => document.getElementById(id);
  const labels = {
    "newton-data": ["data", "实验读数"],
    "newton-progress": ["progress", "学习标记"],
    "newton-training": ["training", "训练记录"],
  };
  const storage = createPersistence(
    () => root.localStorage,
    (key, success) => {
      const [prefix, label] = labels[key] || [];
      const status = get(prefix + "SaveStatus");
      if (!status) return;
      const text = success
        ? label + "已保存到当前浏览器。"
        : label +
          "未保存，刷新可能丢失。" +
          (prefix === "progress" ? "请重试。" : "请重试或导出读数。");
      if (status.textContent !== text) status.textContent = text;
      status.dataset.state = success ? "saved" : "error";
      const tools = get(prefix + "SaveTools");
      if (tools) tools.hidden = success;
    },
  );
  document.addEventListener("click", (event) => {
    const retry = event.target.closest("[data-retry-storage]");
    if (retry) storage.retry(retry.dataset.retryStorage);
  });

  function initTraining(drawRings, toast) {
    const savedText = storage.read("newton-training");
    const restored = restoreTraining(savedText);
    let state = restored || freshTraining();
    const undoReset = createHistory(1);
    function feedback(text, error = false) {
      get("measureFeedback").textContent = text;
      get("measureFeedback").className =
        "feedback " + (error ? "error" : "success");
    }
    function clearUndo() {
      undoReset.clear();
      get("undoTrainingReset").disabled = true;
    }
    function save() {
      storage.save("newton-training", state);
    }
    function render() {
      get("measurePosition").value = state.position;
      drawRings(get("measureCanvas"), 3000, 589.3, 0, {
        extent: 16 / state.zoom,
        offset: 21 - state.position,
        cross: true,
      });
      get("measureReading").textContent = state.position.toFixed(3);
      get("measureZoomValue").textContent =
        state.zoom.toFixed(2) +
        "× · 短边视场 " +
        (16 / state.zoom).toFixed(2) +
        " mm";
    }
    function update() {
      const count = state.readings.length;
      get("measureTarget").textContent =
        count < 12
          ? (count < 6 ? "左侧" : "右侧") + " · 第 " + orders[count] + " 暗环"
          : "测量完成";
      get("trainingCount").textContent = `已记录 ${count} / 12`;
      get("recordReading").disabled = get("showHint").disabled =
        count === 12 || state.invalid;
      get("sendToData").disabled = count !== 12 || state.invalid;
      get("exportTraining").disabled = count === 0;
      get("undoTrainingReset").disabled = undoReset.size === 0;
      get("trainingLog").replaceChildren(
        ...state.readings.map((value, index) => {
          const span = document.createElement("span");
          span.textContent = `${index < 6 ? "左" : "右"} ${orders[index]}：${value.toFixed(3)}`;
          return span;
        }),
      );
      // An explicit transfer is required; restored training must not replace saved experimental data.
      root.newtonTrainingData = undefined;
      save();
    }
    function move(position) {
      clearUndo();
      position = Math.min(29, Math.max(13, position));
      if (state.readings.length && position < state.position - 0.0005) {
        state.invalid = true;
        feedback(
          "检测到反向移动：本组读数失效，请点击“重新开始”消除空程影响。",
          true,
        );
      }
      state.position = position;
      update();
      render();
    }
    function zoom(value) {
      clearUndo();
      state.zoom = Math.min(8, Math.max(0.5, value));
      save();
      render();
    }
    get("measurePosition").oninput = (event) =>
      move(Number(event.target.value));
    get("moveBack").onclick = () => move(state.position - 0.01);
    get("moveNext").onclick = () => move(state.position + 0.01);
    get("measureZoomIn").onclick = () => zoom(state.zoom * 1.25);
    get("measureZoomOut").onclick = () => zoom(state.zoom / 1.25);
    get("measureZoomReset").onclick = () => zoom(1);
    get("measureCanvas").addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        zoom(state.zoom * Math.exp(-event.deltaY * 0.001));
      },
      { passive: false },
    );
    get("showHint").onclick = () => {
      if (state.invalid || state.readings.length === 12) return;
      const target = targetPosition(state.readings.length);
      if (state.readings.length && target < state.position - 0.0005) {
        feedback("已越过目标环；不能反转找回，请重新开始本组。", true);
        return;
      }
      move(Number(target.toFixed(3)));
      feedback("已定位目标暗纹切线。观察叉丝位置后点击“记录当前读数”。");
    };
    get("recordReading").onclick = () => {
      if (state.invalid || state.readings.length === 12) return;
      if (
        Math.abs(state.position - targetPosition(state.readings.length)) > 0.018
      ) {
        feedback(
          "当前叉丝尚未对准目标暗纹切线，请缓慢移动或查看定位提示。",
          true,
        );
        return;
      }
      clearUndo();
      state.readings.push(state.position);
      update();
      feedback(
        state.readings.length === 12
          ? "12 个位置已记录。可以送入数据处理，核对直径与 R。"
          : "读数已记录。沿相同方向移动到下一目标环。",
      );
    };
    get("resetTraining").onclick = () => {
      undoReset.push(state);
      state = { ...freshTraining(), zoom: state.zoom };
      update();
      render();
      feedback("已重启。从左外侧进入第 30 环。误操作可点击“撤销重新开始”。");
    };
    get("undoTrainingReset").onclick = () => {
      const previous = undoReset.pop();
      if (!previous) return;
      state = previous;
      update();
      render();
      feedback(
        state.invalid
          ? "已恢复上组训练；该组因反向移动失效，仍需重新开始。"
          : `已撤销重启，恢复 ${state.readings.length} 个已读位置。`,
        state.invalid,
      );
    };
    root.getNewtonTrainingData = () => trainingRows(state);
    get("sendToData").onclick = () => {
      const rows = trainingRows(state);
      if (!rows.length) return;
      root.newtonTrainingData = rows;
      root.loadTrainingData?.(rows);
      location.hash = "data";
      toast("已送入 6 组模拟读数，已明确标注为训练数据。");
    };
    get("exportTraining").onclick = () => {
      const rows = state.readings.map((value, index) => [
        index < 6 ? "left" : "right",
        orders[index],
        value.toFixed(3),
        state.invalid,
        state.position,
        state.zoom,
      ]);
      const csv =
        "\uFEFFside,k,position_mm,group_invalid,current_position_mm,zoom\r\n" +
        rows.map((row) => row.join(",")).join("\r\n");
      const url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "牛顿环_训练已读位置_模拟非实测.csv";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    update();
    render();
    if (restored)
      feedback(
        state.invalid
          ? "已恢复训练记录：本组因反向移动失效，请重新开始。"
          : `已恢复 ${state.readings.length} 个已读位置，可从当前任务继续。`,
        state.invalid,
      );
    else if (savedText)
      feedback("保存的训练记录格式无效，已开启新训练。", true);
    return { render };
  }

  root.NewtonSession = Object.freeze({ ...api, storage, initTraining });
})(globalThis);

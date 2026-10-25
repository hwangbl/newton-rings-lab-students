const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
test("HTML refers to available scripts and styles with matching release fingerprints", () => {
  const root = path.resolve(__dirname, ".."),
    html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const refs = [
    ...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css)(?:\?[^" ]+)?)"/g),
  ].map((match) => match[1]);
  assert.ok(refs.includes("release-support.js"));
  assert.ok(refs.some((ref) => ref.startsWith("session-support.js?")));
  for (const ref of refs) {
    const [name, query] = ref.split("?"),
      data = fs.readFileSync(path.join(root, name));
    const digest = crypto
      .createHash("sha256")
      .update(data.toString("utf8").replace(/\r\n/g, "\n"))
      .digest("hex")
      .slice(0, 12);
    if (name.startsWith("application."))
      assert.ok(name.includes(digest), `stale fingerprint for ${name}`);
    if (name === "session-support.js")
      assert.equal(new URLSearchParams(query).get("v"), digest);
  }
  assert.ok(
    html.indexOf("session-support.js") < html.indexOf('src="application.'),
  );
});

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = process.cwd();
const require = createRequire(path.join(ROOT, "package.json"));

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    mode: "SMARTWORK_UI_FONT_SENTINEL_V2",
    failure: {
      code: "PLAYWRIGHT_NOT_FOUND",
      message: "Package playwright tidak ditemukan dari project.",
      detail: error.message
    }
  }, null, 2));
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const headed = args.has("--headed");

const configArg = [...args].find((x) => x.startsWith("--config="));
const urlArg = [...args].find((x) => x.startsWith("--url="));

const configPath = configArg
  ? path.resolve(configArg.slice("--config=".length))
  : path.join(ROOT, "configs", "smartwork-ui-font-contract.json");

const rawConfig = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "").trim();
const contract = JSON.parse(rawConfig);

const url = urlArg ? urlArg.slice("--url=".length) : contract.pageUrl;
const requiredFamily = contract.requiredFamily || "Plus Jakarta Sans";

const failures = [];
const warnings = [];

function pushFailure(code, message, data = null) {
  failures.push({ code, message, data });
}

function pushWarning(code, message, data = null) {
  warnings.push({ code, message, data });
}

function familyOk(fontFamily) {
  return String(fontFamily || "").includes(requiredFamily);
}

const browser = await chromium.launch({
  headless: !headed,
  channel: "chrome"
});

try {
  const page = await browser.newPage({
    viewport: contract.viewport || { width: 430, height: 900 },
    deviceScaleFactor: 1
  });

  await page.goto(`${url}${url.includes("?") ? "&" : "?"}fontSentinel=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 30000
  });

  if (contract.openInvoiceModal) {
    const invoiceButton = page.getByText("Invoice", { exact: true }).first();
    if ((await invoiceButton.count()) > 0) {
      await invoiceButton.click().catch(() => {});
      await page.waitForTimeout(250);
    } else {
      pushWarning("INVOICE_BUTTON_NOT_FOUND_BEFORE_MODAL", "Tombol Invoice tidak ditemukan sebelum modal dibuka.");
    }
  }

  const observedTargets = await page.evaluate((targets) => {
    const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();

    const isVisible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return cs.display !== "none" &&
        cs.visibility !== "hidden" &&
        Number(cs.opacity || 1) !== 0 &&
        rect.width >= 0 &&
        rect.height >= 0;
    };

    const findTarget = (rule) => {
      if (rule.selector === "body") return document.body;

      const candidates = [...document.querySelectorAll(rule.selector || "*")];

      if (rule.exactText) {
        const matched = candidates.filter((el) => norm(el.textContent) === rule.exactText);
        return matched.find(isVisible) || matched[0] || null;
      }

      return candidates.find(isVisible) || candidates[0] || null;
    };

    const read = (rule) => {
      const el = findTarget(rule);
      if (!el) return { name: rule.name, found: false };

      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();

      return {
        name: rule.name,
        found: true,
        text: norm(el.textContent).slice(0, 160),
        tag: el.tagName.toLowerCase(),
        id: el.id || "",
        className: String(el.className || ""),
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };

    return targets.map(read);
  }, contract.targets || []);

  for (const rule of contract.targets || []) {
    const item = observedTargets.find((x) => x.name === rule.name) || { name: rule.name, found: false };

    if (!item.found) {
      if (rule.required) {
        pushFailure("TARGET_NOT_FOUND", `${rule.name} tidak ditemukan di DOM.`, { rule, observed: item });
      } else {
        pushWarning("OPTIONAL_TARGET_NOT_FOUND", `${rule.name} tidak ditemukan di DOM.`, { rule, observed: item });
      }
      continue;
    }

    if (!familyOk(item.fontFamily)) {
      pushFailure(
        "FONT_FAMILY_BLOCKED",
        `${rule.name} memakai font selain ${requiredFamily}.`,
        { rule, observed: item }
      );
    }
  }

  const globalViolations = contract.globalVisibleTextScan
    ? await page.evaluate(({ requiredFamily, maxGlobalViolations }) => {
        const norm = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const blockedTags = new Set([
          "script",
          "style",
          "noscript",
          "template",
          "svg",
          "path",
          "meta",
          "link",
          "head",
          "title",
          "br"
        ]);

        const isVisible = (el) => {
          const cs = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return cs.display !== "none" &&
            cs.visibility !== "hidden" &&
            Number(cs.opacity || 1) !== 0 &&
            rect.width > 0 &&
            rect.height > 0;
        };

        const directText = (el) =>
          norm([...el.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent)
            .join(" "));

        const violations = [];

        for (const el of [...document.body.querySelectorAll("*")]) {
          const tag = el.tagName.toLowerCase();
          if (blockedTags.has(tag)) continue;
          if (!isVisible(el)) continue;

          const text = directText(el);
          if (!text) continue;

          const cs = getComputedStyle(el);
          const family = cs.fontFamily || "";

          if (!family.includes(requiredFamily)) {
            const rect = el.getBoundingClientRect();
            violations.push({
              tag,
              id: el.id || "",
              className: String(el.className || ""),
              text: text.slice(0, 140),
              fontFamily: family,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });

            if (violations.length >= maxGlobalViolations) break;
          }
        }

        return violations;
      }, {
        requiredFamily,
        maxGlobalViolations: contract.maxGlobalViolations || 80
      })
    : [];

  for (const item of globalViolations) {
    pushFailure(
      "GLOBAL_VISIBLE_TEXT_FONT_BLOCKED",
      `Ada teks terlihat memakai font selain ${requiredFamily}.`,
      item
    );
  }

  const result = {
    ok: failures.length === 0,
    strict,
    mode: "SMARTWORK_UI_FONT_SENTINEL_V2_FAMILY_ONLY",
    contract: {
      path: path.relative(ROOT, configPath),
      version: contract.version,
      requiredFamily,
      mode: contract.mode,
      targetCount: Array.isArray(contract.targets) ? contract.targets.length : 0,
      globalVisibleTextScan: Boolean(contract.globalVisibleTextScan)
    },
    url,
    failures,
    warnings,
    observedTargets,
    globalViolations,
    safety: {
      readOnly: true,
      noAutoFix: true,
      noUiMutation: true,
      noRepoMutation: true,
      noSiagaInput: true,
      noScreenshot: true,
      noReports: true
    }
  };

  console.log(JSON.stringify(result, null, 2));

  if (strict && failures.length > 0) {
    console.error("SMARTWORK_UI_FONT_SENTINEL_V2=BLOCKED_NON_JAKARTA_FONT");
    process.exit(1);
  }

  console.log(failures.length > 0 ? "SMARTWORK_UI_FONT_SENTINEL_V2=ISSUES_FOUND" : "SMARTWORK_UI_FONT_SENTINEL_V2=OK");
} finally {
  await browser.close();
}

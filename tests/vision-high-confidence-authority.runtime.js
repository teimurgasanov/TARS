"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { loadTrackedAppWithGuard } = require("./helpers/canonical-tars-runtime");

const fixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "vision-high-confidence-authority.json"),
  "utf8"
));

function provider(payload) {
  const calls = [];
  return {
    calls,
    async post(url, options) {
      if (/openai\.com/i.test(String(url))) {
        const prompt = String(options && options.data && options.data.input && options.data.input[0] && options.data.input[0].content && options.data.input[0].content[0] && options.data.input[0].content[0].text || "");
        const role = prompt.includes("строгую классификацию изображения") ? "dedicated" : "primary";
        calls.push(role);
        return { statusCode: 200, data: { output_text: JSON.stringify(payload) } };
      }
      calls.push("yandex");
      return { statusCode: 200, data: { result: { textAnnotation: { fullText: "" } } } };
    }
  };
}

function source(id) {
  const file = {
    _id: `authority-${id}`,
    id: `authority-${id}`,
    name: `${id}.jpg`,
    type: "image/jpeg",
    url: `/file-upload/authority-${id}/${id}.jpg`
  };
  return { file, content: Buffer.from(`vision-authority-${id}`) };
}

function runtimeEnvironment(sourceImage, http) {
  const appUser = { id: "app-user", username: "tars" };
  const personalRoom = { id: "personal-room", slugifiedName: "tars-aleksei", type: "p" };
  const reportRoom = { id: "report-room", slugifiedName: "otchet", type: "c" };
  const sent = [];
  let sequence = 0;
  const creator = {
    startMessage(initial = {}) {
      const value = { ...initial };
      const builder = {
        value,
        setSender(sender) { value.sender = sender; return builder; },
        setRoom(room) { value.room = room; return builder; },
        setText(text) { value.text = text; return builder; },
        setParseUrls(parseUrls) { value.parseUrls = parseUrls; return builder; }
      };
      return builder;
    },
    async finish(builder) {
      const id = `created-${++sequence}`;
      sent.push({ id, ...builder.value });
      return id;
    }
  };
  const read = {
    getPersistenceReader() {
      return { async readByAssociation() { return []; } };
    },
    getRoomReader() {
      return {
        async getByName(name) { return /^(?:otchet|отч[её]?ты?)$/i.test(String(name)) ? reportRoom : undefined; },
        async getMessages() { return []; }
      };
    },
    getUserReader() {
      return {
        async getByUsername() { return appUser; },
        async getAppUser() { return appUser; }
      };
    },
    getUploadReader() {
      return {
        async getBufferById(id) {
          assert.strictEqual(String(id), sourceImage.file.id);
          return sourceImage.content;
        },
        async getById(id) {
          assert.strictEqual(String(id), sourceImage.file.id);
          return { id, url: sourceImage.file.url };
        }
      };
    }
  };
  const persistence = {
    writes: [],
    async updateByAssociation(association, value) {
      this.writes.push({ association, value });
    }
  };
  const modify = {
    getCreator() { return creator; },
    getDeleter() { return { async deleteMessage() {} }; }
  };
  const message = {
    id: "aleksei-message",
    room: personalRoom,
    sender: { id: "aleksei-user", username: "aleksei" },
    file: sourceImage.file,
    files: [sourceImage.file],
    text: ""
  };
  return { appUser, http, message, modify, persistence, read, reportRoom, sent };
}

const config = {
  openaiApiKey: "test-openai-key",
  openaiReceiptModel: "gpt-4.1-mini",
  apiKey: "test-yandex-key",
  folderId: "test-yandex-folder",
  timeZone: "Europe/Samara",
  cutoffHour: 0
};
const logger = { info() {}, warn() {}, error() {} };

(async () => {
  const guard = loadTrackedAppWithGuard().__testGuard;
  const byId = Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture]));

  for (const fixture of fixtures) {
    const image = source(fixture.id);
    const http = provider(fixture.payload);
    const decision = await guard.primaryVisionDecisionForImage(image.file, image.content, http, config, logger);
    assert.strictEqual(guard.primaryVisionDominantKind(decision), fixture.expectedRoute, `${fixture.id}: unexpected dominant route`);
    if (fixture.expectedRoute === "photo") {
      assert.strictEqual(decision.financial_block, false, `${fixture.id}: indirect text must not become a financial veto`);
      const forwarded = await guard.shouldForwardConfirmedWorkPhoto(image.file, image.content, http, config, logger);
      assert.deepStrictEqual(forwarded, { forward: true, reason: "primary-vision-high-work-photo" });
      assert.deepStrictEqual(http.calls, ["primary"], `${fixture.id}: HIGH WORK_PHOTO must bypass dedicated Vision and receipt OCR`);
    } else if (fixture.expectedRoute === "receipt") {
      assert.strictEqual((await guard.shouldForwardConfirmedWorkPhoto(image.file, image.content, http, config, logger)).forward, false, `${fixture.id}: financial evidence must block work-photo forwarding`);
      assert.deepStrictEqual(http.calls, ["primary"], `${fixture.id}: the primary decision must be reused`);
    }
  }

  const aleksei = byId["aleksei-mens-fade-closeup"];
  const alekseiImage = source(`${aleksei.id}-runtime`);
  const alekseiHttp = provider(aleksei.payload);
  const runtime = runtimeEnvironment(alekseiImage, alekseiHttp);
  const result = await guard.processPersonalMediaV2(
    runtime.message,
    runtime.read,
    runtime.persistence,
    runtime.modify,
    logger,
    alekseiHttp,
    config,
    "photo",
    false
  );
  assert.strictEqual(result.handled, true, "Aleksei fixture must be terminally handled");
  assert.strictEqual(result.status, "work-photo-forwarded", "Aleksei fixture must use the report-photo route");
  assert.ok(runtime.sent.some((message) => message.room === runtime.reportRoom && /^\[ \]\(https:\/\/gsnvlabchat\.ru\//.test(String(message.text))), "work photo must be forwarded to Otchet");
  assert.ok(runtime.sent.some((message) => message.room === runtime.message.room && message.text === "✅ ФОТО РАБОТЫ ПРИНЯТО"), "master must receive the existing Photo accepted result");
  assert.strictEqual(alekseiHttp.calls.filter((call) => call === "primary").length, 1, "one canonical image must have one primary Vision call");
  assert.strictEqual(alekseiHttp.calls.filter((call) => call === "dedicated").length, 0, "HIGH WORK_PHOTO must not require dedicated confirmation");
  assert.strictEqual(alekseiHttp.calls.filter((call) => call === "yandex").length, 0, "HIGH WORK_PHOTO must make zero receipt OCR calls");

  const sourceText = fs.readFileSync(path.join(__dirname, "..", "TarsReportApp.js"), "utf8");
  assert.match(sourceText, /const financialBlock = Boolean\(isBanking \|\| hasPaymentUi \|\| hasReceiptLayout \|\| hasFinancialDocument \|\| hasDocumentLayout\)/,
    "only concrete visual financial/document evidence may veto HIGH WORK_PHOTO");
  assert.doesNotMatch(sourceText, /financialBlock = Boolean\([^\n]*hasFinancialText/,
    "incidental financial text must not be a work-photo veto");
  assert.match(sourceText, /primary-vision-high-work-photo/,
    "HIGH WORK_PHOTO must remain terminal before the dedicated fallback");

  console.log("PASS: HIGH WORK_PHOTO is authoritative with concrete financial safety overrides and zero receipt OCR calls");
})().catch((error) => {
  console.error(error && error.stack || error);
  process.exitCode = 1;
});

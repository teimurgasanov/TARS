"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "TarsReportApp.js"), "utf8");
const implementationStart = source.indexOf('const IMAGE_CLASSIFICATION_SCHEMA_VERSION = "personal-image-classification-v1"');
const implementationEnd = source.indexOf("const RECEIPT_VISUAL_CRITERIA", implementationStart);
assert(implementationStart >= 0 && implementationEnd > implementationStart, "ImageClassificationV1 implementation block not found");

const loadImplementation = new Function(
  "exactHash",
  "receiptImageMimeType",
  "bytesToBase64",
  "openAiReceiptOutputText",
  `${source.slice(implementationStart, implementationEnd)}
  return {
    IMAGE_CLASSIFICATION_SCHEMA_VERSION,
    IMAGE_CLASSIFICATION_MODEL,
    requestOpenAiImageClassification
  };`
);

const classifier = loadImplementation(
  (content) => crypto.createHash("sha256").update(content).digest("hex"),
  () => "image/png",
  (content) => Buffer.from(content).toString("base64"),
  (payload) => {
    if (payload && payload.output_text) return String(payload.output_text);
    const parts = [];
    for (const item of payload && payload.output || []) {
      for (const content of item && item.content || []) {
        if (content && content.text) parts.push(String(content.text));
        else if (content && content.output_text) parts.push(String(content.output_text));
      }
    }
    return parts.join("\n");
  }
);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function syntheticPng(width, height, paint) {
  const pixels = Buffer.alloc(width * height * 4, 255);
  const fill = (left, top, right, bottom, color) => {
    for (let y = Math.max(0, top); y < Math.min(height, bottom); y += 1) {
      for (let x = Math.max(0, left); x < Math.min(width, right); x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = color.length > 3 ? color[3] : 255;
      }
    }
  };
  const circle = (centerX, centerY, radius, color) => {
    const radiusSquared = radius * radius;
    for (let y = centerY - radius; y <= centerY + radius; y += 1) {
      for (let x = centerX - radius; x <= centerX + radius; x += 1) {
        if ((x - centerX) ** 2 + (y - centerY) ** 2 <= radiusSquared) fill(x, y, x + 1, y + 1, color);
      }
    }
  };
  paint({ fill, circle });
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const target = y * (width * 4 + 1);
    raw[target] = 0;
    pixels.copy(raw, target + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

const fixtures = [
  {
    name: "synthetic_mock_receipt",
    bytes: syntheticPng(384, 384, ({ fill }) => {
      fill(0, 0, 384, 384, [225, 230, 236]);
      fill(72, 24, 312, 360, [250, 250, 246]);
      fill(72, 24, 312, 34, [35, 42, 52]);
      fill(72, 350, 312, 360, [35, 42, 52]);
      fill(98, 58, 286, 82, [35, 42, 52]);
      fill(98, 112, 260, 120, [92, 101, 112]);
      fill(98, 142, 278, 150, [92, 101, 112]);
      fill(98, 172, 240, 180, [92, 101, 112]);
      fill(98, 220, 286, 232, [20, 75, 130]);
      fill(98, 258, 286, 306, [210, 241, 217]);
      fill(116, 272, 268, 292, [31, 112, 59]);
    })
  },
  {
    name: "synthetic_salon_work_photo",
    bytes: syntheticPng(384, 384, ({ fill, circle }) => {
      fill(0, 0, 384, 384, [232, 218, 202]);
      fill(22, 22, 362, 362, [244, 236, 226]);
      fill(38, 38, 346, 346, [190, 162, 139]);
      fill(48, 48, 336, 336, [224, 211, 197]);
      fill(132, 265, 252, 346, [52, 64, 75]);
      circle(192, 172, 98, [73, 44, 31]);
      circle(192, 184, 67, [224, 175, 143]);
      fill(122, 104, 262, 168, [76, 43, 29]);
      fill(112, 142, 138, 260, [76, 43, 29]);
      fill(246, 142, 272, 260, [76, 43, 29]);
      fill(166, 191, 177, 198, [64, 52, 48]);
      fill(207, 191, 218, 198, [64, 52, 48]);
      fill(176, 226, 208, 231, [150, 70, 68]);
      circle(302, 286, 18, [126, 132, 139]);
      circle(302, 328, 18, [126, 132, 139]);
      fill(300, 286, 305, 347, [126, 132, 139]);
      fill(302, 306, 350, 311, [126, 132, 139]);
    })
  },
  {
    name: "synthetic_other_landscape",
    bytes: syntheticPng(384, 384, ({ fill, circle }) => {
      fill(0, 0, 384, 245, [111, 190, 230]);
      fill(0, 245, 384, 384, [91, 159, 78]);
      circle(310, 72, 34, [251, 210, 74]);
      fill(40, 215, 154, 245, [62, 117, 72]);
      fill(92, 160, 102, 300, [105, 75, 45]);
      circle(97, 140, 58, [49, 130, 61]);
      fill(238, 258, 330, 330, [194, 87, 61]);
      fill(250, 230, 318, 258, [113, 74, 54]);
    })
  }
];

function safeProviderError(payload) {
  const error = payload && payload.error;
  if (!error || typeof error !== "object") return null;
  const sanitize = (value) => String(value || "")
    .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, "[REDACTED_IMAGE]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 800);
  return {
    type: sanitize(error.type),
    code: sanitize(error.code),
    param: sanitize(error.param),
    message: sanitize(error.message)
  };
}

function createHttpCapture() {
  const attempts = [];
  return {
    attempts,
    async post(url, request) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Number(request && request.timeout || 14000));
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify(request.data),
          signal: controller.signal
        });
        const responseText = await response.text();
        let payload = {};
        try {
          payload = responseText ? JSON.parse(responseText) : {};
        } catch (_error) {
          payload = {};
        }
        attempts.push({
          http_status: response.status,
          result_status: payload && payload.status || "unknown",
          model: payload && payload.model || request.data.model,
          usage: payload && payload.usage ? {
            input_tokens: payload.usage.input_tokens,
            output_tokens: payload.usage.output_tokens,
            total_tokens: payload.usage.total_tokens
          } : null,
          latency_ms: Date.now() - startedAt,
          provider_error: safeProviderError(payload)
        });
        return { statusCode: response.status, data: payload };
      } catch (error) {
        if (error && error.name === "AbortError") {
          const timeoutError = new Error("request timeout");
          timeoutError.code = "ETIMEDOUT";
          throw timeoutError;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

async function main() {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    console.error("SMOKE_NOT_RUN: OPENAI_API_KEY is not configured");
    process.exitCode = 2;
    return;
  }

  for (const fixture of fixtures) {
    const http = createHttpCapture();
    const startedAt = Date.now();
    const result = await classifier.requestOpenAiImageClassification(
      { name: `${fixture.name}.png`, type: "image/png" },
      fixture.bytes,
      http,
      { openaiApiKey: apiKey },
      { warn: () => {} }
    );
    const lastAttempt = http.attempts[http.attempts.length - 1] || {};
    const safeResult = {
      fixture: fixture.name,
      http_status: lastAttempt.http_status || null,
      result_status: lastAttempt.result_status || "not_received",
      model: lastAttempt.model || classifier.IMAGE_CLASSIFICATION_MODEL,
      schema_version: result.valid ? result.value.schema_version : null,
      kind: result.valid ? result.value.kind : null,
      confidence: result.valid ? result.value.confidence : null,
      work_photo: result.valid ? result.value.work_photo : null,
      safety: result.valid ? result.value.safety : null,
      reason_code: result.valid ? result.value.reason_code : null,
      usage: lastAttempt.usage || null,
      latency_ms: Date.now() - startedAt,
      attempts: http.attempts.length,
      error_code: result.valid ? null : result.errorCode,
      provider_error: lastAttempt.provider_error || null
    };
    console.log(JSON.stringify(safeResult));
    if (!result.valid) {
      process.exitCode = 1;
      return;
    }
  }
}

main().catch((error) => {
  const safeName = String(error && error.name || "Error").replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80);
  console.error(`SMOKE_FAILED: ${safeName || "Error"}`);
  process.exitCode = 1;
});

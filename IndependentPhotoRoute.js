"use strict";

function isImage(file) {
  if (!file) return false;
  const type = String(file.type || file.mimeType || "");
  const name = String(file.name || file.title || "").toLowerCase();
  return /^image\//i.test(type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
}

function imageFiles(message) {
  const out = [];
  if (isImage(message && message.file)) out.push(message.file);
  for (const file of message && Array.isArray(message.files) ? message.files : []) {
    if (isImage(file) && !out.includes(file)) out.push(file);
  }
  return out;
}

function responseText(payload) {
  if (!payload) return "";
  if (typeof payload.output_text === "string") return payload.output_text;
  if (typeof payload.text === "string") return payload.text;
  const parts = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(item && item.content) ? item.content : []) {
      if (typeof content.text === "string") parts.push(content.text);
      else if (content.text && typeof content.text.value === "string") parts.push(content.text.value);
    }
  }
  return parts.join(" ");
}

function base64(content) {
  if (typeof Buffer !== "undefined") return Buffer.from(content).toString("base64");
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >>> 18) & 63] + chars[(n >>> 12) & 63];
    out += i + 1 < bytes.length ? chars[(n >>> 6) & 63] : "=";
    out += i + 2 < bytes.length ? chars[n & 63] : "=";
  }
  return out;
}

async function classifyPhoto(file, content, read, http, logger) {
  try {
    const settings = read.getEnvironmentReader().getSettings();
    const key = String(await settings.getValueById("openai_receipt_api_key") || "").trim();
    if (!key || !content || !content.length) return "unknown";
    const model = String(await settings.getValueById("openai_receipt_model") || "gpt-4.1-mini").trim() || "gpt-4.1-mini";
    const mime = String(file.type || file.mimeType || "image/jpeg");
    const response = await http.post("https://api.openai.com/v1/responses", {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      data: {
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: "Определи тип изображения. Верни строго одно слово: photo, receipt или mailing. photo — реальная фотография работы салона: стрижка, окрашивание, маникюр, брови или другая фотография результата работы. receipt — банковский чек, перевод, квитанция, СБП, QR банка. mailing — скриншот переписки, рассылки или интерфейса сообщений. Если не уверен, верни unknown." },
          { type: "input_image", image_url: `data:${mime};base64,${base64(content)}` }
        ] }],
        max_output_tokens: 20
      },
      timeout: 20000
    });
    const payload = response && (response.data || response.content || response);
    const text = responseText(payload).trim().toLowerCase();
    if (/\breceipt\b/.test(text)) return "receipt";
    if (/\bmailing\b/.test(text)) return "mailing";
    if (/\bphoto\b/.test(text)) return "photo";
  } catch (error) {
    if (logger) logger.warn(`INDEPENDENT_PHOTO_CLASSIFY_FAILED: ${error && error.message || error}`);
  }
  return "unknown";
}

async function findReportsRoom(read) {
  for (const name of ["Otchet", "otchet", "Отчеты", "отчеты", "Отчет", "отчет", "Отчёт", "отчёт"]) {
    try {
      const room = await read.getRoomReader().getByName(name);
      if (room) return room;
    } catch (_error) {}
  }
  return undefined;
}

async function routeIndependentPhoto(message, read, http, modify, logger, options = {}) {
  if (!message || !options.isPersonalRoom || !options.isPersonalRoom(message.room)) return false;
  if (options.isAppMessage && options.isAppMessage(message)) return false;
  const intent = options.directFileIntent ? options.directFileIntent(message) : "";
  if (intent === "receipt" || intent === "mailing") return false;

  const files = imageFiles(message);
  if (!files.length) return false;
  const room = await findReportsRoom(read);
  const appUser = await read.getUserReader().getByUsername("tars") || await read.getUserReader().getAppUser();
  if (!room || !appUser) return false;

  for (const file of files) {
    const uploadId = String(file._id || file.id || "");
    if (!uploadId) continue;
    try {
      const content = await read.getUploadReader().getBufferById(uploadId);
      const kind = await classifyPhoto(file, content, read, http, logger);
      if (kind !== "photo") continue;
      const source = await read.getUploadReader().getById(uploadId);
      const reportFile = {
        _id: uploadId,
        name: String(file.name || source && source.name || "photo-report.jpg"),
        type: String(file.type || source && source.type || "image/jpeg")
      };
      const master = message.sender ? `@${message.sender.username || message.sender.name || message.sender.id}` : "мастер";
      const builder = modify.getCreator().startMessage({ room, sender: appUser, text: `Мастер: ${master}`, file: reportFile, parseUrls: false });
      const id = await modify.getCreator().finish(builder);
      if (id) {
        if (logger) logger.info(`INDEPENDENT_PHOTO_OK upload=${uploadId} message=${id}`);
        return true;
      }
    } catch (error) {
      if (logger) logger.warn(`INDEPENDENT_PHOTO_FORWARD_FAILED: ${error && error.message || error}`);
    }
  }
  return false;
}

module.exports = { routeIndependentPhoto };

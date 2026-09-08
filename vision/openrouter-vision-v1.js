"use strict";

// Provider transport only. Receipt decisions and persistence stay in TARS.
const URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-3.5-flash";
function enabled(config) {
  return Boolean(config && config.openRouterVisionEnabled === true);
}
function providerForConfig(config) {
  if (!enabled(config)) return undefined;
  const key = String(config.openRouterApiKey || "").trim();
  if (!key || /\s/.test(key)) return undefined;
  return {
    id: "openrouter", url: URL, model: MODEL, includeImageDetail: false,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }
  };
}
function responseText(payload) {
  if (!payload || payload.error || !Array.isArray(payload.choices) || payload.choices.length !== 1) return "";
  const choice = payload.choices[0];
  const message = choice && choice.message;
  if (!choice || choice.finish_reason !== "stop" || !message || message.refusal || message.tool_calls) return "";
  return typeof message.content === "string" && message.content.length <= 32000 ? message.content : "";
}
async function post(http, provider, options) {
  if (!provider || provider.id !== "openrouter") return http.post(provider.url, options);
  // Fixed destination and dedicated key. Never forward another provider's
  // credential or retry with a different credential. HTTP redirect behavior
  // is owned by Apps Engine; no application-level redirect is implemented.
  if (provider.url !== URL) throw new Error("Vision provider configuration invalid");
  const source = options.data;
  const format = source.text && source.text.format;
  const messages = source.messages || source.input.map(message => ({
    role: message.role,
    content: message.content.map(part => {
      if (part.type === "input_text") return { type: "text", text: part.text };
      if (part.type === "input_image") return { type: "image_url", image_url: { url: part.image_url } };
      throw new Error("Vision request format invalid");
    })
  }));
  const data = {
    model: MODEL, messages, stream: false,
    response_format: source.response_format || (format ? {
      type: "json_schema", json_schema: { name: format.name, strict: true, schema: format.schema }
    } : { type: "json_object" }),
    max_tokens: source.max_tokens || source.max_completion_tokens || source.max_output_tokens || 320,
    reasoning: { effort: "minimal", exclude: true },
    provider: { require_parameters: true, data_collection: "deny", zdr: true, allow_fallbacks: false }
  };
  let response;
  try {
    response = await http.post(URL, {
      headers: { Authorization: provider.headers.Authorization, "Content-Type": "application/json" },
      data, timeout: options.timeout, strictSSL: true, rejectUnauthorized: true
    });
  } catch (error) {
    // Do not propagate provider bodies/headers through existing legacy loggers.
    throw new Error(/timeout|timed\s*out|etimedout/i.test(String(error && (error.code || error.message) || ""))
      ? "Vision timeout" : "Vision transport unavailable");
  }
  const statusCode = Number(response && response.statusCode || 0);
  if (statusCode < 200 || statusCode >= 300) return { statusCode, data: {} };
  if (response.url && response.url !== URL) return { statusCode, data: { output_text: "" } };
  let payload = response.data || response.content;
  try { if (typeof payload === "string") payload = JSON.parse(payload); } catch (_) { payload = undefined; }
  // Normalize the envelope, not the model's JSON. Existing strict parsers
  // still validate the unmodified content and retain all financial vetoes.
  return { statusCode, data: { output_text: responseText(payload) } };
}
module.exports = { enabled, providerForConfig, post, responseText, MODEL };

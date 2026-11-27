const MAX_PROVIDER_ERROR_BODY_CHARS = 4e3;
function normalizeProviderError(error) {
  if (!(error instanceof Error)) {
    return { message: safeJsonStringify(error), messageCarriesBody: false };
  }
  const sdkError = error;
  const status = extractStatus(sdkError);
  const body = extractBody(sdkError);
  const messageCarriesBody = body === void 0 || error.message.includes(body);
  return {
    status,
    body,
    message: error.message,
    messageCarriesBody
  };
}
function extractStatus(error) {
  var _a, _b;
  if (typeof error.statusCode === "number")
    return error.statusCode;
  if (typeof error.status === "number")
    return error.status;
  if (typeof ((_a = error.$metadata) == null ? void 0 : _a.httpStatusCode) === "number")
    return error.$metadata.httpStatusCode;
  if (typeof ((_b = error.$response) == null ? void 0 : _b.statusCode) === "number")
    return error.$response.statusCode;
  return void 0;
}
function extractBody(error) {
  const bodyText = pickBodyText(error);
  if (bodyText === void 0)
    return void 0;
  const trimmed = bodyText.trim();
  if (trimmed.length === 0)
    return void 0;
  return truncateErrorText(trimmed, MAX_PROVIDER_ERROR_BODY_CHARS);
}
function pickBodyText(error) {
  var _a;
  if (typeof error.body === "string")
    return error.body;
  if (isPlainNonEmptyObject(error.error))
    return safeJsonStringify(error.error);
  const responseBody = (_a = error.$response) == null ? void 0 : _a.body;
  if (typeof responseBody === "string")
    return responseBody;
  if (isReadableStreamLike(responseBody))
    return void 0;
  if (isPlainNonEmptyObject(responseBody))
    return safeJsonStringify(responseBody);
  return void 0;
}
function isReadableStreamLike(value) {
  return typeof value === "object" && value !== null && "pipe" in value && typeof value.pipe === "function";
}
function isPlainNonEmptyObject(value) {
  if (typeof value !== "object" || value === null)
    return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    return false;
  return Object.keys(value).length > 0;
}
function formatProviderError(norm, prefix) {
  if (norm.messageCarriesBody || norm.status === void 0 || norm.body === void 0) {
    return prefix !== void 0 && norm.status !== void 0 ? `${prefix} (${norm.status}): ${norm.message}` : norm.message;
  }
  return prefix !== void 0 ? `${prefix} (${norm.status}): ${norm.body}` : `${norm.status}: ${norm.body}`;
}
function truncateErrorText(text, maxChars) {
  if (text.length <= maxChars)
    return text;
  return `${text.slice(0, maxChars)}... [truncated ${text.length - maxChars} chars]`;
}
function safeJsonStringify(value) {
  try {
    const serialized = JSON.stringify(value);
    return serialized === void 0 ? String(value) : serialized;
  } catch {
    return String(value);
  }
}
export {
  formatProviderError as f,
  normalizeProviderError as n
};

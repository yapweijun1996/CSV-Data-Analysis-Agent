import { y as safeParseAsync, v as toJSONSchema, E as EventSourceParserStream, z as ZodFirstPartyTypeKind, o as object$1, d as array$1, s as string, b as literal, n as number, h as discriminatedUnion, e as boolean, u as union, A as partialRecord, _ as _enum, a as looseObject, r as record, c as unknown, B as tuple, m as any, C as strictObject, D as _instanceof, F as never, l as lazy, q as _null, G as custom } from "./csv_data_analysis_vendor-ai-shared-L1egyVJx.js";
var marker$5 = "vercel.ai.error";
var symbol$5 = Symbol.for(marker$5);
var _a$5, _b$4;
var AISDKError$1 = class _AISDKError extends (_b$4 = Error, _a$5 = symbol$5, _b$4) {
  /**
   * Creates an AI SDK Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor({
    name: name142,
    message,
    cause
  }) {
    super(message);
    this[_a$5] = true;
    this.name = name142;
    this.cause = cause;
  }
  /**
   * Checks if the given error is an AI SDK Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
   */
  static isInstance(error) {
    return _AISDKError.hasMarker(error, marker$5);
  }
  static hasMarker(error, marker152) {
    const markerSymbol = Symbol.for(marker152);
    return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
  }
};
var name$5 = "AI_APICallError";
var marker2$3 = `vercel.ai.error.${name$5}`;
var symbol2$3 = Symbol.for(marker2$3);
var _a2$3, _b2$2;
var APICallError$1 = class APICallError extends (_b2$2 = AISDKError$1, _a2$3 = symbol2$3, _b2$2) {
  constructor({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseHeaders,
    responseBody,
    cause,
    isRetryable = statusCode != null && (statusCode === 408 || // request timeout
    statusCode === 409 || // conflict
    statusCode === 429 || // too many requests
    statusCode >= 500),
    // server error
    data
  }) {
    super({ name: name$5, message, cause });
    this[_a2$3] = true;
    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
    this.responseBody = responseBody;
    this.isRetryable = isRetryable;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker2$3);
  }
};
var name2$3 = "AI_EmptyResponseBodyError";
var marker3$3 = `vercel.ai.error.${name2$3}`;
var symbol3$3 = Symbol.for(marker3$3);
var _a3$3, _b3$2;
var EmptyResponseBodyError$1 = class EmptyResponseBodyError extends (_b3$2 = AISDKError$1, _a3$3 = symbol3$3, _b3$2) {
  // used in isInstance
  constructor({ message = "Empty response body" } = {}) {
    super({ name: name2$3, message });
    this[_a3$3] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker3$3);
  }
};
function getErrorMessage$2(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}
var name3$3 = "AI_InvalidArgumentError";
var marker4$3 = `vercel.ai.error.${name3$3}`;
var symbol4$3 = Symbol.for(marker4$3);
var _a4$3, _b4$2;
var InvalidArgumentError$2 = class InvalidArgumentError extends (_b4$2 = AISDKError$1, _a4$3 = symbol4$3, _b4$2) {
  constructor({
    message,
    cause,
    argument
  }) {
    super({ name: name3$3, message, cause });
    this[_a4$3] = true;
    this.argument = argument;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker4$3);
  }
};
var name4$2 = "AI_InvalidPromptError";
var marker5$2 = `vercel.ai.error.${name4$2}`;
var symbol5$2 = Symbol.for(marker5$2);
var _a5$2, _b5$1;
var InvalidPromptError = class extends (_b5$1 = AISDKError$1, _a5$2 = symbol5$2, _b5$1) {
  constructor({
    prompt,
    message,
    cause
  }) {
    super({ name: name4$2, message: `Invalid prompt: ${message}`, cause });
    this[_a5$2] = true;
    this.prompt = prompt;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker5$2);
  }
};
var name5$3 = "AI_InvalidResponseDataError";
var marker6$3 = `vercel.ai.error.${name5$3}`;
var symbol6$3 = Symbol.for(marker6$3);
var _a6$3, _b6$2;
var InvalidResponseDataError$1 = class InvalidResponseDataError extends (_b6$2 = AISDKError$1, _a6$3 = symbol6$3, _b6$2) {
  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`
  }) {
    super({ name: name5$3, message });
    this[_a6$3] = true;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker6$3);
  }
};
var name6$3 = "AI_JSONParseError";
var marker7$3 = `vercel.ai.error.${name6$3}`;
var symbol7$3 = Symbol.for(marker7$3);
var _a7$3, _b7$2;
var JSONParseError$1 = class JSONParseError extends (_b7$2 = AISDKError$1, _a7$3 = symbol7$3, _b7$2) {
  constructor({ text: text2, cause }) {
    super({
      name: name6$3,
      message: `JSON parsing failed: Text: ${text2}.
Error message: ${getErrorMessage$2(cause)}`,
      cause
    });
    this[_a7$3] = true;
    this.text = text2;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker7$3);
  }
};
var name7$3 = "AI_LoadAPIKeyError";
var marker8$3 = `vercel.ai.error.${name7$3}`;
var symbol8$3 = Symbol.for(marker8$3);
var _a8$3, _b8$2;
var LoadAPIKeyError$1 = class LoadAPIKeyError extends (_b8$2 = AISDKError$1, _a8$3 = symbol8$3, _b8$2) {
  // used in isInstance
  constructor({ message }) {
    super({ name: name7$3, message });
    this[_a8$3] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker8$3);
  }
};
var name8$1 = "AI_LoadSettingError";
var marker9$1 = `vercel.ai.error.${name8$1}`;
var symbol9$1 = Symbol.for(marker9$1);
var _a9$1, _b9;
var LoadSettingError = class extends (_b9 = AISDKError$1, _a9$1 = symbol9$1, _b9) {
  // used in isInstance
  constructor({ message }) {
    super({ name: name8$1, message });
    this[_a9$1] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker9$1);
  }
};
var name9$1 = "AI_NoContentGeneratedError";
var marker10$1 = `vercel.ai.error.${name9$1}`;
var symbol10$1 = Symbol.for(marker10$1);
var _a10$1, _b10;
var NoContentGeneratedError = class extends (_b10 = AISDKError$1, _a10$1 = symbol10$1, _b10) {
  // used in isInstance
  constructor({
    message = "No content generated."
  } = {}) {
    super({ name: name9$1, message });
    this[_a10$1] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker10$1);
  }
};
var name10$2 = "AI_NoSuchModelError";
var marker11$2 = `vercel.ai.error.${name10$2}`;
var symbol11$2 = Symbol.for(marker11$2);
var _a11$2, _b11$1;
var NoSuchModelError$1 = class NoSuchModelError extends (_b11$1 = AISDKError$1, _a11$2 = symbol11$2, _b11$1) {
  constructor({
    errorName = name10$2,
    modelId,
    modelType,
    message = `No such ${modelType}: ${modelId}`
  }) {
    super({ name: errorName, message });
    this[_a11$2] = true;
    this.modelId = modelId;
    this.modelType = modelType;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker11$2);
  }
};
var name11$1 = "AI_TooManyEmbeddingValuesForCallError";
var marker12$1 = `vercel.ai.error.${name11$1}`;
var symbol12$1 = Symbol.for(marker12$1);
var _a12$1, _b12;
var TooManyEmbeddingValuesForCallError = class extends (_b12 = AISDKError$1, _a12$1 = symbol12$1, _b12) {
  constructor(options) {
    super({
      name: name11$1,
      message: `Too many values for a single embedding call. The ${options.provider} model "${options.modelId}" can only embed up to ${options.maxEmbeddingsPerCall} values per call, but ${options.values.length} values were provided.`
    });
    this[_a12$1] = true;
    this.provider = options.provider;
    this.modelId = options.modelId;
    this.maxEmbeddingsPerCall = options.maxEmbeddingsPerCall;
    this.values = options.values;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker12$1);
  }
};
var name12$2 = "AI_TypeValidationError";
var marker13$2 = `vercel.ai.error.${name12$2}`;
var symbol13$2 = Symbol.for(marker13$2);
var _a13$2, _b13$1;
var TypeValidationError$1 = class _TypeValidationError extends (_b13$1 = AISDKError$1, _a13$2 = symbol13$2, _b13$1) {
  constructor({
    value,
    cause,
    context: context2
  }) {
    let contextPrefix = "Type validation failed";
    if (context2 == null ? void 0 : context2.field) {
      contextPrefix += ` for ${context2.field}`;
    }
    if ((context2 == null ? void 0 : context2.entityName) || (context2 == null ? void 0 : context2.entityId)) {
      contextPrefix += " (";
      const parts = [];
      if (context2.entityName) {
        parts.push(context2.entityName);
      }
      if (context2.entityId) {
        parts.push(`id: "${context2.entityId}"`);
      }
      contextPrefix += parts.join(", ");
      contextPrefix += ")";
    }
    super({
      name: name12$2,
      message: `${contextPrefix}: Value: ${JSON.stringify(value)}.
Error message: ${getErrorMessage$2(cause)}`,
      cause
    });
    this[_a13$2] = true;
    this.value = value;
    this.context = context2;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker13$2);
  }
  /**
   * Wraps an error into a TypeValidationError.
   * If the cause is already a TypeValidationError with the same value and context, it returns the cause.
   * Otherwise, it creates a new TypeValidationError.
   *
   * @param {Object} params - The parameters for wrapping the error.
   * @param {unknown} params.value - The value that failed validation.
   * @param {unknown} params.cause - The original error or cause of the validation failure.
   * @param {TypeValidationContext} params.context - Optional context about what is being validated.
   * @returns {TypeValidationError} A TypeValidationError instance.
   */
  static wrap({
    value,
    cause,
    context: context2
  }) {
    var _a152, _b15, _c;
    if (_TypeValidationError.isInstance(cause) && cause.value === value && ((_a152 = cause.context) == null ? void 0 : _a152.field) === (context2 == null ? void 0 : context2.field) && ((_b15 = cause.context) == null ? void 0 : _b15.entityName) === (context2 == null ? void 0 : context2.entityName) && ((_c = cause.context) == null ? void 0 : _c.entityId) === (context2 == null ? void 0 : context2.entityId)) {
      return cause;
    }
    return new _TypeValidationError({ value, cause, context: context2 });
  }
};
var name13$2 = "AI_UnsupportedFunctionalityError";
var marker14$2 = `vercel.ai.error.${name13$2}`;
var symbol14$2 = Symbol.for(marker14$2);
var _a14$2, _b14$1;
var UnsupportedFunctionalityError$1 = class UnsupportedFunctionalityError extends (_b14$1 = AISDKError$1, _a14$2 = symbol14$2, _b14$1) {
  constructor({
    functionality,
    message = `'${functionality}' functionality not supported.`
  }) {
    super({ name: name13$2, message });
    this[_a14$2] = true;
    this.functionality = functionality;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker14$2);
  }
};
function isJSONValue(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJSONValue);
  }
  if (typeof value === "object") {
    return Object.entries(value).every(
      ([key, val]) => typeof key === "string" && (val === void 0 || isJSONValue(val))
    );
  }
  return false;
}
function isJSONArray(value) {
  return Array.isArray(value) && value.every(isJSONValue);
}
function isJSONObject(value) {
  return value != null && typeof value === "object" && Object.entries(value).every(
    ([key, val]) => typeof key === "string" && (val === void 0 || isJSONValue(val))
  );
}
var define_process_env_default$1 = {};
function combineHeaders$1(...headers) {
  return headers.reduce(
    (combinedHeaders, currentHeaders) => ({
      ...combinedHeaders,
      ...currentHeaders != null ? currentHeaders : {}
    }),
    {}
  );
}
function createToolNameMapping$1({
  tools = [],
  providerToolNames,
  resolveProviderToolName
}) {
  var _a22;
  const customToolNameToProviderToolName = {};
  const providerToolNameToCustomToolName = {};
  for (const tool2 of tools) {
    if (tool2.type === "provider") {
      const providerToolName = (_a22 = resolveProviderToolName == null ? void 0 : resolveProviderToolName(tool2)) != null ? _a22 : tool2.id in providerToolNames ? providerToolNames[tool2.id] : void 0;
      if (providerToolName == null) {
        continue;
      }
      customToolNameToProviderToolName[tool2.name] = providerToolName;
      providerToolNameToCustomToolName[providerToolName] = tool2.name;
    }
  }
  return {
    toProviderToolName: (customToolName) => {
      var _a32;
      return (_a32 = customToolNameToProviderToolName[customToolName]) != null ? _a32 : customToolName;
    },
    toCustomToolName: (providerToolName) => {
      var _a32;
      return (_a32 = providerToolNameToCustomToolName[providerToolName]) != null ? _a32 : providerToolName;
    }
  };
}
async function delay(delayInMs, options) {
  if (delayInMs == null) {
    return Promise.resolve();
  }
  const signal = options == null ? void 0 : options.abortSignal;
  return new Promise((resolve2, reject) => {
    if (signal == null ? void 0 : signal.aborted) {
      reject(createAbortError());
      return;
    }
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve2();
    }, delayInMs);
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal == null ? void 0 : signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };
    signal == null ? void 0 : signal.addEventListener("abort", onAbort);
  });
}
function createAbortError() {
  return new DOMException("Delay was aborted", "AbortError");
}
var DelayedPromise = class {
  constructor() {
    this.status = { type: "pending" };
    this._resolve = void 0;
    this._reject = void 0;
  }
  get promise() {
    if (this._promise) {
      return this._promise;
    }
    this._promise = new Promise((resolve2, reject) => {
      if (this.status.type === "resolved") {
        resolve2(this.status.value);
      } else if (this.status.type === "rejected") {
        reject(this.status.error);
      }
      this._resolve = resolve2;
      this._reject = reject;
    });
    return this._promise;
  }
  resolve(value) {
    var _a22;
    this.status = { type: "resolved", value };
    if (this._promise) {
      (_a22 = this._resolve) == null ? void 0 : _a22.call(this, value);
    }
  }
  reject(error) {
    var _a22;
    this.status = { type: "rejected", error };
    if (this._promise) {
      (_a22 = this._reject) == null ? void 0 : _a22.call(this, error);
    }
  }
  isResolved() {
    return this.status.type === "resolved";
  }
  isRejected() {
    return this.status.type === "rejected";
  }
  isPending() {
    return this.status.type === "pending";
  }
};
function extractResponseHeaders$1(response) {
  return Object.fromEntries([...response.headers]);
}
var { btoa: btoa$1, atob: atob$1 } = globalThis;
function convertBase64ToUint8Array$1(base64String) {
  const base64Url = base64String.replace(/-/g, "+").replace(/_/g, "/");
  const latin1string = atob$1(base64Url);
  return Uint8Array.from(latin1string, (byte) => byte.codePointAt(0));
}
function convertUint8ArrayToBase64$1(array2) {
  let latin1string = "";
  for (let i = 0; i < array2.length; i++) {
    latin1string += String.fromCodePoint(array2[i]);
  }
  return btoa$1(latin1string);
}
function convertToBase64$1(value) {
  return value instanceof Uint8Array ? convertUint8ArrayToBase64$1(value) : value;
}
function convertToFormData(input, options = {}) {
  const { useArrayBrackets = true } = options;
  const formData = new FormData();
  for (const [key, value] of Object.entries(input)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 1) {
        formData.append(key, value[0]);
        continue;
      }
      const arrayKey = useArrayBrackets ? `${key}[]` : key;
      for (const item of value) {
        formData.append(arrayKey, item);
      }
      continue;
    }
    formData.append(key, value);
  }
  return formData;
}
var name$4 = "AI_DownloadError";
var marker$4 = `vercel.ai.error.${name$4}`;
var symbol$4 = Symbol.for(marker$4);
var _a$4, _b$3;
var DownloadError$1 = class DownloadError extends (_b$3 = AISDKError$1, _a$4 = symbol$4, _b$3) {
  constructor({
    url,
    statusCode,
    statusText,
    cause,
    message = cause == null ? `Failed to download ${url}: ${statusCode} ${statusText}` : `Failed to download ${url}: ${cause}`
  }) {
    super({ name: name$4, message, cause });
    this[_a$4] = true;
    this.url = url;
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker$4);
  }
};
var DEFAULT_MAX_DOWNLOAD_SIZE$1 = 2 * 1024 * 1024 * 1024;
async function readResponseWithSizeLimit$1({
  response,
  url,
  maxBytes = DEFAULT_MAX_DOWNLOAD_SIZE$1
}) {
  const contentLength = response.headers.get("content-length");
  if (contentLength != null) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      throw new DownloadError$1({
        url,
        message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes (Content-Length: ${length}).`
      });
    }
  }
  const body = response.body;
  if (body == null) {
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        throw new DownloadError$1({
          url,
          message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`
        });
      }
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
function validateDownloadUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new DownloadError$1({
      url,
      message: `Invalid URL: ${url}`
    });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new DownloadError$1({
      url,
      message: `URL scheme must be http or https, got ${parsed.protocol}`
    });
  }
  const hostname = parsed.hostname;
  if (!hostname) {
    throw new DownloadError$1({
      url,
      message: `URL must have a hostname`
    });
  }
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".localhost")) {
    throw new DownloadError$1({
      url,
      message: `URL with hostname ${hostname} is not allowed`
    });
  }
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ipv6 = hostname.slice(1, -1);
    if (isPrivateIPv6(ipv6)) {
      throw new DownloadError$1({
        url,
        message: `URL with IPv6 address ${hostname} is not allowed`
      });
    }
    return;
  }
  if (isIPv4(hostname)) {
    if (isPrivateIPv4(hostname)) {
      throw new DownloadError$1({
        url,
        message: `URL with IP address ${hostname} is not allowed`
      });
    }
    return;
  }
}
function isIPv4(hostname) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255 && String(num) === part;
  });
}
function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}
function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized === "::") return true;
  if (normalized.startsWith("::ffff:")) {
    const mappedPart = normalized.slice(7);
    if (isIPv4(mappedPart)) {
      return isPrivateIPv4(mappedPart);
    }
    const hexParts = mappedPart.split(":");
    if (hexParts.length === 2) {
      const high = parseInt(hexParts[0], 16);
      const low = parseInt(hexParts[1], 16);
      if (!isNaN(high) && !isNaN(low)) {
        const a = high >> 8 & 255;
        const b = high & 255;
        const c = low >> 8 & 255;
        const d = low & 255;
        return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
      }
    }
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe80")) return true;
  return false;
}
async function downloadBlob(url, options) {
  var _a22, _b22;
  validateDownloadUrl(url);
  try {
    const response = await fetch(url, {
      signal: options == null ? void 0 : options.abortSignal
    });
    if (!response.ok) {
      throw new DownloadError$1({
        url,
        statusCode: response.status,
        statusText: response.statusText
      });
    }
    const data = await readResponseWithSizeLimit$1({
      response,
      url,
      maxBytes: (_a22 = options == null ? void 0 : options.maxBytes) != null ? _a22 : DEFAULT_MAX_DOWNLOAD_SIZE$1
    });
    const contentType = (_b22 = response.headers.get("content-type")) != null ? _b22 : void 0;
    return new Blob([data], contentType ? { type: contentType } : void 0);
  } catch (error) {
    if (DownloadError$1.isInstance(error)) {
      throw error;
    }
    throw new DownloadError$1({ url, cause: error });
  }
}
var createIdGenerator$1 = ({
  prefix,
  size = 16,
  alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  separator = "-"
} = {}) => {
  const generator = () => {
    const alphabetLength = alphabet.length;
    const chars = new Array(size);
    for (let i = 0; i < size; i++) {
      chars[i] = alphabet[Math.random() * alphabetLength | 0];
    }
    return chars.join("");
  };
  if (prefix == null) {
    return generator;
  }
  if (alphabet.includes(separator)) {
    throw new InvalidArgumentError$2({
      argument: "separator",
      message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
    });
  }
  return () => `${prefix}${separator}${generator()}`;
};
var generateId$1 = createIdGenerator$1();
function getErrorMessage$1(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}
function isAbortError$1(error) {
  return (error instanceof Error || error instanceof DOMException) && (error.name === "AbortError" || error.name === "ResponseAborted" || // Next.js
  error.name === "TimeoutError");
}
var FETCH_FAILED_ERROR_MESSAGES$1 = ["fetch failed", "failed to fetch"];
var BUN_ERROR_CODES = [
  "ConnectionRefused",
  "ConnectionClosed",
  "FailedToOpenSocket",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE"
];
function isBunNetworkError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  const code = error.code;
  if (typeof code === "string" && BUN_ERROR_CODES.includes(code)) {
    return true;
  }
  return false;
}
function handleFetchError$1({
  error,
  url,
  requestBodyValues
}) {
  if (isAbortError$1(error)) {
    return error;
  }
  if (error instanceof TypeError && FETCH_FAILED_ERROR_MESSAGES$1.includes(error.message.toLowerCase())) {
    const cause = error.cause;
    if (cause != null) {
      return new APICallError$1({
        message: `Cannot connect to API: ${cause.message}`,
        cause,
        url,
        requestBodyValues,
        isRetryable: true
        // retry when network error
      });
    }
  }
  if (isBunNetworkError(error)) {
    return new APICallError$1({
      message: `Cannot connect to API: ${error.message}`,
      cause: error,
      url,
      requestBodyValues,
      isRetryable: true
    });
  }
  return error;
}
function getRuntimeEnvironmentUserAgent$1(globalThisAny = globalThis) {
  var _a22, _b22, _c;
  if (globalThisAny.window) {
    return `runtime/browser`;
  }
  if ((_a22 = globalThisAny.navigator) == null ? void 0 : _a22.userAgent) {
    return `runtime/${globalThisAny.navigator.userAgent.toLowerCase()}`;
  }
  if ((_c = (_b22 = globalThisAny.process) == null ? void 0 : _b22.versions) == null ? void 0 : _c.node) {
    return `runtime/node.js/${globalThisAny.process.version.substring(0)}`;
  }
  if (globalThisAny.EdgeRuntime) {
    return `runtime/vercel-edge`;
  }
  return "runtime/unknown";
}
function normalizeHeaders$1(headers) {
  if (headers == null) {
    return {};
  }
  const normalized = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
  } else {
    if (!Array.isArray(headers)) {
      headers = Object.entries(headers);
    }
    for (const [key, value] of headers) {
      if (value != null) {
        normalized[key.toLowerCase()] = value;
      }
    }
  }
  return normalized;
}
function withUserAgentSuffix$1(headers, ...userAgentSuffixParts) {
  const normalizedHeaders = new Headers(normalizeHeaders$1(headers));
  const currentUserAgentHeader = normalizedHeaders.get("user-agent") || "";
  normalizedHeaders.set(
    "user-agent",
    [currentUserAgentHeader, ...userAgentSuffixParts].filter(Boolean).join(" ")
  );
  return Object.fromEntries(normalizedHeaders.entries());
}
var VERSION$5 = "4.0.19";
var getOriginalFetch$1 = () => globalThis.fetch;
var getFromApi = async ({
  url,
  headers = {},
  successfulResponseHandler,
  failedResponseHandler,
  abortSignal,
  fetch: fetch2 = getOriginalFetch$1()
}) => {
  try {
    const response = await fetch2(url, {
      method: "GET",
      headers: withUserAgentSuffix$1(
        headers,
        `ai-sdk/provider-utils/${VERSION$5}`,
        getRuntimeEnvironmentUserAgent$1()
      ),
      signal: abortSignal
    });
    const responseHeaders = extractResponseHeaders$1(response);
    if (!response.ok) {
      let errorInformation;
      try {
        errorInformation = await failedResponseHandler({
          response,
          url,
          requestBodyValues: {}
        });
      } catch (error) {
        if (isAbortError$1(error) || APICallError$1.isInstance(error)) {
          throw error;
        }
        throw new APICallError$1({
          message: "Failed to process error response",
          cause: error,
          statusCode: response.status,
          url,
          responseHeaders,
          requestBodyValues: {}
        });
      }
      throw errorInformation.value;
    }
    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: {}
      });
    } catch (error) {
      if (error instanceof Error) {
        if (isAbortError$1(error) || APICallError$1.isInstance(error)) {
          throw error;
        }
      }
      throw new APICallError$1({
        message: "Failed to process successful response",
        cause: error,
        statusCode: response.status,
        url,
        responseHeaders,
        requestBodyValues: {}
      });
    }
  } catch (error) {
    throw handleFetchError$1({ error, url, requestBodyValues: {} });
  }
};
function isNonNullable$1(value) {
  return value != null;
}
function isUrlSupported({
  mediaType,
  url,
  supportedUrls
}) {
  url = url.toLowerCase();
  mediaType = mediaType.toLowerCase();
  return Object.entries(supportedUrls).map(([key, value]) => {
    const mediaType2 = key.toLowerCase();
    return mediaType2 === "*" || mediaType2 === "*/*" ? { mediaTypePrefix: "", regexes: value } : { mediaTypePrefix: mediaType2.replace(/\*/, ""), regexes: value };
  }).filter(({ mediaTypePrefix }) => mediaType.startsWith(mediaTypePrefix)).flatMap(({ regexes }) => regexes).some((pattern) => pattern.test(url));
}
function loadApiKey$1({
  apiKey,
  environmentVariableName,
  apiKeyParameterName = "apiKey",
  description
}) {
  if (typeof apiKey === "string") {
    return apiKey;
  }
  if (apiKey != null) {
    throw new LoadAPIKeyError$1({
      message: `${description} API key must be a string.`
    });
  }
  if (typeof process === "undefined") {
    throw new LoadAPIKeyError$1({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables is not supported in this environment.`
    });
  }
  apiKey = define_process_env_default$1[environmentVariableName];
  if (apiKey == null) {
    throw new LoadAPIKeyError$1({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`
    });
  }
  if (typeof apiKey !== "string") {
    throw new LoadAPIKeyError$1({
      message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
    });
  }
  return apiKey;
}
function loadOptionalSetting$1({
  settingValue,
  environmentVariableName
}) {
  if (typeof settingValue === "string") {
    return settingValue;
  }
  if (settingValue != null || typeof process === "undefined") {
    return void 0;
  }
  settingValue = define_process_env_default$1[environmentVariableName];
  if (settingValue == null || typeof settingValue !== "string") {
    return void 0;
  }
  return settingValue;
}
function mediaTypeToExtension(mediaType) {
  var _a22;
  const [_type, subtype = ""] = mediaType.toLowerCase().split("/");
  return (_a22 = {
    mpeg: "mp3",
    "x-wav": "wav",
    opus: "ogg",
    mp4: "m4a",
    "x-m4a": "m4a"
  }[subtype]) != null ? _a22 : subtype;
}
var suspectProtoRx$1 = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
var suspectConstructorRx$1 = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;
function _parse$1(text2) {
  const obj = JSON.parse(text2);
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (suspectProtoRx$1.test(text2) === false && suspectConstructorRx$1.test(text2) === false) {
    return obj;
  }
  return filter$1(obj);
}
function filter$1(obj) {
  let next = [obj];
  while (next.length) {
    const nodes = next;
    next = [];
    for (const node of nodes) {
      if (Object.prototype.hasOwnProperty.call(node, "__proto__")) {
        throw new SyntaxError("Object contains forbidden prototype property");
      }
      if (Object.prototype.hasOwnProperty.call(node, "constructor") && node.constructor !== null && typeof node.constructor === "object" && Object.prototype.hasOwnProperty.call(node.constructor, "prototype")) {
        throw new SyntaxError("Object contains forbidden prototype property");
      }
      for (const key in node) {
        const value = node[key];
        if (value && typeof value === "object") {
          next.push(value);
        }
      }
    }
  }
  return obj;
}
function secureJsonParse$1(text2) {
  const { stackTraceLimit } = Error;
  try {
    Error.stackTraceLimit = 0;
  } catch (e) {
    return _parse$1(text2);
  }
  try {
    return _parse$1(text2);
  } finally {
    Error.stackTraceLimit = stackTraceLimit;
  }
}
function addAdditionalPropertiesToJsonSchema$1(jsonSchema2) {
  if (jsonSchema2.type === "object" || Array.isArray(jsonSchema2.type) && jsonSchema2.type.includes("object")) {
    jsonSchema2.additionalProperties = false;
    const { properties } = jsonSchema2;
    if (properties != null) {
      for (const key of Object.keys(properties)) {
        properties[key] = visit$1(properties[key]);
      }
    }
  }
  if (jsonSchema2.items != null) {
    jsonSchema2.items = Array.isArray(jsonSchema2.items) ? jsonSchema2.items.map(visit$1) : visit$1(jsonSchema2.items);
  }
  if (jsonSchema2.anyOf != null) {
    jsonSchema2.anyOf = jsonSchema2.anyOf.map(visit$1);
  }
  if (jsonSchema2.allOf != null) {
    jsonSchema2.allOf = jsonSchema2.allOf.map(visit$1);
  }
  if (jsonSchema2.oneOf != null) {
    jsonSchema2.oneOf = jsonSchema2.oneOf.map(visit$1);
  }
  const { definitions } = jsonSchema2;
  if (definitions != null) {
    for (const key of Object.keys(definitions)) {
      definitions[key] = visit$1(definitions[key]);
    }
  }
  return jsonSchema2;
}
function visit$1(def) {
  if (typeof def === "boolean") return def;
  return addAdditionalPropertiesToJsonSchema$1(def);
}
var ignoreOverride$1 = Symbol(
  "Let zodToJsonSchema decide on which parser to use"
);
var defaultOptions$1 = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref"
};
var getDefaultOptions$1 = (options) => typeof options === "string" ? {
  ...defaultOptions$1,
  name: options
} : {
  ...defaultOptions$1,
  ...options
};
function parseAnyDef$1() {
  return {};
}
function parseArrayDef$1(def, refs) {
  var _a22, _b22, _c;
  const res = {
    type: "array"
  };
  if (((_a22 = def.type) == null ? void 0 : _a22._def) && ((_c = (_b22 = def.type) == null ? void 0 : _b22._def) == null ? void 0 : _c.typeName) !== ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef$1(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    res.minItems = def.minLength.value;
  }
  if (def.maxLength) {
    res.maxItems = def.maxLength.value;
  }
  if (def.exactLength) {
    res.minItems = def.exactLength.value;
    res.maxItems = def.exactLength.value;
  }
  return res;
}
function parseBigintDef$1(def) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks) return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        if (check.inclusive) {
          res.minimum = check.value;
        } else {
          res.exclusiveMinimum = check.value;
        }
        break;
      case "max":
        if (check.inclusive) {
          res.maximum = check.value;
        } else {
          res.exclusiveMaximum = check.value;
        }
        break;
      case "multipleOf":
        res.multipleOf = check.value;
        break;
    }
  }
  return res;
}
function parseBooleanDef$1() {
  return { type: "boolean" };
}
function parseBrandedDef$1(_def, refs) {
  return parseDef$1(_def.type._def, refs);
}
var parseCatchDef$1 = (def, refs) => {
  return parseDef$1(def.innerType._def, refs);
};
function parseDateDef$1(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy != null ? overrideDateStrategy : refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef$1(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser$1(def);
  }
}
var integerDateParser$1 = (def) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        res.minimum = check.value;
        break;
      case "max":
        res.maximum = check.value;
        break;
    }
  }
  return res;
};
function parseDefaultDef$1(_def, refs) {
  return {
    ...parseDef$1(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}
function parseEffectsDef$1(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef$1(_def.schema._def, refs) : parseAnyDef$1();
}
function parseEnumDef$1(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}
var isJsonSchema7AllOfType$1 = (type) => {
  if ("type" in type && type.type === "string") return false;
  return "allOf" in type;
};
function parseIntersectionDef$1(def, refs) {
  const allOf = [
    parseDef$1(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef$1(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType$1(schema)) {
      mergedAllOf.push(...schema.allOf);
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? { allOf: mergedAllOf } : void 0;
}
function parseLiteralDef$1(def) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}
var emojiRegex$1 = void 0;
var zodPatterns$1 = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-\.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9\-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex$1 === void 0) {
      emojiRegex$1 = RegExp(
        "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$",
        "u"
      );
    }
    return emojiRegex$1;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef$1(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
          break;
        case "max":
          res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat$1(res, "email", check.message, refs);
              break;
            case "format:idn-email":
              addFormat$1(res, "idn-email", check.message, refs);
              break;
            case "pattern:zod":
              addPattern$1(res, zodPatterns$1.email, check.message, refs);
              break;
          }
          break;
        case "url":
          addFormat$1(res, "uri", check.message, refs);
          break;
        case "uuid":
          addFormat$1(res, "uuid", check.message, refs);
          break;
        case "regex":
          addPattern$1(res, check.regex, check.message, refs);
          break;
        case "cuid":
          addPattern$1(res, zodPatterns$1.cuid, check.message, refs);
          break;
        case "cuid2":
          addPattern$1(res, zodPatterns$1.cuid2, check.message, refs);
          break;
        case "startsWith":
          addPattern$1(
            res,
            RegExp(`^${escapeLiteralCheckValue$1(check.value, refs)}`),
            check.message,
            refs
          );
          break;
        case "endsWith":
          addPattern$1(
            res,
            RegExp(`${escapeLiteralCheckValue$1(check.value, refs)}$`),
            check.message,
            refs
          );
          break;
        case "datetime":
          addFormat$1(res, "date-time", check.message, refs);
          break;
        case "date":
          addFormat$1(res, "date", check.message, refs);
          break;
        case "time":
          addFormat$1(res, "time", check.message, refs);
          break;
        case "duration":
          addFormat$1(res, "duration", check.message, refs);
          break;
        case "length":
          res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
          res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
          break;
        case "includes": {
          addPattern$1(
            res,
            RegExp(escapeLiteralCheckValue$1(check.value, refs)),
            check.message,
            refs
          );
          break;
        }
        case "ip": {
          if (check.version !== "v6") {
            addFormat$1(res, "ipv4", check.message, refs);
          }
          if (check.version !== "v4") {
            addFormat$1(res, "ipv6", check.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern$1(res, zodPatterns$1.base64url, check.message, refs);
          break;
        case "jwt":
          addPattern$1(res, zodPatterns$1.jwt, check.message, refs);
          break;
        case "cidr": {
          if (check.version !== "v6") {
            addPattern$1(res, zodPatterns$1.ipv4Cidr, check.message, refs);
          }
          if (check.version !== "v4") {
            addPattern$1(res, zodPatterns$1.ipv6Cidr, check.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern$1(res, zodPatterns$1.emoji(), check.message, refs);
          break;
        case "ulid": {
          addPattern$1(res, zodPatterns$1.ulid, check.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat$1(res, "binary", check.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              res.contentEncoding = "base64";
              break;
            }
            case "pattern:zod": {
              addPattern$1(res, zodPatterns$1.base64, check.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern$1(res, zodPatterns$1.nanoid, check.message, refs);
        }
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue$1(literal2, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric$1(literal2) : literal2;
}
var ALPHA_NUMERIC$1 = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789"
);
function escapeNonAlphaNumeric$1(source) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC$1.has(source[i])) {
      result += "\\";
    }
    result += source[i];
  }
  return result;
}
function addFormat$1(schema, value, message, refs) {
  var _a22;
  if (schema.format || ((_a22 = schema.anyOf) == null ? void 0 : _a22.some((x) => x.format))) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format
      });
      delete schema.format;
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    schema.format = value;
  }
}
function addPattern$1(schema, regex, message, refs) {
  var _a22;
  if (schema.pattern || ((_a22 = schema.allOf) == null ? void 0 : _a22.some((x) => x.pattern))) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern
      });
      delete schema.pattern;
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags$1(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    schema.pattern = stringifyRegExpWithFlags$1(regex, refs);
  }
}
function stringifyRegExpWithFlags$1(regex, refs) {
  var _a22;
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    // Case-insensitive
    m: regex.flags.includes("m"),
    // `^` and `$` matches adjacent to newline characters
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && ((_a22 = source[i + 2]) == null ? void 0 : _a22.match(/[a-z]/))) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  try {
    new RegExp(pattern);
  } catch (e) {
    console.warn(
      `Could not convert regex pattern at ${refs.currentPath.join(
        "/"
      )} to a flag-independent form! Falling back to the flag-ignorant source`
    );
    return regex.source;
  }
  return pattern;
}
function parseRecordDef$1(def, refs) {
  var _a22, _b22, _c, _d, _e, _f;
  const schema = {
    type: "object",
    additionalProperties: (_a22 = parseDef$1(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    })) != null ? _a22 : refs.allowedAdditionalProperties
  };
  if (((_b22 = def.keyType) == null ? void 0 : _b22._def.typeName) === ZodFirstPartyTypeKind.ZodString && ((_c = def.keyType._def.checks) == null ? void 0 : _c.length)) {
    const { type, ...keyType } = parseStringDef$1(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (((_d = def.keyType) == null ? void 0 : _d._def.typeName) === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (((_e = def.keyType) == null ? void 0 : _e._def.typeName) === ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString && ((_f = def.keyType._def.type._def.checks) == null ? void 0 : _f.length)) {
    const { type, ...keyType } = parseBrandedDef$1(
      def.keyType._def,
      refs
    );
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}
function parseMapDef$1(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef$1(def, refs);
  }
  const keys = parseDef$1(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || parseAnyDef$1();
  const values = parseDef$1(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || parseAnyDef$1();
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}
function parseNativeEnumDef$1(def) {
  const object2 = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object2[object2[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object2[key]);
  const parsedTypes = Array.from(
    new Set(actualValues.map((values) => typeof values))
  );
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}
function parseNeverDef$1() {
  return { not: parseAnyDef$1() };
}
function parseNullDef$1() {
  return {
    type: "null"
  };
}
var primitiveMappings$1 = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef$1(def, refs) {
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every(
    (x) => x._def.typeName in primitiveMappings$1 && (!x._def.checks || !x._def.checks.length)
  )) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings$1[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce(
      (acc, x) => {
        const type = typeof x._def.value;
        switch (type) {
          case "string":
          case "number":
          case "boolean":
            return [...acc, type];
          case "bigint":
            return [...acc, "integer"];
          case "object":
            if (x._def.value === null) return [...acc, "null"];
          case "symbol":
          case "undefined":
          case "function":
          default:
            return acc;
        }
      },
      []
    );
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce(
          (acc, x) => {
            return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
          },
          []
        )
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce(
        (acc, x) => [
          ...acc,
          ...x._def.values.filter((x2) => !acc.includes(x2))
        ],
        []
      )
    };
  }
  return asAnyOf$1(def, refs);
}
var asAnyOf$1 = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map(
    (x, i) => parseDef$1(x._def, {
      ...refs,
      currentPath: [...refs.currentPath, "anyOf", `${i}`]
    })
  ).filter(
    (x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0)
  );
  return anyOf.length ? { anyOf } : void 0;
};
function parseNullableDef$1(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(
    def.innerType._def.typeName
  ) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    return {
      type: [
        primitiveMappings$1[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  const base = parseDef$1(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}
function parseNumberDef$1(def) {
  const res = {
    type: "number"
  };
  if (!def.checks) return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "int":
        res.type = "integer";
        break;
      case "min":
        if (check.inclusive) {
          res.minimum = check.value;
        } else {
          res.exclusiveMinimum = check.value;
        }
        break;
      case "max":
        if (check.inclusive) {
          res.maximum = check.value;
        } else {
          res.exclusiveMaximum = check.value;
        }
        break;
      case "multipleOf":
        res.multipleOf = check.value;
        break;
    }
  }
  return res;
}
function parseObjectDef$1(def, refs) {
  const result = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    const propOptional = safeIsOptional$1(propDef);
    const parsedDef = parseDef$1(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result.required = required;
  }
  const additionalProperties = decideAdditionalProperties$1(def, refs);
  if (additionalProperties !== void 0) {
    result.additionalProperties = additionalProperties;
  }
  return result;
}
function decideAdditionalProperties$1(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef$1(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional$1(schema) {
  try {
    return schema.isOptional();
  } catch (e) {
    return true;
  }
}
var parseOptionalDef$1 = (def, refs) => {
  var _a22;
  if (refs.currentPath.toString() === ((_a22 = refs.propertyPath) == null ? void 0 : _a22.toString())) {
    return parseDef$1(def.innerType._def, refs);
  }
  const innerSchema = parseDef$1(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? { anyOf: [{ not: parseAnyDef$1() }, innerSchema] } : parseAnyDef$1();
};
var parsePipelineDef$1 = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef$1(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef$1(def.out._def, refs);
  }
  const a = parseDef$1(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef$1(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};
function parsePromiseDef$1(def, refs) {
  return parseDef$1(def.type._def, refs);
}
function parseSetDef$1(def, refs) {
  const items = parseDef$1(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    schema.minItems = def.minSize.value;
  }
  if (def.maxSize) {
    schema.maxItems = def.maxSize.value;
  }
  return schema;
}
function parseTupleDef$1(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map(
        (x, i) => parseDef$1(x._def, {
          ...refs,
          currentPath: [...refs.currentPath, "items", `${i}`]
        })
      ).reduce(
        (acc, x) => x === void 0 ? acc : [...acc, x],
        []
      ),
      additionalItems: parseDef$1(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map(
        (x, i) => parseDef$1(x._def, {
          ...refs,
          currentPath: [...refs.currentPath, "items", `${i}`]
        })
      ).reduce(
        (acc, x) => x === void 0 ? acc : [...acc, x],
        []
      )
    };
  }
}
function parseUndefinedDef$1() {
  return {
    not: parseAnyDef$1()
  };
}
function parseUnknownDef$1() {
  return parseAnyDef$1();
}
var parseReadonlyDef$1 = (def, refs) => {
  return parseDef$1(def.innerType._def, refs);
};
var selectParser$1 = (def, typeName, refs) => {
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return parseStringDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodNumber:
      return parseNumberDef$1(def);
    case ZodFirstPartyTypeKind.ZodObject:
      return parseObjectDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodBigInt:
      return parseBigintDef$1(def);
    case ZodFirstPartyTypeKind.ZodBoolean:
      return parseBooleanDef$1();
    case ZodFirstPartyTypeKind.ZodDate:
      return parseDateDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodUndefined:
      return parseUndefinedDef$1();
    case ZodFirstPartyTypeKind.ZodNull:
      return parseNullDef$1();
    case ZodFirstPartyTypeKind.ZodArray:
      return parseArrayDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodUnion:
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return parseUnionDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodIntersection:
      return parseIntersectionDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodTuple:
      return parseTupleDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodRecord:
      return parseRecordDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodLiteral:
      return parseLiteralDef$1(def);
    case ZodFirstPartyTypeKind.ZodEnum:
      return parseEnumDef$1(def);
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return parseNativeEnumDef$1(def);
    case ZodFirstPartyTypeKind.ZodNullable:
      return parseNullableDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodOptional:
      return parseOptionalDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodMap:
      return parseMapDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodSet:
      return parseSetDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter()._def;
    case ZodFirstPartyTypeKind.ZodPromise:
      return parsePromiseDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodNaN:
    case ZodFirstPartyTypeKind.ZodNever:
      return parseNeverDef$1();
    case ZodFirstPartyTypeKind.ZodEffects:
      return parseEffectsDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodAny:
      return parseAnyDef$1();
    case ZodFirstPartyTypeKind.ZodUnknown:
      return parseUnknownDef$1();
    case ZodFirstPartyTypeKind.ZodDefault:
      return parseDefaultDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodBranded:
      return parseBrandedDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodReadonly:
      return parseReadonlyDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodCatch:
      return parseCatchDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodPipeline:
      return parsePipelineDef$1(def, refs);
    case ZodFirstPartyTypeKind.ZodFunction:
    case ZodFirstPartyTypeKind.ZodVoid:
    case ZodFirstPartyTypeKind.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)();
  }
};
var getRelativePath$1 = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i]) break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};
function parseDef$1(def, refs, forceResolution = false) {
  var _a22;
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = (_a22 = refs.override) == null ? void 0 : _a22.call(
      refs,
      def,
      refs,
      seenItem,
      forceResolution
    );
    if (overrideResult !== ignoreOverride$1) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref$1(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser$1(def, def.typeName, refs);
  const jsonSchema2 = typeof jsonSchemaOrGetter === "function" ? parseDef$1(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema2) {
    addMeta$1(def, refs, jsonSchema2);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema2, def, refs);
    newItem.jsonSchema = jsonSchema2;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema2;
  return jsonSchema2;
}
var get$ref$1 = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath$1(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index2) => refs.currentPath[index2] === value)) {
        console.warn(
          `Recursive reference detected at ${refs.currentPath.join(
            "/"
          )}! Defaulting to any`
        );
        return parseAnyDef$1();
      }
      return refs.$refStrategy === "seen" ? parseAnyDef$1() : void 0;
    }
  }
};
var addMeta$1 = (def, refs, jsonSchema2) => {
  if (def.description) {
    jsonSchema2.description = def.description;
  }
  return jsonSchema2;
};
var getRefs$1 = (options) => {
  const _options = getDefaultOptions$1(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    currentPath,
    propertyPath: void 0,
    seen: new Map(
      Object.entries(_options.definitions).map(([name22, def]) => [
        def._def,
        {
          def: def._def,
          path: [..._options.basePath, _options.definitionPath, name22],
          // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
          jsonSchema: void 0
        }
      ])
    )
  };
};
var zod3ToJsonSchema$1 = (schema, options) => {
  var _a22;
  const refs = getRefs$1(options);
  let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce(
    (acc, [name32, schema2]) => {
      var _a32;
      return {
        ...acc,
        [name32]: (_a32 = parseDef$1(
          schema2._def,
          {
            ...refs,
            currentPath: [...refs.basePath, refs.definitionPath, name32]
          },
          true
        )) != null ? _a32 : parseAnyDef$1()
      };
    },
    {}
  ) : void 0;
  const name22 = typeof options === "string" ? options : (options == null ? void 0 : options.nameStrategy) === "title" ? void 0 : options == null ? void 0 : options.name;
  const main = (_a22 = parseDef$1(
    schema._def,
    name22 === void 0 ? refs : {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name22]
    },
    false
  )) != null ? _a22 : parseAnyDef$1();
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main.title = title;
  }
  const combined = name22 === void 0 ? definitions ? {
    ...main,
    [refs.definitionPath]: definitions
  } : main : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name22
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name22]: main
    }
  };
  combined.$schema = "http://json-schema.org/draft-07/schema#";
  return combined;
};
var schemaSymbol$1 = Symbol.for("vercel.ai.schema");
function lazySchema$1(createSchema) {
  let schema;
  return () => {
    if (schema == null) {
      schema = createSchema();
    }
    return schema;
  };
}
function jsonSchema$1(jsonSchema2, {
  validate
} = {}) {
  return {
    [schemaSymbol$1]: true,
    _type: void 0,
    // should never be used directly
    get jsonSchema() {
      if (typeof jsonSchema2 === "function") {
        jsonSchema2 = jsonSchema2();
      }
      return jsonSchema2;
    },
    validate
  };
}
function isSchema$1(value) {
  return typeof value === "object" && value !== null && schemaSymbol$1 in value && value[schemaSymbol$1] === true && "jsonSchema" in value && "validate" in value;
}
function asSchema$1(schema) {
  return schema == null ? jsonSchema$1({ properties: {}, additionalProperties: false }) : isSchema$1(schema) ? schema : "~standard" in schema ? schema["~standard"].vendor === "zod" ? zodSchema$1(schema) : standardSchema$1(schema) : schema();
}
function standardSchema$1(standardSchema2) {
  return jsonSchema$1(
    () => addAdditionalPropertiesToJsonSchema$1(
      standardSchema2["~standard"].jsonSchema.input({
        target: "draft-07"
      })
    ),
    {
      validate: async (value) => {
        const result = await standardSchema2["~standard"].validate(value);
        return "value" in result ? { success: true, value: result.value } : {
          success: false,
          error: new TypeValidationError$1({
            value,
            cause: result.issues
          })
        };
      }
    }
  );
}
function zod3Schema$1(zodSchema2, options) {
  var _a22;
  const useReferences = (_a22 = options == null ? void 0 : options.useReferences) != null ? _a22 : false;
  return jsonSchema$1(
    // defer json schema creation to avoid unnecessary computation when only validation is needed
    () => zod3ToJsonSchema$1(zodSchema2, {
      $refStrategy: useReferences ? "root" : "none"
    }),
    {
      validate: async (value) => {
        const result = await zodSchema2.safeParseAsync(value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      }
    }
  );
}
function zod4Schema$1(zodSchema2, options) {
  var _a22;
  const useReferences = (_a22 = options == null ? void 0 : options.useReferences) != null ? _a22 : false;
  return jsonSchema$1(
    // defer json schema creation to avoid unnecessary computation when only validation is needed
    () => addAdditionalPropertiesToJsonSchema$1(
      toJSONSchema(zodSchema2, {
        target: "draft-7",
        io: "input",
        reused: useReferences ? "ref" : "inline"
      })
    ),
    {
      validate: async (value) => {
        const result = await safeParseAsync(zodSchema2, value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      }
    }
  );
}
function isZod4Schema$1(zodSchema2) {
  return "_zod" in zodSchema2;
}
function zodSchema$1(zodSchema2, options) {
  if (isZod4Schema$1(zodSchema2)) {
    return zod4Schema$1(zodSchema2, options);
  } else {
    return zod3Schema$1(zodSchema2, options);
  }
}
async function validateTypes$1({
  value,
  schema,
  context: context2
}) {
  const result = await safeValidateTypes$1({ value, schema, context: context2 });
  if (!result.success) {
    throw TypeValidationError$1.wrap({ value, cause: result.error, context: context2 });
  }
  return result.value;
}
async function safeValidateTypes$1({
  value,
  schema,
  context: context2
}) {
  const actualSchema = asSchema$1(schema);
  try {
    if (actualSchema.validate == null) {
      return { success: true, value, rawValue: value };
    }
    const result = await actualSchema.validate(value);
    if (result.success) {
      return { success: true, value: result.value, rawValue: value };
    }
    return {
      success: false,
      error: TypeValidationError$1.wrap({ value, cause: result.error, context: context2 }),
      rawValue: value
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError$1.wrap({ value, cause: error, context: context2 }),
      rawValue: value
    };
  }
}
async function parseJSON$1({
  text: text2,
  schema
}) {
  try {
    const value = secureJsonParse$1(text2);
    if (schema == null) {
      return value;
    }
    return validateTypes$1({ value, schema });
  } catch (error) {
    if (JSONParseError$1.isInstance(error) || TypeValidationError$1.isInstance(error)) {
      throw error;
    }
    throw new JSONParseError$1({ text: text2, cause: error });
  }
}
async function safeParseJSON$1({
  text: text2,
  schema
}) {
  try {
    const value = secureJsonParse$1(text2);
    if (schema == null) {
      return { success: true, value, rawValue: value };
    }
    return await safeValidateTypes$1({ value, schema });
  } catch (error) {
    return {
      success: false,
      error: JSONParseError$1.isInstance(error) ? error : new JSONParseError$1({ text: text2, cause: error }),
      rawValue: void 0
    };
  }
}
function isParsableJson(input) {
  try {
    secureJsonParse$1(input);
    return true;
  } catch (e) {
    return false;
  }
}
function parseJsonEventStream$1({
  stream,
  schema
}) {
  return stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream()).pipeThrough(
    new TransformStream({
      async transform({ data }, controller) {
        if (data === "[DONE]") {
          return;
        }
        controller.enqueue(await safeParseJSON$1({ text: data, schema }));
      }
    })
  );
}
async function parseProviderOptions$1({
  provider,
  providerOptions,
  schema
}) {
  if ((providerOptions == null ? void 0 : providerOptions[provider]) == null) {
    return void 0;
  }
  const parsedProviderOptions = await safeValidateTypes$1({
    value: providerOptions[provider],
    schema
  });
  if (!parsedProviderOptions.success) {
    throw new InvalidArgumentError$2({
      argument: "providerOptions",
      message: `invalid ${provider} provider options`,
      cause: parsedProviderOptions.error
    });
  }
  return parsedProviderOptions.value;
}
var getOriginalFetch2$1 = () => globalThis.fetch;
var postJsonToApi$1 = async ({
  url,
  headers,
  body,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch: fetch2
}) => postToApi$1({
  url,
  headers: {
    "Content-Type": "application/json",
    ...headers
  },
  body: {
    content: JSON.stringify(body),
    values: body
  },
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch: fetch2
});
var postFormDataToApi = async ({
  url,
  headers,
  formData,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch: fetch2
}) => postToApi$1({
  url,
  headers,
  body: {
    content: formData,
    values: Object.fromEntries(formData.entries())
  },
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch: fetch2
});
var postToApi$1 = async ({
  url,
  headers = {},
  body,
  successfulResponseHandler,
  failedResponseHandler,
  abortSignal,
  fetch: fetch2 = getOriginalFetch2$1()
}) => {
  try {
    const response = await fetch2(url, {
      method: "POST",
      headers: withUserAgentSuffix$1(
        headers,
        `ai-sdk/provider-utils/${VERSION$5}`,
        getRuntimeEnvironmentUserAgent$1()
      ),
      body: body.content,
      signal: abortSignal
    });
    const responseHeaders = extractResponseHeaders$1(response);
    if (!response.ok) {
      let errorInformation;
      try {
        errorInformation = await failedResponseHandler({
          response,
          url,
          requestBodyValues: body.values
        });
      } catch (error) {
        if (isAbortError$1(error) || APICallError$1.isInstance(error)) {
          throw error;
        }
        throw new APICallError$1({
          message: "Failed to process error response",
          cause: error,
          statusCode: response.status,
          url,
          responseHeaders,
          requestBodyValues: body.values
        });
      }
      throw errorInformation.value;
    }
    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: body.values
      });
    } catch (error) {
      if (error instanceof Error) {
        if (isAbortError$1(error) || APICallError$1.isInstance(error)) {
          throw error;
        }
      }
      throw new APICallError$1({
        message: "Failed to process successful response",
        cause: error,
        statusCode: response.status,
        url,
        responseHeaders,
        requestBodyValues: body.values
      });
    }
  } catch (error) {
    throw handleFetchError$1({ error, url, requestBodyValues: body.values });
  }
};
function tool$1(tool2) {
  return tool2;
}
function dynamicTool(tool2) {
  return { ...tool2, type: "dynamic" };
}
function createProviderToolFactory$1({
  id,
  inputSchema
}) {
  return ({
    execute,
    outputSchema: outputSchema2,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }) => tool$1({
    type: "provider",
    id,
    args,
    inputSchema,
    outputSchema: outputSchema2,
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable
  });
}
function createProviderToolFactoryWithOutputSchema$1({
  id,
  inputSchema,
  outputSchema: outputSchema2,
  supportsDeferredResults
}) {
  return ({
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }) => tool$1({
    type: "provider",
    id,
    args,
    inputSchema,
    outputSchema: outputSchema2,
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    supportsDeferredResults
  });
}
async function resolve$1(value) {
  if (typeof value === "function") {
    value = value();
  }
  return Promise.resolve(value);
}
var createJsonErrorResponseHandler$1 = ({
  errorSchema,
  errorToMessage,
  isRetryable
}) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await response.text();
  const responseHeaders = extractResponseHeaders$1(response);
  if (responseBody.trim() === "") {
    return {
      responseHeaders,
      value: new APICallError$1({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
  try {
    const parsedError = await parseJSON$1({
      text: responseBody,
      schema: errorSchema
    });
    return {
      responseHeaders,
      value: new APICallError$1({
        message: errorToMessage(parsedError),
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        data: parsedError,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response, parsedError)
      })
    };
  } catch (parseError) {
    return {
      responseHeaders,
      value: new APICallError$1({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
};
var createEventSourceResponseHandler$1 = (chunkSchema) => async ({ response }) => {
  const responseHeaders = extractResponseHeaders$1(response);
  if (response.body == null) {
    throw new EmptyResponseBodyError$1({});
  }
  return {
    responseHeaders,
    value: parseJsonEventStream$1({
      stream: response.body,
      schema: chunkSchema
    })
  };
};
var createJsonResponseHandler$1 = (responseSchema) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await response.text();
  const parsedResult = await safeParseJSON$1({
    text: responseBody,
    schema: responseSchema
  });
  const responseHeaders = extractResponseHeaders$1(response);
  if (!parsedResult.success) {
    throw new APICallError$1({
      message: "Invalid JSON response",
      cause: parsedResult.error,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      url,
      requestBodyValues
    });
  }
  return {
    responseHeaders,
    value: parsedResult.value,
    rawValue: parsedResult.rawValue
  };
};
var createBinaryResponseHandler = () => async ({ response, url, requestBodyValues }) => {
  const responseHeaders = extractResponseHeaders$1(response);
  if (!response.body) {
    throw new APICallError$1({
      message: "Response body is empty",
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody: void 0
    });
  }
  try {
    const buffer = await response.arrayBuffer();
    return {
      responseHeaders,
      value: new Uint8Array(buffer)
    };
  } catch (error) {
    throw new APICallError$1({
      message: "Failed to read response as array buffer",
      url,
      requestBodyValues,
      statusCode: response.status,
      responseHeaders,
      responseBody: void 0,
      cause: error
    });
  }
};
function withoutTrailingSlash$1(url) {
  return url == null ? void 0 : url.replace(/\/$/, "");
}
function isAsyncIterable(obj) {
  return obj != null && typeof obj[Symbol.asyncIterator] === "function";
}
async function* executeTool({
  execute,
  input,
  options
}) {
  const result = execute(input, options);
  if (isAsyncIterable(result)) {
    let lastOutput;
    for await (const output of result) {
      lastOutput = output;
      yield { type: "preliminary", output };
    }
    yield { type: "final", output: lastOutput };
  } else {
    yield { type: "final", output: await result };
  }
}
var marker$3 = "vercel.ai.error";
var symbol$3 = Symbol.for(marker$3);
var _a$3, _b$2;
var AISDKError = class _AISDKError2 extends (_b$2 = Error, _a$3 = symbol$3, _b$2) {
  /**
   * Creates an AI SDK Error.
   *
   * @param {Object} params - The parameters for creating the error.
   * @param {string} params.name - The name of the error.
   * @param {string} params.message - The error message.
   * @param {unknown} [params.cause] - The underlying cause of the error.
   */
  constructor({
    name: name142,
    message,
    cause
  }) {
    super(message);
    this[_a$3] = true;
    this.name = name142;
    this.cause = cause;
  }
  /**
   * Checks if the given error is an AI SDK Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is an AI SDK Error, false otherwise.
   */
  static isInstance(error) {
    return _AISDKError2.hasMarker(error, marker$3);
  }
  static hasMarker(error, marker152) {
    const markerSymbol = Symbol.for(marker152);
    return error != null && typeof error === "object" && markerSymbol in error && typeof error[markerSymbol] === "boolean" && error[markerSymbol] === true;
  }
};
var name$3 = "AI_APICallError";
var marker2$2 = `vercel.ai.error.${name$3}`;
var symbol2$2 = Symbol.for(marker2$2);
var _a2$2, _b2$1;
var APICallError2 = class extends (_b2$1 = AISDKError, _a2$2 = symbol2$2, _b2$1) {
  constructor({
    message,
    url,
    requestBodyValues,
    statusCode,
    responseHeaders,
    responseBody,
    cause,
    isRetryable = statusCode != null && (statusCode === 408 || // request timeout
    statusCode === 409 || // conflict
    statusCode === 429 || // too many requests
    statusCode >= 500),
    // server error
    data
  }) {
    super({ name: name$3, message, cause });
    this[_a2$2] = true;
    this.url = url;
    this.requestBodyValues = requestBodyValues;
    this.statusCode = statusCode;
    this.responseHeaders = responseHeaders;
    this.responseBody = responseBody;
    this.isRetryable = isRetryable;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker2$2);
  }
};
var name2$2 = "AI_EmptyResponseBodyError";
var marker3$2 = `vercel.ai.error.${name2$2}`;
var symbol3$2 = Symbol.for(marker3$2);
var _a3$2, _b3$1;
var EmptyResponseBodyError2 = class extends (_b3$1 = AISDKError, _a3$2 = symbol3$2, _b3$1) {
  // used in isInstance
  constructor({ message = "Empty response body" } = {}) {
    super({ name: name2$2, message });
    this[_a3$2] = true;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker3$2);
  }
};
function getErrorMessage(error) {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}
var name3$2 = "AI_InvalidArgumentError";
var marker4$2 = `vercel.ai.error.${name3$2}`;
var symbol4$2 = Symbol.for(marker4$2);
var _a4$2, _b4$1;
var InvalidArgumentError$1 = class InvalidArgumentError2 extends (_b4$1 = AISDKError, _a4$2 = symbol4$2, _b4$1) {
  constructor({
    message,
    cause,
    argument
  }) {
    super({ name: name3$2, message, cause });
    this[_a4$2] = true;
    this.argument = argument;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker4$2);
  }
};
var name5$2 = "AI_InvalidResponseDataError";
var marker6$2 = `vercel.ai.error.${name5$2}`;
var symbol6$2 = Symbol.for(marker6$2);
var _a6$2, _b6$1;
var InvalidResponseDataError2 = class extends (_b6$1 = AISDKError, _a6$2 = symbol6$2, _b6$1) {
  constructor({
    data,
    message = `Invalid response data: ${JSON.stringify(data)}.`
  }) {
    super({ name: name5$2, message });
    this[_a6$2] = true;
    this.data = data;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker6$2);
  }
};
var name6$2 = "AI_JSONParseError";
var marker7$2 = `vercel.ai.error.${name6$2}`;
var symbol7$2 = Symbol.for(marker7$2);
var _a7$2, _b7$1;
var JSONParseError2 = class extends (_b7$1 = AISDKError, _a7$2 = symbol7$2, _b7$1) {
  constructor({ text: text2, cause }) {
    super({
      name: name6$2,
      message: `JSON parsing failed: Text: ${text2}.
Error message: ${getErrorMessage(cause)}`,
      cause
    });
    this[_a7$2] = true;
    this.text = text2;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker7$2);
  }
};
var name7$2 = "AI_LoadAPIKeyError";
var marker8$2 = `vercel.ai.error.${name7$2}`;
var symbol8$2 = Symbol.for(marker8$2);
var _a8$2, _b8$1;
var LoadAPIKeyError2 = class extends (_b8$1 = AISDKError, _a8$2 = symbol8$2, _b8$1) {
  // used in isInstance
  constructor({ message }) {
    super({ name: name7$2, message });
    this[_a8$2] = true;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker8$2);
  }
};
var name10$1 = "AI_NoSuchModelError";
var marker11$1 = `vercel.ai.error.${name10$1}`;
var symbol11$1 = Symbol.for(marker11$1);
var _a11$1, _b11;
var NoSuchModelError2 = class extends (_b11 = AISDKError, _a11$1 = symbol11$1, _b11) {
  constructor({
    errorName = name10$1,
    modelId,
    modelType,
    message = `No such ${modelType}: ${modelId}`
  }) {
    super({ name: errorName, message });
    this[_a11$1] = true;
    this.modelId = modelId;
    this.modelType = modelType;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker11$1);
  }
};
var name12$1 = "AI_TypeValidationError";
var marker13$1 = `vercel.ai.error.${name12$1}`;
var symbol13$1 = Symbol.for(marker13$1);
var _a13$1, _b13;
var TypeValidationError = class _TypeValidationError2 extends (_b13 = AISDKError, _a13$1 = symbol13$1, _b13) {
  constructor({
    value,
    cause,
    context: context2
  }) {
    let contextPrefix = "Type validation failed";
    if (context2 == null ? void 0 : context2.field) {
      contextPrefix += ` for ${context2.field}`;
    }
    if ((context2 == null ? void 0 : context2.entityName) || (context2 == null ? void 0 : context2.entityId)) {
      contextPrefix += " (";
      const parts = [];
      if (context2.entityName) {
        parts.push(context2.entityName);
      }
      if (context2.entityId) {
        parts.push(`id: "${context2.entityId}"`);
      }
      contextPrefix += parts.join(", ");
      contextPrefix += ")";
    }
    super({
      name: name12$1,
      message: `${contextPrefix}: Value: ${JSON.stringify(value)}.
Error message: ${getErrorMessage(cause)}`,
      cause
    });
    this[_a13$1] = true;
    this.value = value;
    this.context = context2;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker13$1);
  }
  /**
   * Wraps an error into a TypeValidationError.
   * If the cause is already a TypeValidationError with the same value and context, it returns the cause.
   * Otherwise, it creates a new TypeValidationError.
   *
   * @param {Object} params - The parameters for wrapping the error.
   * @param {unknown} params.value - The value that failed validation.
   * @param {unknown} params.cause - The original error or cause of the validation failure.
   * @param {TypeValidationContext} params.context - Optional context about what is being validated.
   * @returns {TypeValidationError} A TypeValidationError instance.
   */
  static wrap({
    value,
    cause,
    context: context2
  }) {
    var _a152, _b15, _c;
    if (_TypeValidationError2.isInstance(cause) && cause.value === value && ((_a152 = cause.context) == null ? void 0 : _a152.field) === (context2 == null ? void 0 : context2.field) && ((_b15 = cause.context) == null ? void 0 : _b15.entityName) === (context2 == null ? void 0 : context2.entityName) && ((_c = cause.context) == null ? void 0 : _c.entityId) === (context2 == null ? void 0 : context2.entityId)) {
      return cause;
    }
    return new _TypeValidationError2({ value, cause, context: context2 });
  }
};
var name13$1 = "AI_UnsupportedFunctionalityError";
var marker14$1 = `vercel.ai.error.${name13$1}`;
var symbol14$1 = Symbol.for(marker14$1);
var _a14$1, _b14;
var UnsupportedFunctionalityError2 = class extends (_b14 = AISDKError, _a14$1 = symbol14$1, _b14) {
  constructor({
    functionality,
    message = `'${functionality}' functionality not supported.`
  }) {
    super({ name: name13$1, message });
    this[_a14$1] = true;
    this.functionality = functionality;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker14$1);
  }
};
var define_process_env_default = {};
function combineHeaders(...headers) {
  return headers.reduce(
    (combinedHeaders, currentHeaders) => ({
      ...combinedHeaders,
      ...currentHeaders
    }),
    {}
  );
}
function createToolNameMapping({
  tools = [],
  providerToolNames,
  resolveProviderToolName
}) {
  var _a22;
  const customToolNameToProviderToolName = {};
  const providerToolNameToCustomToolName = {};
  for (const tool2 of tools) {
    if (tool2.type === "provider") {
      const providerToolName = (_a22 = resolveProviderToolName == null ? void 0 : resolveProviderToolName(tool2)) != null ? _a22 : tool2.id in providerToolNames ? providerToolNames[tool2.id] : void 0;
      if (providerToolName == null) {
        continue;
      }
      customToolNameToProviderToolName[tool2.name] = providerToolName;
      providerToolNameToCustomToolName[providerToolName] = tool2.name;
    }
  }
  return {
    toProviderToolName: (customToolName) => {
      var _a32;
      return (_a32 = customToolNameToProviderToolName[customToolName]) != null ? _a32 : customToolName;
    },
    toCustomToolName: (providerToolName) => {
      var _a32;
      return (_a32 = providerToolNameToCustomToolName[providerToolName]) != null ? _a32 : providerToolName;
    }
  };
}
function extractResponseHeaders(response) {
  return Object.fromEntries([...response.headers]);
}
var { btoa, atob } = globalThis;
function convertBase64ToUint8Array(base64String) {
  const base64Url = base64String.replace(/-/g, "+").replace(/_/g, "/");
  const latin1string = atob(base64Url);
  const bytes = new Uint8Array(latin1string.length);
  for (let i = 0; i < latin1string.length; i++) {
    bytes[i] = latin1string.charCodeAt(i);
  }
  return bytes;
}
function convertUint8ArrayToBase64(array2) {
  var _a22;
  if (typeof ((_a22 = globalThis.Buffer) == null ? void 0 : _a22.from) === "function") {
    return globalThis.Buffer.from(
      array2.buffer,
      array2.byteOffset,
      array2.byteLength
    ).toString("base64");
  }
  const chunks = [];
  const chunkSize = 4096;
  for (let i = 0; i < array2.length; i += chunkSize) {
    chunks.push(String.fromCodePoint(...array2.subarray(i, i + chunkSize)));
  }
  return btoa(chunks.join(""));
}
var typedArrayTag = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  Symbol.toStringTag
).get;
Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength"
).get;
function isUint8Array(value) {
  return ArrayBuffer.isView(value) && typedArrayTag.call(value) === "Uint8Array";
}
function convertToBase64(value) {
  return isUint8Array(value) ? convertUint8ArrayToBase64(value) : value;
}
async function cancelResponseBody(response) {
  var _a22;
  try {
    await ((_a22 = response.body) == null ? void 0 : _a22.cancel());
  } catch (e) {
  }
}
var name$2 = "AI_DownloadError";
var marker$2 = `vercel.ai.error.${name$2}`;
var symbol$2 = Symbol.for(marker$2);
var _a$2, _b$1;
var DownloadError2 = class extends (_b$1 = AISDKError, _a$2 = symbol$2, _b$1) {
  constructor({
    url,
    statusCode,
    statusText,
    cause,
    message = cause == null ? `Failed to download ${url}: ${statusCode} ${statusText}` : `Failed to download ${url}: ${cause}`
  }) {
    super({ name: name$2, message, cause });
    this[_a$2] = true;
    this.url = url;
    this.statusCode = statusCode;
    this.statusText = statusText;
  }
  static isInstance(error) {
    return AISDKError.hasMarker(error, marker$2);
  }
};
var DEFAULT_MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024;
async function readResponseWithSizeLimit({
  response,
  url,
  maxBytes = DEFAULT_MAX_DOWNLOAD_SIZE
}) {
  const contentLength = response.headers.get("content-length");
  if (contentLength != null) {
    const length = parseInt(contentLength, 10);
    if (!isNaN(length) && length > maxBytes) {
      await cancelResponseBody(response);
      throw new DownloadError2({
        url,
        message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes (Content-Length: ${length}).`
      });
    }
  }
  const body = response.body;
  if (body == null) {
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        throw new DownloadError2({
          url,
          message: `Download of ${url} exceeded maximum size of ${maxBytes} bytes.`
        });
      }
      chunks.push(value);
    }
  } finally {
    try {
      await reader.cancel();
    } catch (e) {
    } finally {
      reader.releaseLock();
    }
  }
  const result = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
var createIdGenerator = ({
  prefix,
  size = 16,
  alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  separator = "-"
} = {}) => {
  const generator = () => {
    const alphabetLength = alphabet.length;
    const chars = new Array(size);
    for (let i = 0; i < size; i++) {
      chars[i] = alphabet[Math.random() * alphabetLength | 0];
    }
    return chars.join("");
  };
  if (prefix == null) {
    return generator;
  }
  if (alphabet.includes(separator)) {
    throw new InvalidArgumentError$1({
      argument: "separator",
      message: `The separator "${separator}" must not be part of the alphabet "${alphabet}".`
    });
  }
  return () => `${prefix}${separator}${generator()}`;
};
var generateId = createIdGenerator();
function isAbortError(error) {
  return (error instanceof Error || error instanceof DOMException) && (error.name === "AbortError" || error.name === "ResponseAborted" || // Next.js
  error.name === "TimeoutError");
}
var FETCH_FAILED_ERROR_MESSAGES = ["fetch failed", "failed to fetch"];
var RETRYABLE_NETWORK_ERROR_CODES = /* @__PURE__ */ new Set([
  "ConnectionRefused",
  "ConnectionClosed",
  "FailedToOpenSocket",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT"
]);
function findNetworkError(error) {
  const visited = /* @__PURE__ */ new Set();
  let current = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    const errorWithCode = current;
    if (typeof errorWithCode.code === "string" && RETRYABLE_NETWORK_ERROR_CODES.has(errorWithCode.code)) {
      return errorWithCode;
    }
    current = current.cause;
  }
  return void 0;
}
function handleFetchError({
  error,
  url,
  requestBodyValues
}) {
  if (isAbortError(error)) {
    return error;
  }
  if (error instanceof TypeError && FETCH_FAILED_ERROR_MESSAGES.includes(error.message.toLowerCase())) {
    const cause = error.cause;
    if (cause != null) {
      return new APICallError2({
        message: `Cannot connect to API: ${cause.message}`,
        cause,
        url,
        requestBodyValues,
        isRetryable: true
        // retry when network error
      });
    }
  }
  const networkError = findNetworkError(error);
  if (networkError != null) {
    if (APICallError2.isInstance(error)) {
      return new APICallError2({
        message: error.message,
        cause: error.cause,
        url: error.url,
        requestBodyValues: error.requestBodyValues,
        statusCode: error.statusCode,
        responseHeaders: error.responseHeaders,
        responseBody: error.responseBody,
        data: error.data,
        isRetryable: true
      });
    }
    return new APICallError2({
      message: `Cannot connect to API: ${error instanceof Error ? error.message : networkError.message}`,
      cause: error,
      url,
      requestBodyValues,
      isRetryable: true
    });
  }
  return error;
}
function getRuntimeEnvironmentUserAgent(globalThisAny = globalThis) {
  var _a22, _b22, _c;
  if (globalThisAny.window) {
    return `runtime/browser`;
  }
  if ((_a22 = globalThisAny.navigator) == null ? void 0 : _a22.userAgent) {
    return `runtime/${globalThisAny.navigator.userAgent.toLowerCase()}`;
  }
  if ((_c = (_b22 = globalThisAny.process) == null ? void 0 : _b22.versions) == null ? void 0 : _c.node) {
    return `runtime/node.js/${globalThisAny.process.version.substring(0)}`;
  }
  if (globalThisAny.EdgeRuntime) {
    return `runtime/vercel-edge`;
  }
  return "runtime/unknown";
}
function normalizeHeaders(headers) {
  if (headers == null) {
    return {};
  }
  const normalized = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
  } else {
    if (!Array.isArray(headers)) {
      headers = Object.entries(headers);
    }
    for (const [key, value] of headers) {
      if (value != null) {
        normalized[key.toLowerCase()] = value;
      }
    }
  }
  return normalized;
}
function withUserAgentSuffix(headers, ...userAgentSuffixParts) {
  const normalizedHeaders = new Headers(normalizeHeaders(headers));
  const currentUserAgentHeader = normalizedHeaders.get("user-agent") || "";
  normalizedHeaders.set(
    "user-agent",
    [currentUserAgentHeader, ...userAgentSuffixParts].filter(Boolean).join(" ")
  );
  return Object.fromEntries(normalizedHeaders.entries());
}
var VERSION$4 = "4.0.69";
function isNonNullable(value) {
  return value != null;
}
function loadApiKey({
  apiKey,
  environmentVariableName,
  apiKeyParameterName = "apiKey",
  description
}) {
  if (typeof apiKey === "string") {
    return apiKey;
  }
  if (apiKey != null) {
    throw new LoadAPIKeyError2({
      message: `${description} API key must be a string.`
    });
  }
  if (typeof process === "undefined") {
    throw new LoadAPIKeyError2({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables are not supported in this environment.`
    });
  }
  apiKey = define_process_env_default[environmentVariableName];
  if (apiKey == null) {
    throw new LoadAPIKeyError2({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`
    });
  }
  if (typeof apiKey !== "string") {
    throw new LoadAPIKeyError2({
      message: `${description} API key must be a string. The value of the ${environmentVariableName} environment variable is not a string.`
    });
  }
  return apiKey;
}
function loadOptionalSetting({
  settingValue,
  environmentVariableName
}) {
  if (typeof settingValue === "string") {
    return settingValue;
  }
  if (settingValue != null || typeof process === "undefined") {
    return void 0;
  }
  settingValue = define_process_env_default[environmentVariableName];
  if (settingValue == null || typeof settingValue !== "string") {
    return void 0;
  }
  return settingValue;
}
var suspectProtoRx = /"(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])"\s*:/;
var suspectConstructorRx = /"(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)"\s*:/;
function _parse(text2) {
  const obj = JSON.parse(text2);
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  if (suspectProtoRx.test(text2) === false && suspectConstructorRx.test(text2) === false) {
    return obj;
  }
  return filter(obj);
}
function filter(obj) {
  let next = [obj];
  while (next.length) {
    const nodes = next;
    next = [];
    for (const node of nodes) {
      if (Object.prototype.hasOwnProperty.call(node, "__proto__")) {
        throw new SyntaxError("Object contains forbidden prototype property");
      }
      if (Object.prototype.hasOwnProperty.call(node, "constructor") && node.constructor !== null && typeof node.constructor === "object" && Object.prototype.hasOwnProperty.call(node.constructor, "prototype")) {
        throw new SyntaxError("Object contains forbidden prototype property");
      }
      for (const key in node) {
        const value = node[key];
        if (value && typeof value === "object") {
          next.push(value);
        }
      }
    }
  }
  return obj;
}
function secureJsonParse(text2) {
  const { stackTraceLimit } = Error;
  try {
    Error.stackTraceLimit = 0;
  } catch (e) {
    return _parse(text2);
  }
  try {
    return _parse(text2);
  } finally {
    Error.stackTraceLimit = stackTraceLimit;
  }
}
function addAdditionalPropertiesToJsonSchema(jsonSchema2) {
  if (jsonSchema2.type === "object" || Array.isArray(jsonSchema2.type) && jsonSchema2.type.includes("object")) {
    const { additionalProperties } = jsonSchema2;
    jsonSchema2.additionalProperties = additionalProperties != null && typeof additionalProperties !== "boolean" ? visit(additionalProperties) : false;
    const { properties } = jsonSchema2;
    if (properties != null) {
      for (const key of Object.keys(properties)) {
        properties[key] = visit(properties[key]);
      }
    }
  }
  if (jsonSchema2.items != null) {
    jsonSchema2.items = Array.isArray(jsonSchema2.items) ? jsonSchema2.items.map(visit) : visit(jsonSchema2.items);
  }
  if (jsonSchema2.anyOf != null) {
    jsonSchema2.anyOf = jsonSchema2.anyOf.map(visit);
  }
  if (jsonSchema2.allOf != null) {
    jsonSchema2.allOf = jsonSchema2.allOf.map(visit);
  }
  if (jsonSchema2.oneOf != null) {
    jsonSchema2.oneOf = jsonSchema2.oneOf.map(visit);
  }
  const { definitions } = jsonSchema2;
  if (definitions != null) {
    for (const key of Object.keys(definitions)) {
      definitions[key] = visit(definitions[key]);
    }
  }
  return jsonSchema2;
}
function visit(def) {
  if (typeof def === "boolean") return def;
  return addAdditionalPropertiesToJsonSchema(def);
}
var ignoreOverride = /* @__PURE__ */ Symbol(
  "Let zodToJsonSchema decide on which parser to use"
);
var defaultOptions = {
  name: void 0,
  $refStrategy: "root",
  basePath: ["#"],
  effectStrategy: "input",
  pipeStrategy: "all",
  dateStrategy: "format:date-time",
  mapStrategy: "entries",
  removeAdditionalStrategy: "passthrough",
  allowedAdditionalProperties: true,
  rejectedAdditionalProperties: false,
  definitionPath: "definitions",
  strictUnions: false,
  definitions: {},
  errorMessages: false,
  patternStrategy: "escape",
  applyRegexFlags: false,
  emailStrategy: "format:email",
  base64Strategy: "contentEncoding:base64",
  nameStrategy: "ref"
};
var getDefaultOptions = (options) => typeof options === "string" ? {
  ...defaultOptions,
  name: options
} : {
  ...defaultOptions,
  ...options
};
function parseAnyDef() {
  return {};
}
function parseArrayDef(def, refs) {
  var _a22, _b22, _c;
  const res = {
    type: "array"
  };
  if (((_a22 = def.type) == null ? void 0 : _a22._def) && ((_c = (_b22 = def.type) == null ? void 0 : _b22._def) == null ? void 0 : _c.typeName) !== ZodFirstPartyTypeKind.ZodAny) {
    res.items = parseDef(def.type._def, {
      ...refs,
      currentPath: [...refs.currentPath, "items"]
    });
  }
  if (def.minLength) {
    res.minItems = def.minLength.value;
  }
  if (def.maxLength) {
    res.maxItems = def.maxLength.value;
  }
  if (def.exactLength) {
    res.minItems = def.exactLength.value;
    res.maxItems = def.exactLength.value;
  }
  return res;
}
function parseBigintDef(def) {
  const res = {
    type: "integer",
    format: "int64"
  };
  if (!def.checks) return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        if (check.inclusive) {
          res.minimum = check.value;
        } else {
          res.exclusiveMinimum = check.value;
        }
        break;
      case "max":
        if (check.inclusive) {
          res.maximum = check.value;
        } else {
          res.exclusiveMaximum = check.value;
        }
        break;
      case "multipleOf":
        res.multipleOf = check.value;
        break;
    }
  }
  return res;
}
function parseBooleanDef() {
  return { type: "boolean" };
}
function parseBrandedDef(_def, refs) {
  return parseDef(_def.type._def, refs);
}
var parseCatchDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};
function parseDateDef(def, refs, overrideDateStrategy) {
  const strategy = overrideDateStrategy != null ? overrideDateStrategy : refs.dateStrategy;
  if (Array.isArray(strategy)) {
    return {
      anyOf: strategy.map((item, i) => parseDateDef(def, refs, item))
    };
  }
  switch (strategy) {
    case "string":
    case "format:date-time":
      return {
        type: "string",
        format: "date-time"
      };
    case "format:date":
      return {
        type: "string",
        format: "date"
      };
    case "integer":
      return integerDateParser(def);
  }
}
var integerDateParser = (def) => {
  const res = {
    type: "integer",
    format: "unix-time"
  };
  for (const check of def.checks) {
    switch (check.kind) {
      case "min":
        res.minimum = check.value;
        break;
      case "max":
        res.maximum = check.value;
        break;
    }
  }
  return res;
};
function parseDefaultDef(_def, refs) {
  return {
    ...parseDef(_def.innerType._def, refs),
    default: _def.defaultValue()
  };
}
function parseEffectsDef(_def, refs) {
  return refs.effectStrategy === "input" ? parseDef(_def.schema._def, refs) : parseAnyDef();
}
function parseEnumDef(def) {
  return {
    type: "string",
    enum: Array.from(def.values)
  };
}
var isJsonSchema7AllOfType = (type) => {
  if ("type" in type && type.type === "string") return false;
  return "allOf" in type;
};
function parseIntersectionDef(def, refs) {
  const allOf = [
    parseDef(def.left._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "0"]
    }),
    parseDef(def.right._def, {
      ...refs,
      currentPath: [...refs.currentPath, "allOf", "1"]
    })
  ].filter((x) => !!x);
  const mergedAllOf = [];
  allOf.forEach((schema) => {
    if (isJsonSchema7AllOfType(schema)) {
      mergedAllOf.push(...schema.allOf);
    } else {
      let nestedSchema = schema;
      if ("additionalProperties" in schema && schema.additionalProperties === false) {
        const { additionalProperties, ...rest } = schema;
        nestedSchema = rest;
      }
      mergedAllOf.push(nestedSchema);
    }
  });
  return mergedAllOf.length ? { allOf: mergedAllOf } : void 0;
}
function parseLiteralDef(def) {
  const parsedType = typeof def.value;
  if (parsedType !== "bigint" && parsedType !== "number" && parsedType !== "boolean" && parsedType !== "string") {
    return {
      type: Array.isArray(def.value) ? "array" : "object"
    };
  }
  return {
    type: parsedType === "bigint" ? "integer" : parsedType,
    const: def.value
  };
}
var emojiRegex = void 0;
var zodPatterns = {
  /**
   * `c` was changed to `[cC]` to replicate /i flag
   */
  cuid: /^[cC][^\s-]{8,}$/,
  cuid2: /^[0-9a-z]+$/,
  ulid: /^[0-9A-HJKMNP-TV-Z]{26}$/,
  /**
   * `a-z` was added to replicate /i flag
   */
  email: /^(?!\.)(?!.*\.\.)([a-zA-Z0-9_'+\-.]*)[a-zA-Z0-9_+-]@([a-zA-Z0-9][a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}$/,
  /**
   * Constructed a valid Unicode RegExp
   *
   * Lazily instantiate since this type of regex isn't supported
   * in all envs (e.g. React Native).
   *
   * See:
   * https://github.com/colinhacks/zod/issues/2433
   * Fix in Zod:
   * https://github.com/colinhacks/zod/commit/9340fd51e48576a75adc919bff65dbc4a5d4c99b
   */
  emoji: () => {
    if (emojiRegex === void 0) {
      emojiRegex = RegExp(
        "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$",
        "u"
      );
    }
    return emojiRegex;
  },
  /**
   * Unused
   */
  uuid: /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
  /**
   * Unused
   */
  ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/,
  ipv4Cidr: /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/,
  /**
   * Unused
   */
  ipv6: /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/,
  ipv6Cidr: /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/,
  base64: /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/,
  base64url: /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/,
  nanoid: /^[a-zA-Z0-9_-]{21}$/,
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/
};
function parseStringDef(def, refs) {
  const res = {
    type: "string"
  };
  if (def.checks) {
    for (const check of def.checks) {
      switch (check.kind) {
        case "min":
          res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
          break;
        case "max":
          res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
          break;
        case "email":
          switch (refs.emailStrategy) {
            case "format:email":
              addFormat(res, "email", check.message, refs);
              break;
            case "format:idn-email":
              addFormat(res, "idn-email", check.message, refs);
              break;
            case "pattern:zod":
              addPattern(res, zodPatterns.email, check.message, refs);
              break;
          }
          break;
        case "url":
          addFormat(res, "uri", check.message, refs);
          break;
        case "uuid":
          addFormat(res, "uuid", check.message, refs);
          break;
        case "regex":
          addPattern(res, check.regex, check.message, refs);
          break;
        case "cuid":
          addPattern(res, zodPatterns.cuid, check.message, refs);
          break;
        case "cuid2":
          addPattern(res, zodPatterns.cuid2, check.message, refs);
          break;
        case "startsWith":
          addPattern(
            res,
            RegExp(`^${escapeLiteralCheckValue(check.value, refs)}`),
            check.message,
            refs
          );
          break;
        case "endsWith":
          addPattern(
            res,
            RegExp(`${escapeLiteralCheckValue(check.value, refs)}$`),
            check.message,
            refs
          );
          break;
        case "datetime":
          addFormat(res, "date-time", check.message, refs);
          break;
        case "date":
          addFormat(res, "date", check.message, refs);
          break;
        case "time":
          addFormat(res, "time", check.message, refs);
          break;
        case "duration":
          addFormat(res, "duration", check.message, refs);
          break;
        case "length":
          res.minLength = typeof res.minLength === "number" ? Math.max(res.minLength, check.value) : check.value;
          res.maxLength = typeof res.maxLength === "number" ? Math.min(res.maxLength, check.value) : check.value;
          break;
        case "includes": {
          addPattern(
            res,
            RegExp(escapeLiteralCheckValue(check.value, refs)),
            check.message,
            refs
          );
          break;
        }
        case "ip": {
          if (check.version !== "v6") {
            addFormat(res, "ipv4", check.message, refs);
          }
          if (check.version !== "v4") {
            addFormat(res, "ipv6", check.message, refs);
          }
          break;
        }
        case "base64url":
          addPattern(res, zodPatterns.base64url, check.message, refs);
          break;
        case "jwt":
          addPattern(res, zodPatterns.jwt, check.message, refs);
          break;
        case "cidr": {
          if (check.version !== "v6") {
            addPattern(res, zodPatterns.ipv4Cidr, check.message, refs);
          }
          if (check.version !== "v4") {
            addPattern(res, zodPatterns.ipv6Cidr, check.message, refs);
          }
          break;
        }
        case "emoji":
          addPattern(res, zodPatterns.emoji(), check.message, refs);
          break;
        case "ulid": {
          addPattern(res, zodPatterns.ulid, check.message, refs);
          break;
        }
        case "base64": {
          switch (refs.base64Strategy) {
            case "format:binary": {
              addFormat(res, "binary", check.message, refs);
              break;
            }
            case "contentEncoding:base64": {
              res.contentEncoding = "base64";
              break;
            }
            case "pattern:zod": {
              addPattern(res, zodPatterns.base64, check.message, refs);
              break;
            }
          }
          break;
        }
        case "nanoid": {
          addPattern(res, zodPatterns.nanoid, check.message, refs);
        }
      }
    }
  }
  return res;
}
function escapeLiteralCheckValue(literal2, refs) {
  return refs.patternStrategy === "escape" ? escapeNonAlphaNumeric(literal2) : literal2;
}
var ALPHA_NUMERIC = new Set(
  "ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz0123456789"
);
function escapeNonAlphaNumeric(source) {
  let result = "";
  for (let i = 0; i < source.length; i++) {
    if (!ALPHA_NUMERIC.has(source[i])) {
      result += "\\";
    }
    result += source[i];
  }
  return result;
}
function addFormat(schema, value, message, refs) {
  var _a22;
  if (schema.format || ((_a22 = schema.anyOf) == null ? void 0 : _a22.some((x) => x.format))) {
    if (!schema.anyOf) {
      schema.anyOf = [];
    }
    if (schema.format) {
      schema.anyOf.push({
        format: schema.format
      });
      delete schema.format;
    }
    schema.anyOf.push({
      format: value,
      ...message && refs.errorMessages && { errorMessage: { format: message } }
    });
  } else {
    schema.format = value;
  }
}
function addPattern(schema, regex, message, refs) {
  var _a22;
  if (schema.pattern || ((_a22 = schema.allOf) == null ? void 0 : _a22.some((x) => x.pattern))) {
    if (!schema.allOf) {
      schema.allOf = [];
    }
    if (schema.pattern) {
      schema.allOf.push({
        pattern: schema.pattern
      });
      delete schema.pattern;
    }
    schema.allOf.push({
      pattern: stringifyRegExpWithFlags(regex, refs),
      ...message && refs.errorMessages && { errorMessage: { pattern: message } }
    });
  } else {
    schema.pattern = stringifyRegExpWithFlags(regex, refs);
  }
}
function stringifyRegExpWithFlags(regex, refs) {
  var _a22;
  if (!refs.applyRegexFlags || !regex.flags) {
    return regex.source;
  }
  const flags = {
    i: regex.flags.includes("i"),
    // Case-insensitive
    m: regex.flags.includes("m"),
    // `^` and `$` matches adjacent to newline characters
    s: regex.flags.includes("s")
    // `.` matches newlines
  };
  const source = flags.i ? regex.source.toLowerCase() : regex.source;
  let pattern = "";
  let isEscaped = false;
  let inCharGroup = false;
  let inCharRange = false;
  for (let i = 0; i < source.length; i++) {
    if (isEscaped) {
      pattern += source[i];
      isEscaped = false;
      continue;
    }
    if (flags.i) {
      if (inCharGroup) {
        if (source[i].match(/[a-z]/)) {
          if (inCharRange) {
            pattern += source[i];
            pattern += `${source[i - 2]}-${source[i]}`.toUpperCase();
            inCharRange = false;
          } else if (source[i + 1] === "-" && ((_a22 = source[i + 2]) == null ? void 0 : _a22.match(/[a-z]/))) {
            pattern += source[i];
            inCharRange = true;
          } else {
            pattern += `${source[i]}${source[i].toUpperCase()}`;
          }
          continue;
        }
      } else if (source[i].match(/[a-z]/)) {
        pattern += `[${source[i]}${source[i].toUpperCase()}]`;
        continue;
      }
    }
    if (flags.m) {
      if (source[i] === "^") {
        pattern += `(^|(?<=[\r
]))`;
        continue;
      } else if (source[i] === "$") {
        pattern += `($|(?=[\r
]))`;
        continue;
      }
    }
    if (flags.s && source[i] === ".") {
      pattern += inCharGroup ? `${source[i]}\r
` : `[${source[i]}\r
]`;
      continue;
    }
    pattern += source[i];
    if (source[i] === "\\") {
      isEscaped = true;
    } else if (inCharGroup && source[i] === "]") {
      inCharGroup = false;
    } else if (!inCharGroup && source[i] === "[") {
      inCharGroup = true;
    }
  }
  try {
    new RegExp(pattern);
  } catch (e) {
    console.warn(
      `Could not convert regex pattern at ${refs.currentPath.join(
        "/"
      )} to a flag-independent form! Falling back to the flag-ignorant source`
    );
    return regex.source;
  }
  return pattern;
}
function parseRecordDef(def, refs) {
  var _a22, _b22, _c, _d, _e, _f;
  const schema = {
    type: "object",
    additionalProperties: (_a22 = parseDef(def.valueType._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    })) != null ? _a22 : refs.allowedAdditionalProperties
  };
  if (((_b22 = def.keyType) == null ? void 0 : _b22._def.typeName) === ZodFirstPartyTypeKind.ZodString && ((_c = def.keyType._def.checks) == null ? void 0 : _c.length)) {
    const { type, ...keyType } = parseStringDef(def.keyType._def, refs);
    return {
      ...schema,
      propertyNames: keyType
    };
  } else if (((_d = def.keyType) == null ? void 0 : _d._def.typeName) === ZodFirstPartyTypeKind.ZodEnum) {
    return {
      ...schema,
      propertyNames: {
        enum: def.keyType._def.values
      }
    };
  } else if (((_e = def.keyType) == null ? void 0 : _e._def.typeName) === ZodFirstPartyTypeKind.ZodBranded && def.keyType._def.type._def.typeName === ZodFirstPartyTypeKind.ZodString && ((_f = def.keyType._def.type._def.checks) == null ? void 0 : _f.length)) {
    const { type, ...keyType } = parseBrandedDef(
      def.keyType._def,
      refs
    );
    return {
      ...schema,
      propertyNames: keyType
    };
  }
  return schema;
}
function parseMapDef(def, refs) {
  if (refs.mapStrategy === "record") {
    return parseRecordDef(def, refs);
  }
  const keys = parseDef(def.keyType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "0"]
  }) || parseAnyDef();
  const values = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items", "items", "1"]
  }) || parseAnyDef();
  return {
    type: "array",
    maxItems: 125,
    items: {
      type: "array",
      items: [keys, values],
      minItems: 2,
      maxItems: 2
    }
  };
}
function parseNativeEnumDef(def) {
  const object2 = def.values;
  const actualKeys = Object.keys(def.values).filter((key) => {
    return typeof object2[object2[key]] !== "number";
  });
  const actualValues = actualKeys.map((key) => object2[key]);
  const parsedTypes = Array.from(
    new Set(actualValues.map((values) => typeof values))
  );
  return {
    type: parsedTypes.length === 1 ? parsedTypes[0] === "string" ? "string" : "number" : ["string", "number"],
    enum: actualValues
  };
}
function parseNeverDef() {
  return { not: parseAnyDef() };
}
function parseNullDef() {
  return {
    type: "null"
  };
}
var primitiveMappings = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "integer",
  ZodBoolean: "boolean",
  ZodNull: "null"
};
function parseUnionDef(def, refs) {
  const options = def.options instanceof Map ? Array.from(def.options.values()) : def.options;
  if (options.every(
    (x) => x._def.typeName in primitiveMappings && (!x._def.checks || !x._def.checks.length)
  )) {
    const types = options.reduce((types2, x) => {
      const type = primitiveMappings[x._def.typeName];
      return type && !types2.includes(type) ? [...types2, type] : types2;
    }, []);
    return {
      type: types.length > 1 ? types : types[0]
    };
  } else if (options.every((x) => x._def.typeName === "ZodLiteral" && !x.description)) {
    const types = options.reduce(
      (acc, x) => {
        const type = typeof x._def.value;
        switch (type) {
          case "string":
          case "number":
          case "boolean":
            return [...acc, type];
          case "bigint":
            return [...acc, "integer"];
          case "object":
            if (x._def.value === null) return [...acc, "null"];
          case "symbol":
          case "undefined":
          case "function":
          default:
            return acc;
        }
      },
      []
    );
    if (types.length === options.length) {
      const uniqueTypes = types.filter((x, i, a) => a.indexOf(x) === i);
      return {
        type: uniqueTypes.length > 1 ? uniqueTypes : uniqueTypes[0],
        enum: options.reduce(
          (acc, x) => {
            return acc.includes(x._def.value) ? acc : [...acc, x._def.value];
          },
          []
        )
      };
    }
  } else if (options.every((x) => x._def.typeName === "ZodEnum")) {
    return {
      type: "string",
      enum: options.reduce(
        (acc, x) => [
          ...acc,
          ...x._def.values.filter((x2) => !acc.includes(x2))
        ],
        []
      )
    };
  }
  return asAnyOf(def, refs);
}
var asAnyOf = (def, refs) => {
  const anyOf = (def.options instanceof Map ? Array.from(def.options.values()) : def.options).map(
    (x, i) => parseDef(x._def, {
      ...refs,
      currentPath: [...refs.currentPath, "anyOf", `${i}`]
    })
  ).filter(
    (x) => !!x && (!refs.strictUnions || typeof x === "object" && Object.keys(x).length > 0)
  );
  return anyOf.length ? { anyOf } : void 0;
};
function parseNullableDef(def, refs) {
  if (["ZodString", "ZodNumber", "ZodBigInt", "ZodBoolean", "ZodNull"].includes(
    def.innerType._def.typeName
  ) && (!def.innerType._def.checks || !def.innerType._def.checks.length)) {
    return {
      type: [
        primitiveMappings[def.innerType._def.typeName],
        "null"
      ]
    };
  }
  const base = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "0"]
  });
  return base && { anyOf: [base, { type: "null" }] };
}
function parseNumberDef(def) {
  const res = {
    type: "number"
  };
  if (!def.checks) return res;
  for (const check of def.checks) {
    switch (check.kind) {
      case "int":
        res.type = "integer";
        break;
      case "min":
        if (check.inclusive) {
          res.minimum = check.value;
        } else {
          res.exclusiveMinimum = check.value;
        }
        break;
      case "max":
        if (check.inclusive) {
          res.maximum = check.value;
        } else {
          res.exclusiveMaximum = check.value;
        }
        break;
      case "multipleOf":
        res.multipleOf = check.value;
        break;
    }
  }
  return res;
}
function parseObjectDef(def, refs) {
  const result = {
    type: "object",
    properties: {}
  };
  const required = [];
  const shape = def.shape();
  for (const propName in shape) {
    let propDef = shape[propName];
    if (propDef === void 0 || propDef._def === void 0) {
      continue;
    }
    const propOptional = safeIsOptional(propDef);
    const parsedDef = parseDef(propDef._def, {
      ...refs,
      currentPath: [...refs.currentPath, "properties", propName],
      propertyPath: [...refs.currentPath, "properties", propName]
    });
    if (parsedDef === void 0) {
      continue;
    }
    result.properties[propName] = parsedDef;
    if (!propOptional) {
      required.push(propName);
    }
  }
  if (required.length) {
    result.required = required;
  }
  const additionalProperties = decideAdditionalProperties(def, refs);
  if (additionalProperties !== void 0) {
    result.additionalProperties = additionalProperties;
  }
  return result;
}
function decideAdditionalProperties(def, refs) {
  if (def.catchall._def.typeName !== "ZodNever") {
    return parseDef(def.catchall._def, {
      ...refs,
      currentPath: [...refs.currentPath, "additionalProperties"]
    });
  }
  switch (def.unknownKeys) {
    case "passthrough":
      return refs.allowedAdditionalProperties;
    case "strict":
      return refs.rejectedAdditionalProperties;
    case "strip":
      return refs.removeAdditionalStrategy === "strict" ? refs.allowedAdditionalProperties : refs.rejectedAdditionalProperties;
  }
}
function safeIsOptional(schema) {
  try {
    return schema.isOptional();
  } catch (e) {
    return true;
  }
}
var parseOptionalDef = (def, refs) => {
  var _a22;
  if (refs.currentPath.toString() === ((_a22 = refs.propertyPath) == null ? void 0 : _a22.toString())) {
    return parseDef(def.innerType._def, refs);
  }
  const innerSchema = parseDef(def.innerType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "anyOf", "1"]
  });
  return innerSchema ? { anyOf: [{ not: parseAnyDef() }, innerSchema] } : parseAnyDef();
};
var parsePipelineDef = (def, refs) => {
  if (refs.pipeStrategy === "input") {
    return parseDef(def.in._def, refs);
  } else if (refs.pipeStrategy === "output") {
    return parseDef(def.out._def, refs);
  }
  const a = parseDef(def.in._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", "0"]
  });
  const b = parseDef(def.out._def, {
    ...refs,
    currentPath: [...refs.currentPath, "allOf", a ? "1" : "0"]
  });
  return {
    allOf: [a, b].filter((x) => x !== void 0)
  };
};
function parsePromiseDef(def, refs) {
  return parseDef(def.type._def, refs);
}
function parseSetDef(def, refs) {
  const items = parseDef(def.valueType._def, {
    ...refs,
    currentPath: [...refs.currentPath, "items"]
  });
  const schema = {
    type: "array",
    uniqueItems: true,
    items
  };
  if (def.minSize) {
    schema.minItems = def.minSize.value;
  }
  if (def.maxSize) {
    schema.maxItems = def.maxSize.value;
  }
  return schema;
}
function parseTupleDef(def, refs) {
  if (def.rest) {
    return {
      type: "array",
      minItems: def.items.length,
      items: def.items.map(
        (x, i) => parseDef(x._def, {
          ...refs,
          currentPath: [...refs.currentPath, "items", `${i}`]
        })
      ).reduce(
        (acc, x) => x === void 0 ? acc : [...acc, x],
        []
      ),
      additionalItems: parseDef(def.rest._def, {
        ...refs,
        currentPath: [...refs.currentPath, "additionalItems"]
      })
    };
  } else {
    return {
      type: "array",
      minItems: def.items.length,
      maxItems: def.items.length,
      items: def.items.map(
        (x, i) => parseDef(x._def, {
          ...refs,
          currentPath: [...refs.currentPath, "items", `${i}`]
        })
      ).reduce(
        (acc, x) => x === void 0 ? acc : [...acc, x],
        []
      )
    };
  }
}
function parseUndefinedDef() {
  return {
    not: parseAnyDef()
  };
}
function parseUnknownDef() {
  return parseAnyDef();
}
var parseReadonlyDef = (def, refs) => {
  return parseDef(def.innerType._def, refs);
};
var selectParser = (def, typeName, refs) => {
  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodString:
      return parseStringDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNumber:
      return parseNumberDef(def);
    case ZodFirstPartyTypeKind.ZodObject:
      return parseObjectDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBigInt:
      return parseBigintDef(def);
    case ZodFirstPartyTypeKind.ZodBoolean:
      return parseBooleanDef();
    case ZodFirstPartyTypeKind.ZodDate:
      return parseDateDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUndefined:
      return parseUndefinedDef();
    case ZodFirstPartyTypeKind.ZodNull:
      return parseNullDef();
    case ZodFirstPartyTypeKind.ZodArray:
      return parseArrayDef(def, refs);
    case ZodFirstPartyTypeKind.ZodUnion:
    case ZodFirstPartyTypeKind.ZodDiscriminatedUnion:
      return parseUnionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodIntersection:
      return parseIntersectionDef(def, refs);
    case ZodFirstPartyTypeKind.ZodTuple:
      return parseTupleDef(def, refs);
    case ZodFirstPartyTypeKind.ZodRecord:
      return parseRecordDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLiteral:
      return parseLiteralDef(def);
    case ZodFirstPartyTypeKind.ZodEnum:
      return parseEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNativeEnum:
      return parseNativeEnumDef(def);
    case ZodFirstPartyTypeKind.ZodNullable:
      return parseNullableDef(def, refs);
    case ZodFirstPartyTypeKind.ZodOptional:
      return parseOptionalDef(def, refs);
    case ZodFirstPartyTypeKind.ZodMap:
      return parseMapDef(def, refs);
    case ZodFirstPartyTypeKind.ZodSet:
      return parseSetDef(def, refs);
    case ZodFirstPartyTypeKind.ZodLazy:
      return () => def.getter()._def;
    case ZodFirstPartyTypeKind.ZodPromise:
      return parsePromiseDef(def, refs);
    case ZodFirstPartyTypeKind.ZodNaN:
    case ZodFirstPartyTypeKind.ZodNever:
      return parseNeverDef();
    case ZodFirstPartyTypeKind.ZodEffects:
      return parseEffectsDef(def, refs);
    case ZodFirstPartyTypeKind.ZodAny:
      return parseAnyDef();
    case ZodFirstPartyTypeKind.ZodUnknown:
      return parseUnknownDef();
    case ZodFirstPartyTypeKind.ZodDefault:
      return parseDefaultDef(def, refs);
    case ZodFirstPartyTypeKind.ZodBranded:
      return parseBrandedDef(def, refs);
    case ZodFirstPartyTypeKind.ZodReadonly:
      return parseReadonlyDef(def, refs);
    case ZodFirstPartyTypeKind.ZodCatch:
      return parseCatchDef(def, refs);
    case ZodFirstPartyTypeKind.ZodPipeline:
      return parsePipelineDef(def, refs);
    case ZodFirstPartyTypeKind.ZodFunction:
    case ZodFirstPartyTypeKind.ZodVoid:
    case ZodFirstPartyTypeKind.ZodSymbol:
      return void 0;
    default:
      return /* @__PURE__ */ ((_) => void 0)();
  }
};
var getRelativePath = (pathA, pathB) => {
  let i = 0;
  for (; i < pathA.length && i < pathB.length; i++) {
    if (pathA[i] !== pathB[i]) break;
  }
  return [(pathA.length - i).toString(), ...pathB.slice(i)].join("/");
};
function parseDef(def, refs, forceResolution = false) {
  var _a22;
  const seenItem = refs.seen.get(def);
  if (refs.override) {
    const overrideResult = (_a22 = refs.override) == null ? void 0 : _a22.call(
      refs,
      def,
      refs,
      seenItem,
      forceResolution
    );
    if (overrideResult !== ignoreOverride) {
      return overrideResult;
    }
  }
  if (seenItem && !forceResolution) {
    const seenSchema = get$ref(seenItem, refs);
    if (seenSchema !== void 0) {
      return seenSchema;
    }
  }
  const newItem = { def, path: refs.currentPath, jsonSchema: void 0 };
  refs.seen.set(def, newItem);
  const jsonSchemaOrGetter = selectParser(def, def.typeName, refs);
  const jsonSchema2 = typeof jsonSchemaOrGetter === "function" ? parseDef(jsonSchemaOrGetter(), refs) : jsonSchemaOrGetter;
  if (jsonSchema2) {
    addMeta(def, refs, jsonSchema2);
  }
  if (refs.postProcess) {
    const postProcessResult = refs.postProcess(jsonSchema2, def, refs);
    newItem.jsonSchema = jsonSchema2;
    return postProcessResult;
  }
  newItem.jsonSchema = jsonSchema2;
  return jsonSchema2;
}
var get$ref = (item, refs) => {
  switch (refs.$refStrategy) {
    case "root":
      return { $ref: item.path.join("/") };
    case "relative":
      return { $ref: getRelativePath(refs.currentPath, item.path) };
    case "none":
    case "seen": {
      if (item.path.length < refs.currentPath.length && item.path.every((value, index2) => refs.currentPath[index2] === value)) {
        console.warn(
          `Recursive reference detected at ${refs.currentPath.join(
            "/"
          )}! Defaulting to any`
        );
        return parseAnyDef();
      }
      return refs.$refStrategy === "seen" ? parseAnyDef() : void 0;
    }
  }
};
var addMeta = (def, refs, jsonSchema2) => {
  if (def.description) {
    jsonSchema2.description = def.description;
  }
  return jsonSchema2;
};
var getRefs = (options) => {
  const _options = getDefaultOptions(options);
  const currentPath = _options.name !== void 0 ? [..._options.basePath, _options.definitionPath, _options.name] : _options.basePath;
  return {
    ..._options,
    currentPath,
    propertyPath: void 0,
    seen: new Map(
      Object.entries(_options.definitions).map(([name22, def]) => [
        def._def,
        {
          def: def._def,
          path: [..._options.basePath, _options.definitionPath, name22],
          // Resolution of references will be forced even though seen, so it's ok that the schema is undefined here for now.
          jsonSchema: void 0
        }
      ])
    )
  };
};
var zod3ToJsonSchema = (schema, options) => {
  var _a22;
  const refs = getRefs(options);
  let definitions = typeof options === "object" && options.definitions ? Object.entries(options.definitions).reduce(
    (acc, [name32, schema2]) => {
      var _a32;
      return {
        ...acc,
        [name32]: (_a32 = parseDef(
          schema2._def,
          {
            ...refs,
            currentPath: [...refs.basePath, refs.definitionPath, name32]
          },
          true
        )) != null ? _a32 : parseAnyDef()
      };
    },
    {}
  ) : void 0;
  const name22 = typeof options === "string" ? options : (options == null ? void 0 : options.nameStrategy) === "title" ? void 0 : options == null ? void 0 : options.name;
  const main = (_a22 = parseDef(
    schema._def,
    name22 === void 0 ? refs : {
      ...refs,
      currentPath: [...refs.basePath, refs.definitionPath, name22]
    },
    false
  )) != null ? _a22 : parseAnyDef();
  const title = typeof options === "object" && options.name !== void 0 && options.nameStrategy === "title" ? options.name : void 0;
  if (title !== void 0) {
    main.title = title;
  }
  const combined = name22 === void 0 ? definitions ? {
    ...main,
    [refs.definitionPath]: definitions
  } : main : {
    $ref: [
      ...refs.$refStrategy === "relative" ? [] : refs.basePath,
      refs.definitionPath,
      name22
    ].join("/"),
    [refs.definitionPath]: {
      ...definitions,
      [name22]: main
    }
  };
  combined.$schema = "http://json-schema.org/draft-07/schema#";
  return combined;
};
var schemaSymbol = /* @__PURE__ */ Symbol.for("vercel.ai.schema");
function lazySchema(createSchema) {
  let schema;
  return () => {
    if (schema == null) {
      schema = createSchema();
    }
    return schema;
  };
}
function jsonSchema(jsonSchema2, {
  validate
} = {}) {
  return {
    [schemaSymbol]: true,
    _type: void 0,
    // should never be used directly
    get jsonSchema() {
      if (typeof jsonSchema2 === "function") {
        jsonSchema2 = jsonSchema2();
      }
      return jsonSchema2;
    },
    validate
  };
}
function isSchema(value) {
  return typeof value === "object" && value !== null && schemaSymbol in value && value[schemaSymbol] === true && "jsonSchema" in value && "validate" in value;
}
function asSchema(schema) {
  return schema == null ? jsonSchema({
    type: "object",
    properties: {},
    additionalProperties: false
  }) : isSchema(schema) ? schema : "~standard" in schema ? schema["~standard"].vendor === "zod" ? zodSchema(schema) : standardSchema(schema) : schema();
}
function standardSchema(standardSchema2) {
  return jsonSchema(
    () => {
      if (!hasStandardJsonSchema(standardSchema2)) {
        throw new Error(
          `Standard schema vendor '${standardSchema2["~standard"].vendor}' does not support JSON Schema conversion.`
        );
      }
      return addAdditionalPropertiesToJsonSchema(
        standardSchema2["~standard"].jsonSchema.input({
          target: "draft-07"
        })
      );
    },
    {
      validate: async (value) => {
        const result = await standardSchema2["~standard"].validate(value);
        return result.issues === void 0 && "value" in result ? { success: true, value: result.value } : {
          success: false,
          error: new TypeValidationError({
            value,
            cause: result.issues
          })
        };
      }
    }
  );
}
function hasStandardJsonSchema(schema) {
  return schema["~standard"].jsonSchema != null;
}
function zod3Schema(zodSchema2, options) {
  var _a22;
  const useReferences = (_a22 = void 0) != null ? _a22 : false;
  return jsonSchema(
    // defer json schema creation to avoid unnecessary computation when only validation is needed
    () => zod3ToJsonSchema(zodSchema2, {
      $refStrategy: useReferences ? "root" : "none"
    }),
    {
      validate: async (value) => {
        const result = await zodSchema2.safeParseAsync(value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      }
    }
  );
}
function zod4Schema(zodSchema2, options) {
  var _a22;
  const useReferences = (_a22 = void 0) != null ? _a22 : false;
  return jsonSchema(
    // defer json schema creation to avoid unnecessary computation when only validation is needed
    () => addAdditionalPropertiesToJsonSchema(
      toJSONSchema(zodSchema2, {
        target: "draft-7",
        io: "input",
        reused: useReferences ? "ref" : "inline"
      })
    ),
    {
      validate: async (value) => {
        const result = await safeParseAsync(zodSchema2, value);
        return result.success ? { success: true, value: result.data } : { success: false, error: result.error };
      }
    }
  );
}
function isZod4Schema(zodSchema2) {
  return "_zod" in zodSchema2;
}
function zodSchema(zodSchema2, options) {
  if (isZod4Schema(zodSchema2)) {
    return zod4Schema(zodSchema2);
  } else {
    return zod3Schema(zodSchema2);
  }
}
async function validateTypes({
  value,
  schema,
  context: context2
}) {
  const result = await safeValidateTypes({ value, schema, context: context2 });
  if (!result.success) {
    throw TypeValidationError.wrap({ value, cause: result.error, context: context2 });
  }
  return result.value;
}
async function safeValidateTypes({
  value,
  schema,
  context: context2
}) {
  const actualSchema = asSchema(schema);
  try {
    if (actualSchema.validate == null) {
      return { success: true, value, rawValue: value };
    }
    const result = await actualSchema.validate(value);
    if (result.success) {
      return { success: true, value: result.value, rawValue: value };
    }
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: result.error, context: context2 }),
      rawValue: value
    };
  } catch (error) {
    return {
      success: false,
      error: TypeValidationError.wrap({ value, cause: error, context: context2 }),
      rawValue: value
    };
  }
}
async function parseJSON({
  text: text2,
  schema
}) {
  try {
    const value = secureJsonParse(text2);
    if (schema == null) {
      return value;
    }
    return validateTypes({ value, schema });
  } catch (error) {
    if (JSONParseError2.isInstance(error) || TypeValidationError.isInstance(error)) {
      throw error;
    }
    throw new JSONParseError2({ text: text2, cause: error });
  }
}
async function safeParseJSON({
  text: text2,
  schema
}) {
  try {
    const value = secureJsonParse(text2);
    if (schema == null) {
      return { success: true, value, rawValue: value };
    }
    return await safeValidateTypes({ value, schema });
  } catch (error) {
    return {
      success: false,
      error: JSONParseError2.isInstance(error) ? error : new JSONParseError2({ text: text2, cause: error }),
      rawValue: void 0
    };
  }
}
var DEFAULT_MAX_EVENT_SIZE = 64 * 1024 * 1024;
function parseJsonEventStream({
  stream,
  schema,
  maxEventSize = DEFAULT_MAX_EVENT_SIZE
}) {
  return stream.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream({ maxBufferSize: maxEventSize })).pipeThrough(
    new TransformStream({
      async transform({ data }, controller) {
        if (data === "[DONE]") {
          return;
        }
        controller.enqueue(await safeParseJSON({ text: data, schema }));
      }
    })
  );
}
async function parseProviderOptions({
  provider,
  providerOptions,
  schema
}) {
  if ((providerOptions == null ? void 0 : providerOptions[provider]) == null) {
    return void 0;
  }
  const parsedProviderOptions = await safeValidateTypes({
    value: providerOptions[provider],
    schema
  });
  if (!parsedProviderOptions.success) {
    throw new InvalidArgumentError$1({
      argument: "providerOptions",
      message: `invalid ${provider} provider options`,
      cause: parsedProviderOptions.error
    });
  }
  return parsedProviderOptions.value;
}
var getOriginalFetch2 = () => globalThis.fetch;
var postJsonToApi = async ({
  url,
  headers,
  body,
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch: fetch2
}) => postToApi({
  url,
  headers: {
    "Content-Type": "application/json",
    ...headers
  },
  body: {
    content: JSON.stringify(body),
    values: body
  },
  failedResponseHandler,
  successfulResponseHandler,
  abortSignal,
  fetch: fetch2
});
var postToApi = async ({
  url,
  headers = {},
  body,
  successfulResponseHandler,
  failedResponseHandler,
  abortSignal,
  fetch: fetch2 = getOriginalFetch2()
}) => {
  try {
    const response = await fetch2(url, {
      method: "POST",
      headers: withUserAgentSuffix(
        headers,
        `ai-sdk/provider-utils/${VERSION$4}`,
        getRuntimeEnvironmentUserAgent()
      ),
      body: body.content,
      signal: abortSignal
    });
    const responseHeaders = extractResponseHeaders(response);
    if (!response.ok) {
      let errorInformation;
      try {
        errorInformation = await failedResponseHandler({
          response,
          url,
          requestBodyValues: body.values
        });
      } catch (error) {
        if (isAbortError(error) || APICallError2.isInstance(error)) {
          throw error;
        }
        throw new APICallError2({
          message: "Failed to process error response",
          cause: error,
          statusCode: response.status,
          url,
          responseHeaders,
          requestBodyValues: body.values
        });
      }
      throw errorInformation.value;
    }
    try {
      return await successfulResponseHandler({
        response,
        url,
        requestBodyValues: body.values
      });
    } catch (error) {
      if (error instanceof Error) {
        if (isAbortError(error) || APICallError2.isInstance(error)) {
          throw error;
        }
      }
      throw new APICallError2({
        message: "Failed to process successful response",
        cause: error,
        statusCode: response.status,
        url,
        responseHeaders,
        requestBodyValues: body.values
      });
    }
  } catch (error) {
    throw handleFetchError({ error, url, requestBodyValues: body.values });
  }
};
function tool(tool2) {
  return tool2;
}
function createProviderToolFactory({
  id,
  inputSchema
}) {
  return ({
    execute,
    outputSchema: outputSchema2,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }) => tool({
    type: "provider",
    id,
    args,
    inputSchema,
    outputSchema: outputSchema2,
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable
  });
}
function createProviderToolFactoryWithOutputSchema({
  id,
  inputSchema,
  outputSchema: outputSchema2,
  supportsDeferredResults
}) {
  return ({
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    ...args
  }) => tool({
    type: "provider",
    id,
    args,
    inputSchema,
    outputSchema: outputSchema2,
    execute,
    needsApproval,
    toModelOutput,
    onInputStart,
    onInputDelta,
    onInputAvailable,
    supportsDeferredResults
  });
}
async function resolve(value) {
  if (typeof value === "function") {
    value = value();
  }
  return value;
}
var textDecoder = new TextDecoder();
function wrapResponseBodyStream({
  stream,
  url,
  requestBodyValues,
  statusCode,
  responseHeaders
}) {
  const reader = stream.getReader();
  let readerReleased = false;
  const releaseReader = () => {
    if (!readerReleased) {
      reader.releaseLock();
      readerReleased = true;
    }
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          releaseReader();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        releaseReader();
        if (isAbortError(error)) {
          controller.error(error);
          return;
        }
        controller.error(
          handleFetchError({
            error: new APICallError2({
              message: "Failed to process successful response",
              cause: error,
              statusCode,
              url,
              responseHeaders,
              requestBodyValues
            }),
            url,
            requestBodyValues
          })
        );
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        releaseReader();
      }
    }
  });
}
async function readResponseBodyAsText({
  response,
  url
}) {
  return textDecoder.decode(
    await readResponseWithSizeLimit({
      response,
      url
    })
  );
}
var createJsonErrorResponseHandler = ({
  errorSchema,
  errorToMessage,
  isRetryable
}) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await readResponseBodyAsText({ response, url });
  const responseHeaders = extractResponseHeaders(response);
  if (responseBody.trim() === "") {
    return {
      responseHeaders,
      value: new APICallError2({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
  try {
    const parsedError = await parseJSON({
      text: responseBody,
      schema: errorSchema
    });
    return {
      responseHeaders,
      value: new APICallError2({
        message: errorToMessage(parsedError),
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        data: parsedError,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response, parsedError)
      })
    };
  } catch (parseError) {
    return {
      responseHeaders,
      value: new APICallError2({
        message: response.statusText,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders,
        responseBody,
        isRetryable: isRetryable == null ? void 0 : isRetryable(response)
      })
    };
  }
};
var createEventSourceResponseHandler = (chunkSchema, {
  maxEventSize
} = {}) => async ({ response, url, requestBodyValues }) => {
  const responseHeaders = extractResponseHeaders(response);
  if (response.body == null) {
    throw new EmptyResponseBodyError2({});
  }
  return {
    responseHeaders,
    value: parseJsonEventStream({
      stream: wrapResponseBodyStream({
        stream: response.body,
        url,
        requestBodyValues,
        statusCode: response.status,
        responseHeaders
      }),
      schema: chunkSchema,
      maxEventSize
    })
  };
};
var createJsonResponseHandler = (responseSchema) => async ({ response, url, requestBodyValues }) => {
  const responseBody = await readResponseBodyAsText({ response, url });
  const parsedResult = await safeParseJSON({
    text: responseBody,
    schema: responseSchema
  });
  const responseHeaders = extractResponseHeaders(response);
  if (!parsedResult.success) {
    throw new APICallError2({
      message: "Invalid JSON response",
      cause: parsedResult.error,
      statusCode: response.status,
      responseHeaders,
      responseBody,
      url,
      requestBodyValues
    });
  }
  return {
    responseHeaders,
    value: parsedResult.value,
    rawValue: parsedResult.rawValue
  };
};
function withoutTrailingSlash(url) {
  return url == null ? void 0 : url.replace(/\/$/, "");
}
function stringifyWithBigIntAndCycles(value) {
  const ancestors = [];
  return JSON.stringify(value, function(_key, value2) {
    if (typeof value2 === "bigint") {
      return value2.toString();
    }
    if (typeof value2 !== "object" || value2 === null) {
      return value2;
    }
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop();
    }
    if (ancestors.includes(value2)) {
      return "[Circular]";
    }
    ancestors.push(value2);
    return value2;
  });
}
var VERSION$3 = "3.0.145";
var anthropicErrorDataSchema = lazySchema(
  () => zodSchema(
    object$1({
      type: literal("error"),
      error: object$1({
        type: string(),
        message: string()
      })
    })
  )
);
var anthropicFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: anthropicErrorDataSchema,
  errorToMessage: (data) => data.error.message
});
var anthropicStopDetailsSchema = () => object$1({
  type: string(),
  category: string().nullish(),
  explanation: string().nullish(),
  recommended_model: string().nullish()
});
var anthropicSafeguardResultSchema = () => object$1({
  type: string(),
  status: object$1({
    type: string(),
    tool_uses: record(
      string(),
      object$1({
        type: string(),
        outcome: string().nullish(),
        explanation: string().nullish()
      })
    ).nullish()
  })
});
var anthropicToolCallCallerSchema = () => union([
  object$1({
    type: literal("code_execution_20250825"),
    tool_id: string()
  }),
  object$1({
    type: literal("code_execution_20260120"),
    tool_id: string()
  }),
  object$1({
    type: literal("direct")
  })
]);
var anthropicInputTransformationSchema = () => object$1({
  type: string(),
  path: string(),
  reason: string()
});
var anthropicMessagesResponseSchema = lazySchema(
  () => zodSchema(
    object$1({
      type: literal("message"),
      id: string().nullish(),
      model: string().nullish(),
      content: array$1(
        discriminatedUnion("type", [
          object$1({
            type: literal("text"),
            text: string(),
            citations: array$1(
              discriminatedUnion("type", [
                object$1({
                  type: literal("web_search_result_location"),
                  cited_text: string(),
                  url: string(),
                  title: string(),
                  encrypted_index: string()
                }),
                object$1({
                  type: literal("page_location"),
                  cited_text: string(),
                  document_index: number(),
                  document_title: string().nullable(),
                  start_page_number: number(),
                  end_page_number: number()
                }),
                object$1({
                  type: literal("char_location"),
                  cited_text: string(),
                  document_index: number(),
                  document_title: string().nullable(),
                  start_char_index: number(),
                  end_char_index: number()
                })
              ])
            ).optional()
          }),
          object$1({
            type: literal("thinking"),
            thinking: string(),
            signature: string()
          }),
          object$1({
            type: literal("redacted_thinking"),
            data: string()
          }),
          object$1({
            type: literal("compaction"),
            content: string()
          }),
          object$1({
            type: literal("tool_use"),
            id: string(),
            name: string(),
            input: unknown(),
            // Programmatic tool calling: caller info when triggered from code execution
            caller: anthropicToolCallCallerSchema().optional(),
            // Toolsets (e.g. computer toolset): name of the toolset this member call belongs to
            toolset_name: string().nullish()
          }),
          object$1({
            type: literal("server_tool_use"),
            id: string(),
            name: string(),
            input: record(string(), unknown()).nullish(),
            caller: anthropicToolCallCallerSchema().optional()
          }),
          object$1({
            type: literal("mcp_tool_use"),
            id: string(),
            name: string(),
            input: unknown(),
            server_name: string()
          }),
          object$1({
            type: literal("mcp_tool_result"),
            tool_use_id: string(),
            is_error: boolean(),
            content: array$1(
              union([
                string(),
                object$1({ type: literal("text"), text: string() })
              ])
            )
          }),
          object$1({
            type: literal("web_fetch_tool_result"),
            tool_use_id: string(),
            caller: anthropicToolCallCallerSchema().optional(),
            content: union([
              object$1({
                type: literal("web_fetch_result"),
                url: string(),
                retrieved_at: string(),
                content: object$1({
                  type: literal("document"),
                  title: string().nullable(),
                  citations: object$1({ enabled: boolean() }).optional(),
                  source: union([
                    object$1({
                      type: literal("base64"),
                      media_type: literal("application/pdf"),
                      data: string()
                    }),
                    object$1({
                      type: literal("text"),
                      media_type: literal("text/plain"),
                      data: string()
                    })
                  ])
                })
              }),
              object$1({
                type: literal("web_fetch_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          object$1({
            type: literal("web_search_tool_result"),
            tool_use_id: string(),
            caller: anthropicToolCallCallerSchema().optional(),
            content: union([
              array$1(
                object$1({
                  type: literal("web_search_result"),
                  url: string(),
                  title: string(),
                  encrypted_content: string(),
                  page_age: string().nullish()
                })
              ),
              object$1({
                type: literal("web_search_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // code execution results for code_execution_20250522 tool:
          object$1({
            type: literal("code_execution_tool_result"),
            tool_use_id: string(),
            content: union([
              object$1({
                type: literal("code_execution_result"),
                stdout: string(),
                stderr: string(),
                return_code: number(),
                content: array$1(
                  object$1({
                    type: literal("code_execution_output"),
                    file_id: string()
                  })
                ).optional().default([])
              }),
              object$1({
                type: literal("encrypted_code_execution_result"),
                encrypted_stdout: string(),
                stderr: string(),
                return_code: number(),
                content: array$1(
                  object$1({
                    type: literal("code_execution_output"),
                    file_id: string()
                  })
                ).optional().default([])
              }),
              object$1({
                type: literal("code_execution_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // bash code execution results for code_execution_20250825 tool:
          object$1({
            type: literal("bash_code_execution_tool_result"),
            tool_use_id: string(),
            content: discriminatedUnion("type", [
              object$1({
                type: literal("bash_code_execution_result"),
                content: array$1(
                  object$1({
                    type: literal("bash_code_execution_output"),
                    file_id: string()
                  })
                ),
                stdout: string(),
                stderr: string(),
                return_code: number()
              }),
              object$1({
                type: literal("bash_code_execution_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // text editor code execution results for code_execution_20250825 tool:
          object$1({
            type: literal("text_editor_code_execution_tool_result"),
            tool_use_id: string(),
            content: discriminatedUnion("type", [
              object$1({
                type: literal("text_editor_code_execution_tool_result_error"),
                error_code: string()
              }),
              object$1({
                type: literal("text_editor_code_execution_view_result"),
                content: string(),
                file_type: string(),
                num_lines: number().nullable(),
                start_line: number().nullable(),
                total_lines: number().nullable()
              }),
              object$1({
                type: literal("text_editor_code_execution_create_result"),
                is_file_update: boolean()
              }),
              object$1({
                type: literal(
                  "text_editor_code_execution_str_replace_result"
                ),
                lines: array$1(string()).nullable(),
                new_lines: number().nullable(),
                new_start: number().nullable(),
                old_lines: number().nullable(),
                old_start: number().nullable()
              })
            ])
          }),
          // tool search tool results for tool_search_tool_regex_20251119 and tool_search_tool_bm25_20251119:
          object$1({
            type: literal("tool_search_tool_result"),
            tool_use_id: string(),
            content: union([
              object$1({
                type: literal("tool_search_tool_search_result"),
                tool_references: array$1(
                  object$1({
                    type: literal("tool_reference"),
                    tool_name: string()
                  })
                )
              }),
              object$1({
                type: literal("tool_search_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // advisor results for advisor_20260301:
          object$1({
            type: literal("advisor_tool_result"),
            tool_use_id: string(),
            content: discriminatedUnion("type", [
              object$1({
                type: literal("advisor_result"),
                text: string()
              }),
              object$1({
                type: literal("advisor_redacted_result"),
                encrypted_content: string()
              }),
              object$1({
                type: literal("advisor_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // Server-side fallback marker. Parsed so the response validates, but
          // dropped from the content output (the AI SDK has no model-hop
          // primitive). The hop remains observable via usage.iterations.
          object$1({
            type: literal("fallback")
          })
        ])
      ),
      stop_reason: string().nullish(),
      stop_sequence: string().nullish(),
      stop_details: anthropicStopDetailsSchema().nullish(),
      input_transformations: array$1(anthropicInputTransformationSchema()).nullish(),
      safeguard_results: array$1(anthropicSafeguardResultSchema()).nullish(),
      usage: looseObject({
        input_tokens: number(),
        output_tokens: number(),
        output_tokens_details: object$1({
          thinking_tokens: number().nullish()
        }).nullish(),
        cache_creation_input_tokens: number().nullish(),
        cache_read_input_tokens: number().nullish(),
        iterations: array$1(
          object$1({
            type: union([
              literal("compaction"),
              literal("message"),
              literal("advisor_message"),
              literal("fallback_message")
            ]),
            model: string().nullish(),
            input_tokens: number(),
            output_tokens: number(),
            cache_creation_input_tokens: number().nullish(),
            cache_read_input_tokens: number().nullish()
          })
        ).nullish()
      }),
      container: object$1({
        expires_at: string(),
        id: string(),
        skills: array$1(
          object$1({
            type: union([literal("anthropic"), literal("custom")]),
            skill_id: string(),
            version: string()
          })
        ).nullish()
      }).nullish(),
      context_management: object$1({
        applied_edits: array$1(
          union([
            object$1({
              type: literal("clear_tool_uses_20250919"),
              cleared_tool_uses: number(),
              cleared_input_tokens: number()
            }),
            object$1({
              type: literal("clear_thinking_20251015"),
              cleared_thinking_turns: number(),
              cleared_input_tokens: number()
            }),
            object$1({
              type: literal("compact_20260112")
            })
          ])
        )
      }).nullish()
    })
  )
);
var anthropicMessagesChunkSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("type", [
      object$1({
        type: literal("message_start"),
        message: object$1({
          id: string().nullish(),
          model: string().nullish(),
          role: string().nullish(),
          usage: looseObject({
            input_tokens: number(),
            cache_creation_input_tokens: number().nullish(),
            cache_read_input_tokens: number().nullish()
          }),
          // Programmatic tool calling: content may be pre-populated for deferred tool calls
          content: array$1(
            discriminatedUnion("type", [
              object$1({
                type: literal("tool_use"),
                id: string(),
                name: string(),
                input: unknown(),
                caller: anthropicToolCallCallerSchema().optional(),
                toolset_name: string().nullish()
              })
            ])
          ).nullish(),
          stop_reason: string().nullish(),
          input_transformations: array$1(anthropicInputTransformationSchema()).nullish(),
          container: object$1({
            expires_at: string(),
            id: string()
          }).nullish()
        })
      }),
      object$1({
        type: literal("content_block_start"),
        index: number(),
        content_block: discriminatedUnion("type", [
          object$1({
            type: literal("text"),
            text: string()
          }),
          object$1({
            type: literal("thinking"),
            thinking: string()
          }),
          object$1({
            type: literal("tool_use"),
            id: string(),
            name: string(),
            // Programmatic tool calling: input may be present directly for deferred tool calls
            input: record(string(), unknown()).optional(),
            // Programmatic tool calling: caller info when triggered from code execution
            caller: anthropicToolCallCallerSchema().optional(),
            // Toolsets (e.g. computer toolset): name of the toolset this member call belongs to
            toolset_name: string().nullish()
          }),
          object$1({
            type: literal("redacted_thinking"),
            data: string()
          }),
          object$1({
            type: literal("compaction"),
            content: string().nullish()
          }),
          object$1({
            type: literal("server_tool_use"),
            id: string(),
            name: string(),
            input: record(string(), unknown()).nullish(),
            caller: anthropicToolCallCallerSchema().optional()
          }),
          object$1({
            type: literal("mcp_tool_use"),
            id: string(),
            name: string(),
            input: unknown(),
            server_name: string()
          }),
          object$1({
            type: literal("mcp_tool_result"),
            tool_use_id: string(),
            is_error: boolean(),
            content: array$1(
              union([
                string(),
                object$1({ type: literal("text"), text: string() })
              ])
            )
          }),
          object$1({
            type: literal("web_fetch_tool_result"),
            tool_use_id: string(),
            caller: anthropicToolCallCallerSchema().optional(),
            content: union([
              object$1({
                type: literal("web_fetch_result"),
                url: string(),
                retrieved_at: string(),
                content: object$1({
                  type: literal("document"),
                  title: string().nullable(),
                  citations: object$1({ enabled: boolean() }).optional(),
                  source: union([
                    object$1({
                      type: literal("base64"),
                      media_type: literal("application/pdf"),
                      data: string()
                    }),
                    object$1({
                      type: literal("text"),
                      media_type: literal("text/plain"),
                      data: string()
                    })
                  ])
                })
              }),
              object$1({
                type: literal("web_fetch_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          object$1({
            type: literal("web_search_tool_result"),
            tool_use_id: string(),
            caller: anthropicToolCallCallerSchema().optional(),
            content: union([
              array$1(
                object$1({
                  type: literal("web_search_result"),
                  url: string(),
                  title: string(),
                  encrypted_content: string(),
                  page_age: string().nullish()
                })
              ),
              object$1({
                type: literal("web_search_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // code execution results for code_execution_20250522 tool:
          object$1({
            type: literal("code_execution_tool_result"),
            tool_use_id: string(),
            content: union([
              object$1({
                type: literal("code_execution_result"),
                stdout: string(),
                stderr: string(),
                return_code: number(),
                content: array$1(
                  object$1({
                    type: literal("code_execution_output"),
                    file_id: string()
                  })
                ).optional().default([])
              }),
              object$1({
                type: literal("encrypted_code_execution_result"),
                encrypted_stdout: string(),
                stderr: string(),
                return_code: number(),
                content: array$1(
                  object$1({
                    type: literal("code_execution_output"),
                    file_id: string()
                  })
                ).optional().default([])
              }),
              object$1({
                type: literal("code_execution_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // bash code execution results for code_execution_20250825 tool:
          object$1({
            type: literal("bash_code_execution_tool_result"),
            tool_use_id: string(),
            content: discriminatedUnion("type", [
              object$1({
                type: literal("bash_code_execution_result"),
                content: array$1(
                  object$1({
                    type: literal("bash_code_execution_output"),
                    file_id: string()
                  })
                ),
                stdout: string(),
                stderr: string(),
                return_code: number()
              }),
              object$1({
                type: literal("bash_code_execution_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // text editor code execution results for code_execution_20250825 tool:
          object$1({
            type: literal("text_editor_code_execution_tool_result"),
            tool_use_id: string(),
            content: discriminatedUnion("type", [
              object$1({
                type: literal("text_editor_code_execution_tool_result_error"),
                error_code: string()
              }),
              object$1({
                type: literal("text_editor_code_execution_view_result"),
                content: string(),
                file_type: string(),
                num_lines: number().nullable(),
                start_line: number().nullable(),
                total_lines: number().nullable()
              }),
              object$1({
                type: literal("text_editor_code_execution_create_result"),
                is_file_update: boolean()
              }),
              object$1({
                type: literal(
                  "text_editor_code_execution_str_replace_result"
                ),
                lines: array$1(string()).nullable(),
                new_lines: number().nullable(),
                new_start: number().nullable(),
                old_lines: number().nullable(),
                old_start: number().nullable()
              })
            ])
          }),
          // tool search tool results for tool_search_tool_regex_20251119 and tool_search_tool_bm25_20251119:
          object$1({
            type: literal("tool_search_tool_result"),
            tool_use_id: string(),
            content: union([
              object$1({
                type: literal("tool_search_tool_search_result"),
                tool_references: array$1(
                  object$1({
                    type: literal("tool_reference"),
                    tool_name: string()
                  })
                )
              }),
              object$1({
                type: literal("tool_search_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // advisor results for advisor_20260301:
          object$1({
            type: literal("advisor_tool_result"),
            tool_use_id: string(),
            content: discriminatedUnion("type", [
              object$1({
                type: literal("advisor_result"),
                text: string()
              }),
              object$1({
                type: literal("advisor_redacted_result"),
                encrypted_content: string()
              }),
              object$1({
                type: literal("advisor_tool_result_error"),
                error_code: string()
              })
            ])
          }),
          // Server-side fallback marker; dropped from content output (see the
          // response schema). The hop remains observable via usage.iterations.
          object$1({
            type: literal("fallback")
          })
        ])
      }),
      object$1({
        type: literal("content_block_delta"),
        index: number(),
        delta: discriminatedUnion("type", [
          object$1({
            type: literal("input_json_delta"),
            partial_json: string()
          }),
          object$1({
            type: literal("text_delta"),
            text: string()
          }),
          object$1({
            type: literal("thinking_delta"),
            thinking: string()
          }),
          object$1({
            type: literal("signature_delta"),
            signature: string()
          }),
          object$1({
            type: literal("compaction_delta"),
            content: string().nullish()
          }),
          object$1({
            type: literal("citations_delta"),
            citation: discriminatedUnion("type", [
              object$1({
                type: literal("web_search_result_location"),
                cited_text: string(),
                url: string(),
                title: string(),
                encrypted_index: string()
              }),
              object$1({
                type: literal("page_location"),
                cited_text: string(),
                document_index: number(),
                document_title: string().nullable(),
                start_page_number: number(),
                end_page_number: number()
              }),
              object$1({
                type: literal("char_location"),
                cited_text: string(),
                document_index: number(),
                document_title: string().nullable(),
                start_char_index: number(),
                end_char_index: number()
              })
            ])
          })
        ])
      }),
      object$1({
        type: literal("content_block_stop"),
        index: number()
      }),
      object$1({
        type: literal("error"),
        error: object$1({
          type: string(),
          message: string()
        })
      }),
      object$1({
        type: literal("message_delta"),
        delta: object$1({
          stop_reason: string().nullish(),
          stop_sequence: string().nullish(),
          stop_details: anthropicStopDetailsSchema().nullish(),
          safeguard_results: array$1(anthropicSafeguardResultSchema()).nullish(),
          container: object$1({
            expires_at: string(),
            id: string(),
            skills: array$1(
              object$1({
                type: union([
                  literal("anthropic"),
                  literal("custom")
                ]),
                skill_id: string(),
                version: string()
              })
            ).nullish()
          }).nullish()
        }),
        usage: looseObject({
          input_tokens: number().nullish(),
          output_tokens: number(),
          output_tokens_details: object$1({
            thinking_tokens: number().nullish()
          }).nullish(),
          cache_creation_input_tokens: number().nullish(),
          cache_read_input_tokens: number().nullish(),
          iterations: array$1(
            object$1({
              type: union([
                literal("compaction"),
                literal("message"),
                literal("advisor_message"),
                literal("fallback_message")
              ]),
              model: string().nullish(),
              input_tokens: number(),
              output_tokens: number(),
              cache_creation_input_tokens: number().nullish(),
              cache_read_input_tokens: number().nullish()
            })
          ).nullish()
        }),
        input_transformations: array$1(anthropicInputTransformationSchema()).nullish(),
        context_management: object$1({
          applied_edits: array$1(
            union([
              object$1({
                type: literal("clear_tool_uses_20250919"),
                cleared_tool_uses: number(),
                cleared_input_tokens: number()
              }),
              object$1({
                type: literal("clear_thinking_20251015"),
                cleared_thinking_turns: number(),
                cleared_input_tokens: number()
              }),
              object$1({
                type: literal("compact_20260112")
              })
            ])
          )
        }).nullish()
      }),
      object$1({
        type: literal("message_stop")
      }),
      object$1({
        type: literal("ping")
      })
    ])
  )
);
var anthropicReasoningMetadataSchema = lazySchema(
  () => zodSchema(
    object$1({
      signature: string().optional(),
      redactedData: string().optional()
    })
  )
);
var anthropicFilePartProviderOptions = lazySchema(
  () => zodSchema(
    object$1({
      /**
       * Citation configuration for this document.
       * When enabled, this document will generate citations in the response.
       */
      citations: object$1({
        /**
         * Enable citations for this document
         */
        enabled: boolean()
      }).optional(),
      /**
       * Custom title for the document.
       * If not provided, the filename will be used.
       */
      title: string().optional(),
      /**
       * Context about the document that will be passed to the model
       * but not used towards cited content.
       * Useful for storing document metadata as text or stringified JSON.
       */
      context: string().optional()
    })
  )
);
var anthropicSystemMessageProviderOptions = lazySchema(
  () => zodSchema(
    object$1({
      /**
       * Clears this mid-conversation system message after the current turn.
       *
       * Requires the `mid-conversation-system-clear-at-2026-08-21` beta,
       * which is added automatically.
       */
      clearAt: literal("next_user_message").optional(),
      /**
       * Sets the model effort from the next user turn until a later message
       * changes it. An effort-only system message with empty content can appear
       * first. The required `mid-conversation-output-config-2026-07-01` beta is
       * added automatically.
       */
      effort: _enum(["low", "medium", "high", "xhigh", "max"]).optional(),
      /**
       * Mid-conversation tool changes. Adds or removes tools from the
       * conversation's tool set between turns without invalidating the prompt
       * cache.
       *
       * Only supported on system messages that appear mid-conversation (not the
       * initial system prompt). A system message carrying tool changes must come
       * right before an assistant message or at the end of the messages.
       *
       * A `tool_addition` either references a tool by `toolName` or defines it
       * by value with `tool`:
       * - By reference: the tool must be declared in the `tools` option
       *   (typically with `deferLoading: true` so it is not loaded until the
       *   addition surfaces it). The required
       *   `mid-conversation-tool-changes-2026-07-01` beta is added
       *   automatically.
       * - By value: `tool` is a function or provider tool, in the same shape as
       *   an entry of the `tools` option. The tool does not need to be declared
       *   in `tools`, and defining a tool under an existing name replaces it
       *   from that point on. The required `inline-tools-2026-09-15` beta is
       *   added automatically. Requires the request-level
       *   `allowInlineToolDefinitions` option to be true.
       *
       * A `tool_removal` always references the tool by `toolName`.
       */
      toolChanges: array$1(
        union([
          object$1({
            type: literal("tool_addition"),
            toolName: string()
          }),
          object$1({
            type: literal("tool_addition"),
            tool: union([
              looseObject({
                type: literal("function"),
                name: string(),
                inputSchema: record(string(), unknown())
              }),
              looseObject({
                type: literal("provider"),
                id: string(),
                name: string(),
                args: record(string(), unknown())
              })
            ])
          }),
          object$1({
            type: literal("tool_removal"),
            toolName: string()
          })
        ])
      ).optional()
    })
  )
);
var anthropicLanguageModelOptions = lazySchema(() => {
  const anthropicThinkingBlockBinding = object$1({
    prefixMismatchBehavior: _enum(["error", "drop_block"])
  });
  return zodSchema(
    object$1({
      /**
       * Whether to send reasoning to the model.
       *
       * This allows you to deactivate reasoning inputs for models that do not support them.
       */
      sendReasoning: boolean().optional(),
      /**
       * Allow tool definitions supplied by value in system-message tool changes.
       * Defaults to false. Enable only for server-controlled messages: inline
       * definitions can add tools or replace their configured restrictions.
       * This request-level option cannot be enabled through message metadata.
       */
      allowInlineToolDefinitions: boolean().optional(),
      /**
       * Determines how structured outputs are generated.
       *
       * - `outputFormat`: Use the `output_config.format` parameter to specify the structured output format.
       * - `jsonTool`: Use a special 'json' tool to specify the structured output format.
       * - `auto`: Use 'outputFormat' when supported, otherwise use 'jsonTool' (default).
       */
      structuredOutputMode: _enum(["outputFormat", "jsonTool", "auto"]).optional(),
      /**
       * Configuration for enabling Claude's extended thinking.
       *
       * When enabled, responses include thinking content blocks showing Claude's thinking process before the final answer.
       * Requires a minimum budget of 1,024 tokens and counts towards the `max_tokens` limit.
       *
       * Models that always use adaptive thinking (e.g. `claude-opus-5-5`,
       * `claude-fable-5-1`, `claude-fable-5-2`) reject `enabled` and `disabled`. For those models the
       * provider drops the unsupported setting, emits a warning, and sends an
       * adaptive thinking request. Use `effort` to control how much they think.
       *
       * `claude-sonnet-5-5` supports `between_tools`, its lowest thinking setting,
       * and the provider uses it in place of `disabled` for that model.
       */
      thinking: union([
        discriminatedUnion("type", [
          object$1({
            /** for Sonnet 4.6, Opus 4.6, and newer models */
            type: literal("adaptive"),
            /**
             * Controls whether thinking content is included in the response.
             * - `"omitted"`: Thinking blocks are present but text is empty (default for Opus 4.7+).
             * - `"summarized"`: Thinking content is returned. Required to see reasoning output.
             * - `"updates"`: Thinking updates are returned between tool calls.
             */
            display: _enum(["omitted", "summarized", "updates"]).optional(),
            /**
             * Controls how thinking blocks are bound to an assistant prefix.
             *
             * Requires the `thinking-binding-controls-2026-08-01` beta,
             * which is added automatically.
             */
            blockBinding: anthropicThinkingBlockBinding.optional()
          }),
          object$1({
            /** for models before Opus 4.6, except Sonnet 4.6 still supports it */
            type: literal("enabled"),
            budgetTokens: number().optional()
          }),
          object$1({
            type: literal("disabled")
          }),
          object$1({
            /**
             * for `claude-sonnet-5-5`: no upfront thinking, but progress notes
             * between tool calls are returned as summarized thinking blocks.
             * Only supported at `low`, `medium`, and `high` effort.
             */
            type: literal("between_tools")
          })
        ]),
        /**
         * Configures prefix mismatch recovery without changing the model's
         * default thinking mode.
         */
        object$1({
          blockBinding: anthropicThinkingBlockBinding
        })
      ]).optional(),
      /**
       * Whether to disable parallel function calling during tool use. Default is false.
       * When set to true, Claude will use at most one tool per response.
       */
      disableParallelToolUse: boolean().optional(),
      /**
       * Cache control settings for this message.
       * See https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
       */
      cacheControl: object$1({
        type: literal("ephemeral"),
        ttl: union([literal("5m"), literal("1h")]).optional()
      }).optional(),
      /**
       * Metadata to include with the request.
       *
       * See https://platform.claude.com/docs/en/api/messages/create for details.
       */
      metadata: object$1({
        /**
         * An external identifier for the user associated with the request.
         *
         * Should be a UUID, hash value, or other opaque identifier.
         * Must not contain PII (name, email, phone number, etc.).
         */
        userId: string().optional()
      }).optional(),
      /**
       * MCP servers to be utilized in this request.
       */
      mcpServers: array$1(
        object$1({
          type: literal("url"),
          name: string(),
          url: string(),
          authorizationToken: string().nullish(),
          toolConfiguration: object$1({
            enabled: boolean().nullish(),
            allowedTools: array$1(string()).nullish()
          }).nullish()
        })
      ).optional(),
      /**
       * Agent Skills configuration. Skills enable Claude to perform specialized tasks
       * like document processing (PPTX, DOCX, PDF, XLSX) and data analysis.
       * Requires code execution tool to be enabled.
       */
      container: object$1({
        id: string().optional(),
        skills: array$1(
          object$1({
            type: union([literal("anthropic"), literal("custom")]),
            skillId: string(),
            version: string().optional()
          })
        ).optional()
      }).optional(),
      /**
       * Whether to enable fine-grained (eager) streaming of tool call inputs
       * and structured outputs for every function tool in the request. When
       * true (the default), each function tool receives a default of
       * `eager_input_streaming: true` unless it explicitly sets
       * `providerOptions.anthropic.eagerInputStreaming`.
       *
       * @default true
       */
      toolStreaming: boolean().optional(),
      /**
       * Controls how much effort the model spends on thinking, text responses,
       * and tool calls. On models that always use adaptive thinking
       * (e.g. `claude-opus-5-5`), effort is the main lever for latency and cost.
       *
       * The API default is `high` for most models and `medium` for `claude-opus-5-5`.
       */
      effort: _enum(["low", "medium", "high", "xhigh", "max"]).optional(),
      /**
       * Task budget for agentic turns. Informs the model of the total token budget
       * available for the current task, allowing it to prioritize work and wind down
       * gracefully as the budget is consumed.
       *
       * Advisory only — does not enforce a hard token limit.
       */
      taskBudget: object$1({
        type: literal("tokens"),
        total: number().int().min(2e4),
        remaining: number().int().min(0).optional()
      }).optional(),
      /**
       * Enable fast mode for faster inference (2.5x faster output token speeds).
       * Only supported with claude-opus-4-6.
       */
      speed: _enum(["fast", "standard"]).optional(),
      /**
       * Controls where model inference runs for this request.
       *
       * - `"global"`: Inference may run in any available geography (default).
       * - `"us"`: Inference runs only in US-based infrastructure.
       *
       * See https://platform.claude.com/docs/en/build-with-claude/data-residency
       */
      inferenceGeo: _enum(["us", "global"]).optional(),
      /**
       * Server-side fallback configuration.
       *
       * When the primary model's safety classifiers block a turn, the API
       * automatically retries it server-side on a fallback model. A
       * `content-filter` finish reason means the fallback(s) refused as well.
       *
       * - `'default'` (recommended): the API routes the retry to Anthropic's
       *   recommended fallback model based on the refusal category. Requires the
       *   `server-side-fallback-2026-07-01` beta, which is added automatically.
       * - Array form: an explicit fallback chain. Each entry is merged into the
       *   request as a direct request to that entry's model, so it must be
       *   formatted accordingly: `model` is required, and an entry may
       *   additionally override `max_tokens`, `thinking`, `output_config`, and
       *   `speed` for that attempt only (`speed` additionally requires the speed
       *   beta). The value is passed through to the API as-is, and the
       *   `server-side-fallback-2026-06-01` beta is added automatically.
       */
      fallbacks: union([
        literal("default"),
        array$1(
          object$1({
            model: string(),
            max_tokens: number().int().optional(),
            thinking: record(string(), unknown()).optional(),
            output_config: record(string(), unknown()).optional(),
            speed: _enum(["fast", "standard"]).optional()
          })
        )
      ]).optional(),
      /**
       * A set of beta features to enable.
       * Allow a provider to receive the full `betas` set if it needs it.
       */
      anthropicBeta: array$1(string()).optional(),
      /**
       * Server-side safeguards to run as part of the request.
       *
       * `dangerous_tool_use` asks the API to classify every `tool_use` block in
       * the response for dangerous actions (the check Claude Code's auto mode
       * relies on). The per-call verdicts are returned in
       * `providerMetadata.anthropic.safeguardResults`, keyed by tool call id.
       * `classifierContext` is passed through to the API as `classifier_context`.
       * The `dangerous-tool-use-2026-09-03` beta is added automatically.
       */
      safeguards: array$1(
        object$1({
          type: literal("dangerous_tool_use"),
          classifierContext: record(string(), unknown()).optional()
        })
      ).optional(),
      contextManagement: object$1({
        edits: array$1(
          discriminatedUnion("type", [
            object$1({
              type: literal("clear_tool_uses_20250919"),
              trigger: discriminatedUnion("type", [
                object$1({
                  type: literal("input_tokens"),
                  value: number()
                }),
                object$1({
                  type: literal("tool_uses"),
                  value: number()
                })
              ]).optional(),
              keep: object$1({
                type: literal("tool_uses"),
                value: number()
              }).optional(),
              clearAtLeast: object$1({
                type: literal("input_tokens"),
                value: number()
              }).optional(),
              clearToolInputs: boolean().optional(),
              excludeTools: array$1(string()).optional()
            }),
            object$1({
              type: literal("clear_thinking_20251015"),
              keep: union([
                literal("all"),
                object$1({
                  type: literal("thinking_turns"),
                  value: number()
                })
              ]).optional()
            }),
            object$1({
              type: literal("compact_20260112"),
              trigger: object$1({
                type: literal("input_tokens"),
                value: number()
              }).optional(),
              pauseAfterCompaction: boolean().optional(),
              instructions: string().optional()
            })
          ])
        )
      }).optional()
    })
  );
});
var MAX_CACHE_BREAKPOINTS = 4;
function getCacheControl(providerMetadata, providerOptionsName) {
  var _a21, _b15, _c;
  const custom2 = providerMetadata == null ? void 0 : providerMetadata[providerOptionsName];
  const anthropic2 = providerMetadata == null ? void 0 : providerMetadata.anthropic;
  const cacheControlValue = (_c = (_b15 = (_a21 = custom2 == null ? void 0 : custom2.cacheControl) != null ? _a21 : custom2 == null ? void 0 : custom2.cache_control) != null ? _b15 : anthropic2 == null ? void 0 : anthropic2.cacheControl) != null ? _c : anthropic2 == null ? void 0 : anthropic2.cache_control;
  return cacheControlValue;
}
var CacheControlValidator = class {
  constructor(providerOptionsName = "anthropic") {
    this.providerOptionsName = providerOptionsName;
    this.breakpointCount = 0;
    this.warnings = [];
  }
  getCacheControl(providerMetadata, context2) {
    const cacheControlValue = getCacheControl(
      providerMetadata,
      this.providerOptionsName
    );
    if (!cacheControlValue) {
      return void 0;
    }
    if (!context2.canCache) {
      this.warnings.push({
        type: "unsupported",
        feature: "cache_control on non-cacheable context",
        details: `cache_control cannot be set on ${context2.type}. It will be ignored.`
      });
      return void 0;
    }
    this.breakpointCount++;
    if (this.breakpointCount > MAX_CACHE_BREAKPOINTS) {
      this.warnings.push({
        type: "unsupported",
        feature: "cacheControl breakpoint limit",
        details: `Maximum ${MAX_CACHE_BREAKPOINTS} cache breakpoints exceeded (found ${this.breakpointCount}). This breakpoint will be ignored.`
      });
      return void 0;
    }
    return cacheControlValue;
  }
  getWarnings() {
    return this.warnings;
  }
};
var advisor_20260301ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      model: string(),
      maxUses: number().optional(),
      caching: object$1({
        type: literal("ephemeral"),
        ttl: union([literal("5m"), literal("1h")])
      }).optional()
    })
  )
);
var advisor_20260301OutputSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("type", [
      object$1({
        type: literal("advisor_result"),
        text: string()
      }),
      object$1({
        type: literal("advisor_redacted_result"),
        encryptedContent: string()
      }),
      object$1({
        type: literal("advisor_tool_result_error"),
        errorCode: string()
      })
    ])
  )
);
var advisor_20260301InputSchema = lazySchema(
  () => zodSchema(object$1({}).strict())
);
var factory = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.advisor_20260301",
  inputSchema: advisor_20260301InputSchema,
  outputSchema: advisor_20260301OutputSchema,
  supportsDeferredResults: true
});
var advisor_20260301 = (args) => {
  return factory(args);
};
var computerToolset_20260801Members = [
  "screenshot",
  "zoom",
  "left_click",
  "right_click",
  "middle_click",
  "double_click",
  "triple_click",
  "left_click_drag",
  "mouse_move",
  "left_mouse_down",
  "left_mouse_up",
  "cursor_position",
  "scroll",
  "type",
  "key",
  "hold_key",
  "wait"
];
var computerToolset_20260801InputSchema = (configs) => lazySchema(
  () => zodSchema(
    object$1({
      action: _enum(
        computerToolset_20260801Members.filter(
          (member) => {
            var _a21;
            return ((_a21 = configs == null ? void 0 : configs[member]) == null ? void 0 : _a21.enabled) !== false;
          }
        )
      ),
      coordinate: tuple([number().int(), number().int()]).optional(),
      duration: number().optional(),
      region: tuple([
        number().int(),
        number().int(),
        number().int(),
        number().int()
      ]).optional(),
      repeat: number().int().optional(),
      scroll_amount: number().optional(),
      scroll_direction: _enum(["up", "down", "left", "right"]).optional(),
      start_coordinate: tuple([number().int(), number().int()]).optional(),
      text: string().optional()
    })
  )
);
var computerToolset_20260801ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      configs: partialRecord(
        _enum(computerToolset_20260801Members),
        object$1({
          enabled: boolean().optional(),
          deferLoading: boolean().optional()
        })
      ).optional()
    })
  )
);
var factory2 = createProviderToolFactory({
  id: "anthropic.computer_toolset_20260801",
  inputSchema: computerToolset_20260801InputSchema()
});
var computerToolset_20260801 = (args) => ({
  ...factory2(args),
  inputSchema: computerToolset_20260801InputSchema(args.configs)
});
var textEditor_20250728ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      maxCharacters: number().optional()
    })
  )
);
var textEditor_20250728InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      command: _enum(["view", "create", "str_replace", "insert"]),
      path: string(),
      file_text: string().optional(),
      insert_line: number().int().optional(),
      new_str: string().optional(),
      insert_text: string().optional(),
      old_str: string().optional(),
      view_range: array$1(number().int()).optional()
    })
  )
);
var factory3 = createProviderToolFactory({
  id: "anthropic.text_editor_20250728",
  inputSchema: textEditor_20250728InputSchema
});
var textEditor_20250728 = (args = {}) => {
  return factory3(args);
};
var webSearch_20260209ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      maxUses: number().optional(),
      allowedDomains: array$1(string()).optional(),
      blockedDomains: array$1(string()).optional(),
      userLocation: object$1({
        type: literal("approximate"),
        city: string().optional(),
        region: string().optional(),
        country: string().optional(),
        timezone: string().optional()
      }).optional()
    })
  )
);
var webSearch_20260209OutputSchema = lazySchema(
  () => zodSchema(
    array$1(
      object$1({
        url: string(),
        title: string().nullable(),
        pageAge: string().nullable(),
        encryptedContent: string(),
        type: literal("web_search_result")
      })
    )
  )
);
var webSearch_20260209InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      query: string()
    })
  )
);
var factory4 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.web_search_20260209",
  inputSchema: webSearch_20260209InputSchema,
  outputSchema: webSearch_20260209OutputSchema,
  supportsDeferredResults: true
});
var webSearch_20260209 = (args = {}) => {
  return factory4(args);
};
var webSearch_20250305ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      maxUses: number().optional(),
      allowedDomains: array$1(string()).optional(),
      blockedDomains: array$1(string()).optional(),
      userLocation: object$1({
        type: literal("approximate"),
        city: string().optional(),
        region: string().optional(),
        country: string().optional(),
        timezone: string().optional()
      }).optional()
    })
  )
);
var webSearch_20250305OutputSchema = lazySchema(
  () => zodSchema(
    array$1(
      object$1({
        url: string(),
        title: string().nullable(),
        pageAge: string().nullable(),
        encryptedContent: string(),
        type: literal("web_search_result")
      })
    )
  )
);
var webSearch_20250305InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      query: string()
    })
  )
);
var factory5 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.web_search_20250305",
  inputSchema: webSearch_20250305InputSchema,
  outputSchema: webSearch_20250305OutputSchema,
  supportsDeferredResults: true
});
var webSearch_20250305 = (args = {}) => {
  return factory5(args);
};
var webFetch_20260209ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      maxUses: number().optional(),
      allowedDomains: array$1(string()).optional(),
      blockedDomains: array$1(string()).optional(),
      citations: object$1({ enabled: boolean() }).optional(),
      maxContentTokens: number().optional()
    })
  )
);
var webFetch_20260209OutputSchema = lazySchema(
  () => zodSchema(
    object$1({
      type: literal("web_fetch_result"),
      url: string(),
      content: object$1({
        type: literal("document"),
        title: string().nullable(),
        citations: object$1({ enabled: boolean() }).optional(),
        source: union([
          object$1({
            type: literal("base64"),
            mediaType: literal("application/pdf"),
            data: string()
          }),
          object$1({
            type: literal("text"),
            mediaType: literal("text/plain"),
            data: string()
          })
        ])
      }),
      retrievedAt: string().nullable()
    })
  )
);
var webFetch_20260209InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      url: string()
    })
  )
);
var factory6 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.web_fetch_20260209",
  inputSchema: webFetch_20260209InputSchema,
  outputSchema: webFetch_20260209OutputSchema,
  supportsDeferredResults: true
});
var webFetch_20260209 = (args = {}) => {
  return factory6(args);
};
var webFetch_20250910ArgsSchema = lazySchema(
  () => zodSchema(
    object$1({
      maxUses: number().optional(),
      allowedDomains: array$1(string()).optional(),
      blockedDomains: array$1(string()).optional(),
      citations: object$1({ enabled: boolean() }).optional(),
      maxContentTokens: number().optional()
    })
  )
);
var webFetch_20250910OutputSchema = lazySchema(
  () => zodSchema(
    object$1({
      type: literal("web_fetch_result"),
      url: string(),
      content: object$1({
        type: literal("document"),
        title: string().nullable(),
        citations: object$1({ enabled: boolean() }).optional(),
        source: union([
          object$1({
            type: literal("base64"),
            mediaType: literal("application/pdf"),
            data: string()
          }),
          object$1({
            type: literal("text"),
            mediaType: literal("text/plain"),
            data: string()
          })
        ])
      }),
      retrievedAt: string().nullable()
    })
  )
);
var webFetch_20250910InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      url: string()
    })
  )
);
var factory7 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.web_fetch_20250910",
  inputSchema: webFetch_20250910InputSchema,
  outputSchema: webFetch_20250910OutputSchema,
  supportsDeferredResults: true
});
var webFetch_20250910 = (args = {}) => {
  return factory7(args);
};
async function prepareTools({
  tools,
  toolChoice,
  hasInlineTools = false,
  disableParallelToolUse,
  cacheControlValidator,
  supportsStructuredOutput,
  supportsStrictTools,
  defaultEagerInputStreaming = false,
  rejectsForcedToolUse = false
}) {
  var _a21, _b15;
  tools = (tools == null ? void 0 : tools.length) ? tools : void 0;
  const toolWarnings = [];
  const betas = /* @__PURE__ */ new Set();
  const validator = cacheControlValidator || new CacheControlValidator();
  if (tools == null && !hasInlineTools) {
    return { tools: void 0, toolChoice: void 0, toolWarnings, betas };
  }
  const anthropicTools2 = [];
  for (const tool2 of tools != null ? tools : []) {
    switch (tool2.type) {
      case "function": {
        const cacheControl = validator.getCacheControl(tool2.providerOptions, {
          type: "tool definition",
          canCache: true
        });
        const anthropicOptions = (_a21 = tool2.providerOptions) == null ? void 0 : _a21.anthropic;
        const eagerInputStreaming = (_b15 = anthropicOptions == null ? void 0 : anthropicOptions.eagerInputStreaming) != null ? _b15 : defaultEagerInputStreaming;
        const deferLoading = anthropicOptions == null ? void 0 : anthropicOptions.deferLoading;
        const allowedCallers = anthropicOptions == null ? void 0 : anthropicOptions.allowedCallers;
        if (!supportsStrictTools && tool2.strict != null) {
          toolWarnings.push({
            type: "unsupported",
            feature: "strict",
            details: `Tool '${tool2.name}' has strict: ${tool2.strict}, but strict mode is not supported by this provider. The strict property will be ignored.`
          });
        }
        anthropicTools2.push({
          name: tool2.name,
          description: tool2.description,
          input_schema: tool2.inputSchema,
          cache_control: cacheControl,
          ...eagerInputStreaming ? { eager_input_streaming: true } : {},
          ...supportsStrictTools === true && tool2.strict != null ? { strict: tool2.strict } : {},
          ...deferLoading != null ? { defer_loading: deferLoading } : {},
          ...allowedCallers != null ? { allowed_callers: allowedCallers } : {},
          ...tool2.inputExamples != null ? {
            input_examples: tool2.inputExamples.map(
              (example) => example.input
            )
          } : {}
        });
        if (supportsStructuredOutput === true) {
          betas.add("structured-outputs-2025-11-13");
        }
        if (tool2.inputExamples != null || allowedCallers != null) {
          betas.add("advanced-tool-use-2025-11-20");
        }
        break;
      }
      case "provider": {
        switch (tool2.id) {
          case "anthropic.code_execution_20250522": {
            betas.add("code-execution-2025-05-22");
            anthropicTools2.push({
              type: "code_execution_20250522",
              name: "code_execution",
              cache_control: void 0
            });
            break;
          }
          case "anthropic.code_execution_20250825": {
            betas.add("code-execution-2025-08-25");
            anthropicTools2.push({
              type: "code_execution_20250825",
              name: "code_execution"
            });
            break;
          }
          case "anthropic.code_execution_20260120": {
            anthropicTools2.push({
              type: "code_execution_20260120",
              name: "code_execution"
            });
            break;
          }
          case "anthropic.computer_20250124": {
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "computer",
              type: "computer_20250124",
              display_width_px: tool2.args.displayWidthPx,
              display_height_px: tool2.args.displayHeightPx,
              display_number: tool2.args.displayNumber,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.computer_20251124": {
            betas.add("computer-use-2025-11-24");
            anthropicTools2.push({
              name: "computer",
              type: "computer_20251124",
              display_width_px: tool2.args.displayWidthPx,
              display_height_px: tool2.args.displayHeightPx,
              display_number: tool2.args.displayNumber,
              enable_zoom: tool2.args.enableZoom,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.computer_toolset_20260801": {
            const args = await validateTypes({
              value: tool2.args,
              schema: computerToolset_20260801ArgsSchema
            });
            const configs = args.configs != null ? Object.fromEntries(
              Object.entries(args.configs).map(([member, config]) => [
                member,
                {
                  ...(config == null ? void 0 : config.enabled) != null && {
                    enabled: config.enabled
                  },
                  ...(config == null ? void 0 : config.deferLoading) != null && {
                    defer_loading: config.deferLoading
                  }
                }
              ])
            ) : void 0;
            anthropicTools2.push({
              type: "computer_toolset_20260801",
              ...configs != null && { configs },
              cache_control: void 0
            });
            break;
          }
          case "anthropic.computer_20241022": {
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: "computer",
              type: "computer_20241022",
              display_width_px: tool2.args.displayWidthPx,
              display_height_px: tool2.args.displayHeightPx,
              display_number: tool2.args.displayNumber,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.text_editor_20250124": {
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "str_replace_editor",
              type: "text_editor_20250124",
              cache_control: void 0
            });
            break;
          }
          case "anthropic.text_editor_20241022": {
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: "str_replace_editor",
              type: "text_editor_20241022",
              cache_control: void 0
            });
            break;
          }
          case "anthropic.text_editor_20250429": {
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "str_replace_based_edit_tool",
              type: "text_editor_20250429",
              cache_control: void 0
            });
            break;
          }
          case "anthropic.text_editor_20250728": {
            const args = await validateTypes({
              value: tool2.args,
              schema: textEditor_20250728ArgsSchema
            });
            anthropicTools2.push({
              name: "str_replace_based_edit_tool",
              type: "text_editor_20250728",
              max_characters: args.maxCharacters,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.bash_20250124": {
            betas.add("computer-use-2025-01-24");
            anthropicTools2.push({
              name: "bash",
              type: "bash_20250124",
              cache_control: void 0
            });
            break;
          }
          case "anthropic.bash_20241022": {
            betas.add("computer-use-2024-10-22");
            anthropicTools2.push({
              name: "bash",
              type: "bash_20241022",
              cache_control: void 0
            });
            break;
          }
          case "anthropic.memory_20250818": {
            betas.add("context-management-2025-06-27");
            anthropicTools2.push({
              name: "memory",
              type: "memory_20250818"
            });
            break;
          }
          case "anthropic.web_fetch_20250910": {
            betas.add("web-fetch-2025-09-10");
            const args = await validateTypes({
              value: tool2.args,
              schema: webFetch_20250910ArgsSchema
            });
            anthropicTools2.push({
              type: "web_fetch_20250910",
              name: "web_fetch",
              max_uses: args.maxUses,
              allowed_domains: args.allowedDomains,
              blocked_domains: args.blockedDomains,
              citations: args.citations,
              max_content_tokens: args.maxContentTokens,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.web_fetch_20260209": {
            betas.add("code-execution-web-tools-2026-02-09");
            const args = await validateTypes({
              value: tool2.args,
              schema: webFetch_20260209ArgsSchema
            });
            anthropicTools2.push({
              type: "web_fetch_20260209",
              name: "web_fetch",
              max_uses: args.maxUses,
              allowed_domains: args.allowedDomains,
              blocked_domains: args.blockedDomains,
              citations: args.citations,
              max_content_tokens: args.maxContentTokens,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.web_search_20250305": {
            const args = await validateTypes({
              value: tool2.args,
              schema: webSearch_20250305ArgsSchema
            });
            anthropicTools2.push({
              type: "web_search_20250305",
              name: "web_search",
              max_uses: args.maxUses,
              allowed_domains: args.allowedDomains,
              blocked_domains: args.blockedDomains,
              user_location: args.userLocation,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.web_search_20260209": {
            betas.add("code-execution-web-tools-2026-02-09");
            const args = await validateTypes({
              value: tool2.args,
              schema: webSearch_20260209ArgsSchema
            });
            anthropicTools2.push({
              type: "web_search_20260209",
              name: "web_search",
              max_uses: args.maxUses,
              allowed_domains: args.allowedDomains,
              blocked_domains: args.blockedDomains,
              user_location: args.userLocation,
              cache_control: void 0
            });
            break;
          }
          case "anthropic.tool_search_regex_20251119": {
            anthropicTools2.push({
              type: "tool_search_tool_regex_20251119",
              name: "tool_search_tool_regex"
            });
            break;
          }
          case "anthropic.tool_search_bm25_20251119": {
            anthropicTools2.push({
              type: "tool_search_tool_bm25_20251119",
              name: "tool_search_tool_bm25"
            });
            break;
          }
          case "anthropic.advisor_20260301": {
            betas.add("advisor-tool-2026-03-01");
            const args = await validateTypes({
              value: tool2.args,
              schema: advisor_20260301ArgsSchema
            });
            anthropicTools2.push({
              type: "advisor_20260301",
              name: "advisor",
              model: args.model,
              ...args.maxUses !== void 0 && { max_uses: args.maxUses },
              ...args.caching !== void 0 && { caching: args.caching }
            });
            break;
          }
          default: {
            toolWarnings.push({
              type: "unsupported",
              feature: `provider-defined tool ${tool2.id}`
            });
            break;
          }
        }
        break;
      }
      default: {
        toolWarnings.push({
          type: "unsupported",
          feature: `tool ${tool2}`
        });
        break;
      }
    }
  }
  const declaredTools = tools == null ? void 0 : anthropicTools2;
  if (toolChoice == null) {
    return {
      tools: declaredTools,
      toolChoice: disableParallelToolUse ? { type: "auto", disable_parallel_tool_use: disableParallelToolUse } : void 0,
      toolWarnings,
      betas
    };
  }
  const type = toolChoice.type;
  switch (type) {
    case "auto":
      return {
        tools: declaredTools,
        toolChoice: {
          type: "auto",
          disable_parallel_tool_use: disableParallelToolUse
        },
        toolWarnings,
        betas
      };
    case "required":
      if (rejectsForcedToolUse) {
        toolWarnings.push({
          type: "unsupported",
          feature: "toolChoice",
          details: `toolChoice 'required' is not supported with this model or thinking configuration. Using 'auto' instead. Instruct the model to use a tool in the prompt and verify that a tool call was made.`
        });
        return {
          tools: declaredTools,
          toolChoice: {
            type: "auto",
            disable_parallel_tool_use: disableParallelToolUse
          },
          toolWarnings,
          betas
        };
      }
      return {
        tools: declaredTools,
        toolChoice: {
          type: "any",
          disable_parallel_tool_use: disableParallelToolUse
        },
        toolWarnings,
        betas
      };
    case "none":
      return {
        tools: declaredTools,
        toolChoice: { type: "none" },
        toolWarnings,
        betas
      };
    case "tool":
      if (rejectsForcedToolUse) {
        toolWarnings.push({
          type: "unsupported",
          feature: "toolChoice",
          details: `toolChoice 'tool' is not supported with this model or thinking configuration. Only the '${toolChoice.toolName}' tool is sent with 'auto' tool choice. Instruct the model to use the tool in the prompt and verify that a tool call was made.`
        });
        return {
          tools: declaredTools == null ? void 0 : declaredTools.filter(
            (tool2) => "name" in tool2 && tool2.name === toolChoice.toolName
          ),
          toolChoice: {
            type: "auto",
            disable_parallel_tool_use: disableParallelToolUse
          },
          toolWarnings,
          betas
        };
      }
      return {
        tools: declaredTools,
        toolChoice: {
          type: "tool",
          name: toolChoice.toolName,
          disable_parallel_tool_use: disableParallelToolUse
        },
        toolWarnings,
        betas
      };
    default: {
      const _exhaustiveCheck = type;
      throw new UnsupportedFunctionalityError2({
        functionality: `tool choice type: ${_exhaustiveCheck}`
      });
    }
  }
}
function convertAnthropicMessagesUsage({
  usage,
  rawUsage
}) {
  var _a21, _b15, _c, _d, _e;
  const cacheCreationTokens = (_a21 = usage.cache_creation_input_tokens) != null ? _a21 : 0;
  const cacheReadTokens = (_b15 = usage.cache_read_input_tokens) != null ? _b15 : 0;
  const reasoningTokens = (_d = (_c = usage.output_tokens_details) == null ? void 0 : _c.thinking_tokens) != null ? _d : void 0;
  let inputTokens;
  let outputTokens;
  const servedByFallback = (_e = usage.iterations) == null ? void 0 : _e.some(
    (iter) => iter.type === "fallback_message"
  );
  if (usage.iterations && usage.iterations.length > 0 && !servedByFallback) {
    const executorIterations = usage.iterations.filter(
      (iter) => iter.type === "compaction" || iter.type === "message"
    );
    if (executorIterations.length > 0) {
      const totals = executorIterations.reduce(
        (acc, iter) => ({
          input: acc.input + iter.input_tokens,
          output: acc.output + iter.output_tokens
        }),
        { input: 0, output: 0 }
      );
      inputTokens = totals.input;
      outputTokens = totals.output;
    } else {
      inputTokens = usage.input_tokens;
      outputTokens = usage.output_tokens;
    }
  } else {
    inputTokens = usage.input_tokens;
    outputTokens = usage.output_tokens;
  }
  return {
    inputTokens: {
      total: inputTokens + cacheCreationTokens + cacheReadTokens,
      noCache: inputTokens,
      cacheRead: cacheReadTokens,
      cacheWrite: cacheCreationTokens
    },
    outputTokens: {
      total: outputTokens,
      text: reasoningTokens == null ? void 0 : outputTokens - reasoningTokens,
      reasoning: reasoningTokens
    },
    raw: rawUsage != null ? rawUsage : usage
  };
}
var codeExecution_20250522OutputSchema = lazySchema(
  () => zodSchema(
    object$1({
      type: literal("code_execution_result"),
      stdout: string(),
      stderr: string(),
      return_code: number(),
      content: array$1(
        object$1({
          type: literal("code_execution_output"),
          file_id: string()
        })
      ).optional().default([])
    })
  )
);
var codeExecution_20250522InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      code: string()
    })
  )
);
var factory8 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.code_execution_20250522",
  inputSchema: codeExecution_20250522InputSchema,
  outputSchema: codeExecution_20250522OutputSchema
});
var codeExecution_20250522 = (args = {}) => {
  return factory8(args);
};
var codeExecution_20250825OutputSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("type", [
      object$1({
        type: literal("code_execution_result"),
        stdout: string(),
        stderr: string(),
        return_code: number(),
        content: array$1(
          object$1({
            type: literal("code_execution_output"),
            file_id: string()
          })
        ).optional().default([])
      }),
      object$1({
        type: literal("bash_code_execution_result"),
        content: array$1(
          object$1({
            type: literal("bash_code_execution_output"),
            file_id: string()
          })
        ),
        stdout: string(),
        stderr: string(),
        return_code: number()
      }),
      object$1({
        type: literal("bash_code_execution_tool_result_error"),
        error_code: string()
      }),
      object$1({
        type: literal("text_editor_code_execution_tool_result_error"),
        error_code: string()
      }),
      object$1({
        type: literal("text_editor_code_execution_view_result"),
        content: string(),
        file_type: string(),
        num_lines: number().nullable(),
        start_line: number().nullable(),
        total_lines: number().nullable()
      }),
      object$1({
        type: literal("text_editor_code_execution_create_result"),
        is_file_update: boolean()
      }),
      object$1({
        type: literal("text_editor_code_execution_str_replace_result"),
        lines: array$1(string()).nullable(),
        new_lines: number().nullable(),
        new_start: number().nullable(),
        old_lines: number().nullable(),
        old_start: number().nullable()
      })
    ])
  )
);
var codeExecution_20250825InputSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("type", [
      // Programmatic tool calling format (mapped from { code } by AI SDK)
      object$1({
        type: literal("programmatic-tool-call"),
        code: string()
      }),
      object$1({
        type: literal("bash_code_execution"),
        command: string()
      }),
      discriminatedUnion("command", [
        object$1({
          type: literal("text_editor_code_execution"),
          command: literal("view"),
          path: string()
        }),
        object$1({
          type: literal("text_editor_code_execution"),
          command: literal("create"),
          path: string(),
          file_text: string().nullish()
        }),
        object$1({
          type: literal("text_editor_code_execution"),
          command: literal("str_replace"),
          path: string(),
          old_str: string(),
          new_str: string()
        })
      ])
    ])
  )
);
var factory9 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.code_execution_20250825",
  inputSchema: codeExecution_20250825InputSchema,
  outputSchema: codeExecution_20250825OutputSchema,
  // Programmatic tool calling: tool results may be deferred to a later turn
  // when code execution triggers a client-executed tool that needs to be
  // resolved before the code execution result can be returned.
  supportsDeferredResults: true
});
var codeExecution_20250825 = (args = {}) => {
  return factory9(args);
};
var codeExecution_20260120OutputSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("type", [
      object$1({
        type: literal("code_execution_result"),
        stdout: string(),
        stderr: string(),
        return_code: number(),
        content: array$1(
          object$1({
            type: literal("code_execution_output"),
            file_id: string()
          })
        ).optional().default([])
      }),
      object$1({
        type: literal("encrypted_code_execution_result"),
        encrypted_stdout: string(),
        stderr: string(),
        return_code: number(),
        content: array$1(
          object$1({
            type: literal("code_execution_output"),
            file_id: string()
          })
        ).optional().default([])
      }),
      object$1({
        type: literal("bash_code_execution_result"),
        content: array$1(
          object$1({
            type: literal("bash_code_execution_output"),
            file_id: string()
          })
        ),
        stdout: string(),
        stderr: string(),
        return_code: number()
      }),
      object$1({
        type: literal("bash_code_execution_tool_result_error"),
        error_code: string()
      }),
      object$1({
        type: literal("text_editor_code_execution_tool_result_error"),
        error_code: string()
      }),
      object$1({
        type: literal("text_editor_code_execution_view_result"),
        content: string(),
        file_type: string(),
        num_lines: number().nullable(),
        start_line: number().nullable(),
        total_lines: number().nullable()
      }),
      object$1({
        type: literal("text_editor_code_execution_create_result"),
        is_file_update: boolean()
      }),
      object$1({
        type: literal("text_editor_code_execution_str_replace_result"),
        lines: array$1(string()).nullable(),
        new_lines: number().nullable(),
        new_start: number().nullable(),
        old_lines: number().nullable(),
        old_start: number().nullable()
      })
    ])
  )
);
var codeExecution_20260120InputSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("type", [
      object$1({
        type: literal("programmatic-tool-call"),
        code: string()
      }),
      object$1({
        type: literal("bash_code_execution"),
        command: string()
      }),
      discriminatedUnion("command", [
        object$1({
          type: literal("text_editor_code_execution"),
          command: literal("view"),
          path: string()
        }),
        object$1({
          type: literal("text_editor_code_execution"),
          command: literal("create"),
          path: string(),
          file_text: string().nullish()
        }),
        object$1({
          type: literal("text_editor_code_execution"),
          command: literal("str_replace"),
          path: string(),
          old_str: string(),
          new_str: string()
        })
      ])
    ])
  )
);
var factory10 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.code_execution_20260120",
  inputSchema: codeExecution_20260120InputSchema,
  outputSchema: codeExecution_20260120OutputSchema,
  supportsDeferredResults: true
});
var codeExecution_20260120 = (args = {}) => {
  return factory10(args);
};
var toolSearchRegex_20251119OutputSchema = lazySchema(
  () => zodSchema(
    array$1(
      object$1({
        type: literal("tool_reference"),
        toolName: string()
      })
    )
  )
);
var toolSearchRegex_20251119InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      /**
       * A regex pattern to search for tools.
       * Uses Python re.search() syntax. Maximum 200 characters.
       *
       * Examples:
       * - "weather" - matches tool names/descriptions containing "weather"
       * - "get_.*_data" - matches tools like get_user_data, get_weather_data
       * - "database.*query|query.*database" - OR patterns for flexibility
       * - "(?i)slack" - case-insensitive search
       */
      pattern: string(),
      /**
       * Maximum number of tools to return. Optional.
       */
      limit: number().optional()
    })
  )
);
var factory11 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.tool_search_regex_20251119",
  inputSchema: toolSearchRegex_20251119InputSchema,
  outputSchema: toolSearchRegex_20251119OutputSchema,
  supportsDeferredResults: true
});
var toolSearchRegex_20251119 = (args = {}) => {
  return factory11(args);
};
function convertToString(data) {
  if (typeof data === "string") {
    return new TextDecoder().decode(convertBase64ToUint8Array(data));
  }
  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof URL) {
    throw new UnsupportedFunctionalityError2({
      functionality: "URL-based text documents are not supported for citations"
    });
  }
  throw new UnsupportedFunctionalityError2({
    functionality: `unsupported data type for text documents: ${typeof data}`
  });
}
function isUrlData(data) {
  return data instanceof URL || isUrlString(data);
}
function isUrlString(data) {
  return typeof data === "string" && /^https?:\/\//i.test(data);
}
function getUrlString(data) {
  return data instanceof URL ? data.toString() : data;
}
async function extractErrorValue(value) {
  if (typeof value === "string") {
    const result = await safeParseJSON({ text: value });
    if (result.success && typeof result.value === "object" && result.value !== null) {
      return result.value;
    }
    return {
      errorCode: "unavailable"
    };
  }
  if (typeof value === "object" && value !== null) {
    return value;
  }
  return {};
}
function isComputerTool(tool2) {
  return tool2.type === "provider" && tool2.id.startsWith("anthropic.computer_");
}
async function getInlineToolsFromPrompt(prompt) {
  var _a21;
  const inlineTools = [];
  for (const message of prompt) {
    if (message.role !== "system" || message.providerOptions == null) {
      continue;
    }
    const options = await parseProviderOptions({
      provider: "anthropic",
      providerOptions: message.providerOptions,
      schema: anthropicSystemMessageProviderOptions
    });
    for (const toolChange of (_a21 = options == null ? void 0 : options.toolChanges) != null ? _a21 : []) {
      if ("tool" in toolChange) {
        const tool2 = toolChange.tool;
        if (!isComputerTool(tool2)) {
          inlineTools.push(tool2);
        }
      }
    }
  }
  return inlineTools;
}
async function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings,
  cacheControlValidator,
  toolNameMapping,
  toolsetNames = {},
  convertMediaPart,
  convertInlineTool
}) {
  var _a21, _b15, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v;
  const betas = /* @__PURE__ */ new Set();
  const blocks = groupIntoBlocks(prompt);
  const validator = cacheControlValidator || new CacheControlValidator();
  let system = void 0;
  const messages = [];
  let lastUserMessageIndex = -1;
  async function shouldEnableCitations(providerMetadata) {
    var _a22, _b22;
    const anthropicOptions = await parseProviderOptions({
      provider: "anthropic",
      providerOptions: providerMetadata,
      schema: anthropicFilePartProviderOptions
    });
    return (_b22 = (_a22 = anthropicOptions == null ? void 0 : anthropicOptions.citations) == null ? void 0 : _a22.enabled) != null ? _b22 : false;
  }
  async function getDocumentMetadata(providerMetadata) {
    const anthropicOptions = await parseProviderOptions({
      provider: "anthropic",
      providerOptions: providerMetadata,
      schema: anthropicFilePartProviderOptions
    });
    return {
      title: anthropicOptions == null ? void 0 : anthropicOptions.title,
      context: anthropicOptions == null ? void 0 : anthropicOptions.context
    };
  }
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;
    switch (type) {
      case "system": {
        const systemMessages = [];
        let toolChangeCount = 0;
        let hasInlineToolDefinition = false;
        let hasMidConversationOptions = false;
        for (const { content: text2, providerOptions } of block.messages) {
          const systemMessageOptions = await parseProviderOptions({
            provider: "anthropic",
            providerOptions,
            schema: anthropicSystemMessageProviderOptions
          });
          const toolChanges = (_a21 = systemMessageOptions == null ? void 0 : systemMessageOptions.toolChanges) != null ? _a21 : [];
          const clearAt = systemMessageOptions == null ? void 0 : systemMessageOptions.clearAt;
          const effort = systemMessageOptions == null ? void 0 : systemMessageOptions.effort;
          const content = [];
          if (text2 !== "" || toolChanges.length === 0 && clearAt == null && effort == null) {
            content.push({
              type: "text",
              text: text2,
              cache_control: validator.getCacheControl(providerOptions, {
                type: "system message",
                canCache: true
              })
            });
          }
          for (const toolChange of toolChanges) {
            if ("tool" in toolChange) {
              if (convertInlineTool == null) {
                throw new UnsupportedFunctionalityError2({
                  functionality: "tool additions by value in mid-conversation tool changes"
                });
              }
              const tool2 = toolChange.tool;
              if (isComputerTool(tool2)) {
                warnings.push({
                  type: "other",
                  message: `The tool '${tool2.name}' cannot be added by value in a tool change. Declare it in the tools option and add it by reference with toolName. The tool change has been ignored.`
                });
                continue;
              }
              const {
                definition,
                warnings: toolWarnings,
                betas: toolBetas
              } = await convertInlineTool(tool2);
              warnings.push(...toolWarnings);
              for (const beta of toolBetas) {
                betas.add(beta);
              }
              if (definition == null) {
                continue;
              }
              content.push({
                type: "tool_addition",
                tool: { type: "tool_definition", definition }
              });
              toolChangeCount++;
              hasInlineToolDefinition = true;
              continue;
            }
            toolChangeCount++;
            content.push({
              type: toolChange.type,
              tool: {
                type: "tool_reference",
                name: toolNameMapping.toProviderToolName(toolChange.toolName)
              }
            });
          }
          if (content.length === 0 && clearAt == null && effort == null) {
            continue;
          }
          hasMidConversationOptions || (hasMidConversationOptions = clearAt != null || effort != null);
          systemMessages.push({
            role: "system",
            content,
            ...clearAt != null && { clear_at: clearAt },
            ...effort != null && { output_config: { effort } }
          });
        }
        if (i === 0 || system == null && toolChangeCount === 0 && !hasMidConversationOptions) {
          if (toolChangeCount > 0) {
            warnings.push({
              type: "other",
              message: "tool changes on the initial system message are not supported by Anthropic. Configure the initial tool set via the tools option instead. The tool changes have been ignored."
            });
          }
          for (const message of systemMessages) {
            if (message.content.length === 0 && message.clear_at == null && message.output_config != null) {
              messages.push(message);
              betas.add("mid-conversation-output-config-2026-07-01");
            } else if (message.clear_at != null || message.output_config != null) {
              warnings.push({
                type: "other",
                message: "clearAt and effort on this initial system message are not supported by Anthropic. Use a separate effort-only system message with empty content to set effort. These options have been ignored."
              });
            }
          }
          system = systemMessages.flatMap(
            (message) => message.content.filter(
              (part) => part.type === "text"
            )
          );
        } else {
          messages.push(...systemMessages);
          betas.add("mid-conversation-system-2026-04-07");
          if (hasInlineToolDefinition) {
            betas.add("inline-tools-2026-09-15");
          } else if (toolChangeCount > 0) {
            betas.add("mid-conversation-tool-changes-2026-07-01");
          }
          if (systemMessages.some((message) => message.clear_at != null)) {
            betas.add("mid-conversation-system-clear-at-2026-08-21");
          }
          if (systemMessages.some((message) => message.output_config != null)) {
            betas.add("mid-conversation-output-config-2026-07-01");
          }
        }
        break;
      }
      case "user": {
        const anthropicContent = [];
        for (const message of block.messages) {
          const { role, content } = message;
          switch (role) {
            case "user": {
              if (content.length > 0) {
                lastUserMessageIndex = messages.length;
              }
              for (let j = 0; j < content.length; j++) {
                const part = content[j];
                const isLastPart = j === content.length - 1;
                const cacheControl = (_b15 = validator.getCacheControl(part.providerOptions, {
                  type: "user message part",
                  canCache: true
                })) != null ? _b15 : isLastPart ? validator.getCacheControl(message.providerOptions, {
                  type: "user message",
                  canCache: true
                }) : void 0;
                switch (part.type) {
                  case "text": {
                    anthropicContent.push({
                      type: "text",
                      text: part.text,
                      cache_control: cacheControl
                    });
                    break;
                  }
                  case "file": {
                    const customContent = await (convertMediaPart == null ? void 0 : convertMediaPart(part));
                    if (customContent != null) {
                      anthropicContent.push({
                        ...customContent,
                        cache_control: cacheControl
                      });
                      break;
                    }
                    if (part.mediaType.startsWith("image/")) {
                      anthropicContent.push({
                        type: "image",
                        source: isUrlData(part.data) ? {
                          type: "url",
                          url: getUrlString(part.data)
                        } : {
                          type: "base64",
                          media_type: part.mediaType === "image/*" ? "image/jpeg" : part.mediaType,
                          data: convertToBase64(part.data)
                        },
                        cache_control: cacheControl
                      });
                    } else if (part.mediaType === "application/pdf") {
                      betas.add("pdfs-2024-09-25");
                      const enableCitations = await shouldEnableCitations(
                        part.providerOptions
                      );
                      const metadata = await getDocumentMetadata(
                        part.providerOptions
                      );
                      anthropicContent.push({
                        type: "document",
                        source: isUrlData(part.data) ? {
                          type: "url",
                          url: getUrlString(part.data)
                        } : {
                          type: "base64",
                          media_type: "application/pdf",
                          data: convertToBase64(part.data)
                        },
                        title: (_c = metadata.title) != null ? _c : part.filename,
                        ...metadata.context && { context: metadata.context },
                        ...enableCitations && {
                          citations: { enabled: true }
                        },
                        cache_control: cacheControl
                      });
                    } else if (part.mediaType === "text/plain") {
                      const enableCitations = await shouldEnableCitations(
                        part.providerOptions
                      );
                      const metadata = await getDocumentMetadata(
                        part.providerOptions
                      );
                      anthropicContent.push({
                        type: "document",
                        source: isUrlData(part.data) ? {
                          type: "url",
                          url: getUrlString(part.data)
                        } : {
                          type: "text",
                          media_type: "text/plain",
                          data: convertToString(part.data)
                        },
                        title: (_d = metadata.title) != null ? _d : part.filename,
                        ...metadata.context && { context: metadata.context },
                        ...enableCitations && {
                          citations: { enabled: true }
                        },
                        cache_control: cacheControl
                      });
                    } else {
                      throw new UnsupportedFunctionalityError2({
                        functionality: `media type: ${part.mediaType}`
                      });
                    }
                    break;
                  }
                }
              }
              break;
            }
            case "tool": {
              for (let i2 = 0; i2 < content.length; i2++) {
                const part = content[i2];
                if (part.type === "tool-approval-response") {
                  continue;
                }
                const output = part.output;
                const outputProviderOptions = "providerOptions" in output ? output.providerOptions : output.type === "content" ? (_e = output.value.find(
                  (contentPart) => contentPart.providerOptions != null
                )) == null ? void 0 : _e.providerOptions : void 0;
                const isLastPart = i2 === content.length - 1;
                const cacheControl = (_g = (_f = validator.getCacheControl(part.providerOptions, {
                  type: "tool result part",
                  canCache: true
                })) != null ? _f : validator.getCacheControl(outputProviderOptions, {
                  type: "tool result output",
                  canCache: true
                })) != null ? _g : isLastPart ? validator.getCacheControl(message.providerOptions, {
                  type: "tool result message",
                  canCache: true
                }) : void 0;
                let contentValue;
                switch (output.type) {
                  case "content":
                    contentValue = output.value.map((contentPart) => {
                      var _a22;
                      switch (contentPart.type) {
                        case "text":
                          return {
                            type: "text",
                            text: contentPart.text
                          };
                        case "image-data": {
                          return {
                            type: "image",
                            source: {
                              type: "base64",
                              media_type: contentPart.mediaType,
                              data: contentPart.data
                            }
                          };
                        }
                        case "image-url": {
                          return {
                            type: "image",
                            source: {
                              type: "url",
                              url: contentPart.url
                            }
                          };
                        }
                        case "file-url": {
                          return {
                            type: "document",
                            source: {
                              type: "url",
                              url: contentPart.url
                            }
                          };
                        }
                        case "file-data": {
                          if (contentPart.mediaType === "application/pdf") {
                            betas.add("pdfs-2024-09-25");
                            return {
                              type: "document",
                              source: {
                                type: "base64",
                                media_type: contentPart.mediaType,
                                data: contentPart.data
                              }
                            };
                          }
                          warnings.push({
                            type: "other",
                            message: `unsupported tool content part type: ${contentPart.type} with media type: ${contentPart.mediaType}`
                          });
                          return void 0;
                        }
                        case "custom": {
                          const anthropicOptions = (_a22 = contentPart.providerOptions) == null ? void 0 : _a22.anthropic;
                          if ((anthropicOptions == null ? void 0 : anthropicOptions.type) === "tool-reference") {
                            return {
                              type: "tool_reference",
                              tool_name: anthropicOptions.toolName
                            };
                          }
                          warnings.push({
                            type: "other",
                            message: `unsupported custom tool content part`
                          });
                          return void 0;
                        }
                        default: {
                          warnings.push({
                            type: "other",
                            message: `unsupported tool content part type: ${contentPart.type}`
                          });
                          return void 0;
                        }
                      }
                    }).filter(isNonNullable);
                    break;
                  case "text":
                  case "error-text":
                    contentValue = output.value;
                    break;
                  case "execution-denied":
                    contentValue = (_h = output.reason) != null ? _h : "Tool call execution denied.";
                    break;
                  case "json":
                  case "error-json":
                  default:
                    contentValue = stringifyWithBigIntAndCycles(output.value);
                    break;
                }
                const toolsetName = getAnthropicToolsetName({
                  toolName: part.toolName,
                  providerOptions: part.providerOptions,
                  toolsetNames
                });
                anthropicContent.push({
                  type: "tool_result",
                  tool_use_id: part.toolCallId,
                  ...toolsetName != null && { toolset_name: toolsetName },
                  content: contentValue,
                  is_error: output.type === "error-text" || output.type === "error-json" ? true : void 0,
                  cache_control: cacheControl
                });
              }
              break;
            }
            default: {
              const _exhaustiveCheck = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }
        }
        messages.push({ role: "user", content: anthropicContent });
        break;
      }
      case "assistant": {
        const anthropicContent = [];
        const mcpToolUseIds = /* @__PURE__ */ new Set();
        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;
            const cacheControl = (_i = validator.getCacheControl(part.providerOptions, {
              type: "assistant message part",
              canCache: true
            })) != null ? _i : isLastContentPart ? validator.getCacheControl(message.providerOptions, {
              type: "assistant message",
              canCache: true
            }) : void 0;
            switch (part.type) {
              case "text": {
                const textMetadata = (_j = part.providerOptions) == null ? void 0 : _j.anthropic;
                if ((textMetadata == null ? void 0 : textMetadata.type) === "compaction") {
                  anthropicContent.push({
                    type: "compaction",
                    content: part.text,
                    cache_control: cacheControl
                  });
                } else {
                  anthropicContent.push({
                    type: "text",
                    text: (
                      // trim the last text part if it's the last message in the block
                      // because Anthropic does not allow trailing whitespace
                      // in pre-filled assistant responses
                      isLastBlock && isLastMessage && isLastContentPart ? part.text.trim() : part.text
                    ),
                    ...(textMetadata == null ? void 0 : textMetadata.citations) != null && {
                      citations: textMetadata.citations
                    },
                    cache_control: cacheControl
                  });
                }
                break;
              }
              case "reasoning": {
                if (sendReasoning) {
                  const reasoningMetadata = await parseProviderOptions({
                    provider: "anthropic",
                    providerOptions: part.providerOptions,
                    schema: anthropicReasoningMetadataSchema
                  });
                  if (reasoningMetadata != null) {
                    if (reasoningMetadata.signature != null) {
                      validator.getCacheControl(part.providerOptions, {
                        type: "thinking block",
                        canCache: false
                      });
                      anthropicContent.push({
                        type: "thinking",
                        thinking: part.text,
                        signature: reasoningMetadata.signature
                      });
                    } else if (reasoningMetadata.redactedData != null) {
                      validator.getCacheControl(part.providerOptions, {
                        type: "redacted thinking block",
                        canCache: false
                      });
                      anthropicContent.push({
                        type: "redacted_thinking",
                        data: reasoningMetadata.redactedData
                      });
                    } else {
                      warnings.push({
                        type: "other",
                        message: "unsupported reasoning metadata"
                      });
                    }
                  } else {
                    warnings.push({
                      type: "other",
                      message: "unsupported reasoning metadata"
                    });
                  }
                } else {
                  warnings.push({
                    type: "other",
                    message: "sending reasoning content is disabled for this model"
                  });
                }
                break;
              }
              case "tool-call": {
                const caller = getAnthropicCaller(part.providerOptions);
                if (part.providerExecuted) {
                  const providerToolName = toolNameMapping.toProviderToolName(
                    part.toolName
                  );
                  const isMcpToolUse = ((_l = (_k = part.providerOptions) == null ? void 0 : _k.anthropic) == null ? void 0 : _l.type) === "mcp-tool-use";
                  if (isMcpToolUse) {
                    mcpToolUseIds.add(part.toolCallId);
                    const serverName = (_n = (_m = part.providerOptions) == null ? void 0 : _m.anthropic) == null ? void 0 : _n.serverName;
                    if (serverName == null || typeof serverName !== "string") {
                      warnings.push({
                        type: "other",
                        message: "mcp tool use server name is required and must be a string"
                      });
                      break;
                    }
                    anthropicContent.push({
                      type: "mcp_tool_use",
                      id: part.toolCallId,
                      name: part.toolName,
                      input: part.input,
                      server_name: serverName,
                      cache_control: cacheControl
                    });
                  } else if (
                    // code execution 20250825:
                    providerToolName === "code_execution" && part.input != null && typeof part.input === "object" && "type" in part.input && typeof part.input.type === "string" && (part.input.type === "bash_code_execution" || part.input.type === "text_editor_code_execution")
                  ) {
                    const { type: subtoolName, ...input } = part.input;
                    anthropicContent.push({
                      type: "server_tool_use",
                      id: part.toolCallId,
                      name: subtoolName,
                      // map back to subtool name
                      input,
                      ...caller && { caller },
                      cache_control: cacheControl
                    });
                  } else if (
                    // code execution 20250825 programmatic tool calling:
                    // Strip the fake 'programmatic-tool-call' type before sending to Anthropic
                    providerToolName === "code_execution" && part.input != null && typeof part.input === "object" && "type" in part.input && part.input.type === "programmatic-tool-call"
                  ) {
                    const { type: _, ...inputWithoutType } = part.input;
                    anthropicContent.push({
                      type: "server_tool_use",
                      id: part.toolCallId,
                      name: "code_execution",
                      input: inputWithoutType,
                      ...caller && { caller },
                      cache_control: cacheControl
                    });
                  } else {
                    if (providerToolName === "code_execution" || // code execution 20250522
                    providerToolName === "web_fetch" || providerToolName === "web_search") {
                      anthropicContent.push({
                        type: "server_tool_use",
                        id: part.toolCallId,
                        name: providerToolName,
                        input: part.input,
                        ...caller && { caller },
                        cache_control: cacheControl
                      });
                    } else if (providerToolName === "tool_search_tool_regex" || providerToolName === "tool_search_tool_bm25") {
                      anthropicContent.push({
                        type: "server_tool_use",
                        id: part.toolCallId,
                        name: providerToolName,
                        input: part.input,
                        ...caller && { caller },
                        cache_control: cacheControl
                      });
                    } else if (providerToolName === "advisor") {
                      anthropicContent.push({
                        type: "server_tool_use",
                        id: part.toolCallId,
                        name: "advisor",
                        input: {},
                        ...caller && { caller },
                        cache_control: cacheControl
                      });
                    } else {
                      warnings.push({
                        type: "other",
                        message: `provider executed tool call for tool ${part.toolName} is not supported`
                      });
                    }
                  }
                  break;
                }
                const toolsetName = getAnthropicToolsetName({
                  toolName: part.toolName,
                  providerOptions: part.providerOptions,
                  toolsetNames
                });
                if (toolsetName != null) {
                  const { action, ...memberInput } = typeof part.input === "object" && part.input !== null && !Array.isArray(part.input) ? part.input : {};
                  if (typeof action !== "string") {
                    warnings.push({
                      type: "other",
                      message: `toolset tool call for tool ${part.toolName} is missing the action`
                    });
                    break;
                  }
                  anthropicContent.push({
                    type: "tool_use",
                    id: part.toolCallId,
                    name: action,
                    toolset_name: toolsetName,
                    input: memberInput,
                    ...caller && { caller },
                    cache_control: cacheControl
                  });
                  break;
                }
                anthropicContent.push({
                  type: "tool_use",
                  id: part.toolCallId,
                  name: part.toolName,
                  input: parseToolCallInput(part.input),
                  ...caller && { caller },
                  cache_control: cacheControl
                });
                break;
              }
              case "tool-result": {
                const providerToolName = toolNameMapping.toProviderToolName(
                  part.toolName
                );
                const caller = getAnthropicCaller(part.providerOptions);
                if (mcpToolUseIds.has(part.toolCallId)) {
                  const output = part.output;
                  if (output.type !== "json" && output.type !== "error-json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  anthropicContent.push({
                    type: "mcp_tool_result",
                    tool_use_id: part.toolCallId,
                    is_error: output.type === "error-json",
                    content: output.value,
                    cache_control: cacheControl
                  });
                } else if (providerToolName === "code_execution") {
                  const output = part.output;
                  if (output.type === "error-text" || output.type === "error-json") {
                    let errorInfo = {};
                    try {
                      if (typeof output.value === "string") {
                        errorInfo = secureJsonParse(output.value);
                      } else if (typeof output.value === "object" && output.value !== null) {
                        errorInfo = output.value;
                      }
                    } catch (e) {
                    }
                    if (errorInfo.type === "code_execution_tool_result_error") {
                      anthropicContent.push({
                        type: "code_execution_tool_result",
                        tool_use_id: part.toolCallId,
                        content: {
                          type: "code_execution_tool_result_error",
                          error_code: (_o = errorInfo.errorCode) != null ? _o : "unknown"
                        },
                        cache_control: cacheControl
                      });
                    } else {
                      anthropicContent.push({
                        type: "bash_code_execution_tool_result",
                        tool_use_id: part.toolCallId,
                        cache_control: cacheControl,
                        content: {
                          type: "bash_code_execution_tool_result_error",
                          error_code: (_p = errorInfo.errorCode) != null ? _p : "unknown"
                        }
                      });
                    }
                    break;
                  }
                  if (output.type !== "json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  if (output.value == null || typeof output.value !== "object" || !("type" in output.value) || typeof output.value.type !== "string") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output value is not a valid code execution result for tool ${part.toolName}`
                    });
                    break;
                  }
                  if (output.value.type === "code_execution_result") {
                    const codeExecutionOutput = await validateTypes({
                      value: output.value,
                      schema: codeExecution_20250522OutputSchema
                    });
                    anthropicContent.push({
                      type: "code_execution_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: codeExecutionOutput.type,
                        stdout: codeExecutionOutput.stdout,
                        stderr: codeExecutionOutput.stderr,
                        return_code: codeExecutionOutput.return_code,
                        content: (_q = codeExecutionOutput.content) != null ? _q : []
                      },
                      cache_control: cacheControl
                    });
                  } else if (output.value.type === "encrypted_code_execution_result") {
                    const codeExecutionOutput = await validateTypes({
                      value: output.value,
                      schema: codeExecution_20260120OutputSchema
                    });
                    if (codeExecutionOutput.type === "encrypted_code_execution_result") {
                      anthropicContent.push({
                        type: "code_execution_tool_result",
                        tool_use_id: part.toolCallId,
                        content: {
                          type: codeExecutionOutput.type,
                          encrypted_stdout: codeExecutionOutput.encrypted_stdout,
                          stderr: codeExecutionOutput.stderr,
                          return_code: codeExecutionOutput.return_code,
                          content: (_r = codeExecutionOutput.content) != null ? _r : []
                        },
                        cache_control: cacheControl
                      });
                    }
                  } else {
                    const codeExecutionOutput = await validateTypes({
                      value: output.value,
                      schema: codeExecution_20250825OutputSchema
                    });
                    if (codeExecutionOutput.type === "code_execution_result") {
                      anthropicContent.push({
                        type: "code_execution_tool_result",
                        tool_use_id: part.toolCallId,
                        content: {
                          type: codeExecutionOutput.type,
                          stdout: codeExecutionOutput.stdout,
                          stderr: codeExecutionOutput.stderr,
                          return_code: codeExecutionOutput.return_code,
                          content: (_s = codeExecutionOutput.content) != null ? _s : []
                        },
                        cache_control: cacheControl
                      });
                    } else if (codeExecutionOutput.type === "bash_code_execution_result" || codeExecutionOutput.type === "bash_code_execution_tool_result_error") {
                      anthropicContent.push({
                        type: "bash_code_execution_tool_result",
                        tool_use_id: part.toolCallId,
                        cache_control: cacheControl,
                        // Prompt caching requires stable key ordering:
                        // https://platform.claude.com/docs/en/build-with-claude/prompt-caching#troubleshooting-common-issues
                        content: codeExecutionOutput.type === "bash_code_execution_result" ? {
                          type: codeExecutionOutput.type,
                          stdout: codeExecutionOutput.stdout,
                          stderr: codeExecutionOutput.stderr,
                          return_code: codeExecutionOutput.return_code,
                          content: codeExecutionOutput.content
                        } : codeExecutionOutput
                      });
                    } else {
                      anthropicContent.push({
                        type: "text_editor_code_execution_tool_result",
                        tool_use_id: part.toolCallId,
                        cache_control: cacheControl,
                        content: codeExecutionOutput
                      });
                    }
                  }
                  break;
                }
                if (providerToolName === "web_fetch") {
                  const output = part.output;
                  if (output.type === "error-json") {
                    anthropicContent.push({
                      type: "web_fetch_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: "web_fetch_tool_result_error",
                        error_code: (_t = (await extractErrorValue(output.value)).errorCode) != null ? _t : "unavailable"
                      },
                      ...caller && { caller },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  if (output.type !== "json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  const webFetchOutput = await validateTypes({
                    value: output.value,
                    schema: webFetch_20250910OutputSchema
                  });
                  anthropicContent.push({
                    type: "web_fetch_tool_result",
                    tool_use_id: part.toolCallId,
                    content: {
                      type: "web_fetch_result",
                      url: webFetchOutput.url,
                      retrieved_at: webFetchOutput.retrievedAt,
                      content: {
                        type: "document",
                        title: webFetchOutput.content.title,
                        citations: webFetchOutput.content.citations,
                        source: {
                          type: webFetchOutput.content.source.type,
                          media_type: webFetchOutput.content.source.mediaType,
                          data: webFetchOutput.content.source.data
                        }
                      }
                    },
                    ...caller && { caller },
                    cache_control: cacheControl
                  });
                  break;
                }
                if (providerToolName === "web_search") {
                  const output = part.output;
                  if (output.type === "error-json") {
                    anthropicContent.push({
                      type: "web_search_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: "web_search_tool_result_error",
                        error_code: (_u = (await extractErrorValue(output.value)).errorCode) != null ? _u : "unavailable"
                      },
                      ...caller && { caller },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  if (output.type !== "json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  const webSearchOutput = await validateTypes({
                    value: output.value,
                    schema: webSearch_20250305OutputSchema
                  });
                  anthropicContent.push({
                    type: "web_search_tool_result",
                    tool_use_id: part.toolCallId,
                    content: webSearchOutput.map((result) => ({
                      url: result.url,
                      title: result.title,
                      page_age: result.pageAge,
                      encrypted_content: result.encryptedContent,
                      type: result.type
                    })),
                    ...caller && { caller },
                    cache_control: cacheControl
                  });
                  break;
                }
                if (providerToolName === "tool_search_tool_regex" || providerToolName === "tool_search_tool_bm25") {
                  const output = part.output;
                  if (output.type === "error-json" || output.type === "json" && output.value != null && typeof output.value === "object" && !Array.isArray(output.value) && "type" in output.value && output.value.type === "tool_search_tool_result_error") {
                    anthropicContent.push({
                      type: "tool_search_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: "tool_search_tool_result_error",
                        error_code: (_v = (await extractErrorValue(output.value)).errorCode) != null ? _v : "unavailable"
                      },
                      cache_control: cacheControl
                    });
                    break;
                  }
                  if (output.type !== "json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  const toolSearchOutput = await validateTypes({
                    value: output.value,
                    schema: toolSearchRegex_20251119OutputSchema
                  });
                  const toolReferences = toolSearchOutput.map((ref) => ({
                    type: "tool_reference",
                    tool_name: ref.toolName
                  }));
                  anthropicContent.push({
                    type: "tool_search_tool_result",
                    tool_use_id: part.toolCallId,
                    content: {
                      type: "tool_search_tool_search_result",
                      tool_references: toolReferences
                    },
                    cache_control: cacheControl
                  });
                  break;
                }
                if (providerToolName === "advisor") {
                  const output = part.output;
                  if (output.type !== "json" && output.type !== "error-json") {
                    warnings.push({
                      type: "other",
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`
                    });
                    break;
                  }
                  const advisorOutput = await validateTypes({
                    value: output.value,
                    schema: advisor_20260301OutputSchema
                  });
                  if (advisorOutput.type === "advisor_result") {
                    anthropicContent.push({
                      type: "advisor_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: "advisor_result",
                        text: advisorOutput.text
                      },
                      cache_control: cacheControl
                    });
                  } else if (advisorOutput.type === "advisor_redacted_result") {
                    anthropicContent.push({
                      type: "advisor_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: "advisor_redacted_result",
                        encrypted_content: advisorOutput.encryptedContent
                      },
                      cache_control: cacheControl
                    });
                  } else {
                    anthropicContent.push({
                      type: "advisor_tool_result",
                      tool_use_id: part.toolCallId,
                      content: {
                        type: "advisor_tool_result_error",
                        error_code: advisorOutput.errorCode
                      },
                      cache_control: cacheControl
                    });
                  }
                  break;
                }
                warnings.push({
                  type: "other",
                  message: `provider executed tool result for tool ${part.toolName} is not supported`
                });
                break;
              }
            }
          }
        }
        messages.push({
          role: "assistant",
          content: moveToolUseBlocksToEnd(anthropicContent)
        });
        break;
      }
      default: {
        const _exhaustiveCheck = type;
        throw new Error(`content type: ${_exhaustiveCheck}`);
      }
    }
  }
  const codeExecutionToolCallIds = /* @__PURE__ */ new Set();
  for (const message of messages) {
    if (message.role !== "assistant") {
      continue;
    }
    for (const part of message.content) {
      if (part.type === "server_tool_use" && part.name === "code_execution") {
        codeExecutionToolCallIds.add(part.id);
      }
    }
  }
  const warnedToolCallIds = /* @__PURE__ */ new Set();
  for (let i = 0; i < lastUserMessageIndex; i++) {
    const message = messages[i];
    if (message.role !== "assistant") {
      continue;
    }
    for (const part of message.content) {
      if (!("caller" in part)) {
        continue;
      }
      const caller = part.caller;
      if (caller == null || caller.type === "direct" || codeExecutionToolCallIds.has(caller.tool_id)) {
        continue;
      }
      const toolCallId = "id" in part ? part.id : part.tool_use_id;
      delete part.caller;
      if (!warnedToolCallIds.has(toolCallId)) {
        warnedToolCallIds.add(toolCallId);
        warnings.push({
          type: "other",
          message: `Omitted caller metadata for tool ${toolCallId} because source code execution tool ${caller.tool_id} is missing from the conversation history.`
        });
      }
    }
  }
  return {
    prompt: { system, messages },
    betas
  };
}
function groupIntoBlocks(prompt) {
  const blocks = [];
  let currentBlock = void 0;
  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case "system": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "system") {
          currentBlock = { type: "system", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "assistant": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "assistant") {
          currentBlock = { type: "assistant", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "user": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      case "tool": {
        if ((currentBlock == null ? void 0 : currentBlock.type) !== "user") {
          currentBlock = { type: "user", messages: [] };
          blocks.push(currentBlock);
        }
        currentBlock.messages.push(message);
        break;
      }
      default: {
        const _exhaustiveCheck = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }
  return blocks;
}
function moveToolUseBlocksToEnd(content) {
  const result = [];
  let segment = [];
  function flushSegment() {
    result.push(
      ...segment.filter((part) => part.type !== "tool_use"),
      ...segment.filter((part) => part.type === "tool_use")
    );
    segment = [];
  }
  for (const part of content) {
    if (part.type === "thinking" || part.type === "redacted_thinking") {
      flushSegment();
      result.push(part);
    } else {
      segment.push(part);
    }
  }
  flushSegment();
  return result;
}
function getAnthropicToolsetName({
  toolName,
  providerOptions,
  toolsetNames
}) {
  var _a21;
  const fromTools = toolsetNames[toolName];
  if (fromTools != null) {
    return fromTools;
  }
  const fromMetadata = (_a21 = providerOptions == null ? void 0 : providerOptions.anthropic) == null ? void 0 : _a21.toolsetName;
  return typeof fromMetadata === "string" ? fromMetadata : void 0;
}
function getAnthropicCaller(providerOptions) {
  var _a21;
  const caller = (_a21 = providerOptions == null ? void 0 : providerOptions.anthropic) == null ? void 0 : _a21.caller;
  if (((caller == null ? void 0 : caller.type) === "code_execution_20250825" || (caller == null ? void 0 : caller.type) === "code_execution_20260120") && caller.toolId) {
    return {
      type: caller.type,
      tool_id: caller.toolId
    };
  }
  return (caller == null ? void 0 : caller.type) === "direct" ? { type: "direct" } : void 0;
}
function parseToolCallInput(input) {
  if (typeof input === "string") {
    try {
      const parsed = secureJsonParse(input);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (e) {
    }
  }
  return input;
}
function mapAnthropicStopReason({
  finishReason,
  isJsonResponseFromTool
}) {
  switch (finishReason) {
    case "pause_turn":
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "refusal":
      return "content-filter";
    case "tool_use":
      return isJsonResponseFromTool ? "stop" : "tool-calls";
    case "max_tokens":
    case "model_context_window_exceeded":
      return "length";
    case "compaction":
      return "other";
    default:
      return "other";
  }
}
var SUPPORTED_STRING_FORMATS = /* @__PURE__ */ new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid"
]);
var DESCRIPTION_CONSTRAINT_KEYS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "not"
];
function sanitizeJsonSchema(schema) {
  return sanitizeSchema(schema);
}
function sanitizeDefinition(definition) {
  if (typeof definition === "boolean" || !isPlainObject(definition)) {
    return definition;
  }
  return sanitizeSchema(definition);
}
function sanitizeSchema(schema) {
  const result = {};
  if (schema.$ref != null) {
    return { $ref: schema.$ref, ...sanitizeSchemaDefinitions(schema) };
  }
  if (schema.$schema != null) {
    result.$schema = schema.$schema;
  }
  if (schema.$id != null) {
    result.$id = schema.$id;
  }
  if (schema.title != null) {
    result.title = schema.title;
  }
  if (schema.description != null) {
    result.description = schema.description;
  }
  if (schema.default !== void 0) {
    result.default = schema.default;
  }
  if (schema.const !== void 0) {
    result.const = schema.const;
  }
  if (schema.enum != null) {
    result.enum = schema.enum;
  }
  if (schema.type != null) {
    result.type = schema.type;
  }
  if (schema.anyOf != null) {
    result.anyOf = schema.anyOf.map(sanitizeDefinition);
  } else if (schema.oneOf != null) {
    result.anyOf = schema.oneOf.map(sanitizeDefinition);
  }
  if (schema.allOf != null) {
    result.allOf = schema.allOf.map(sanitizeDefinition);
  }
  Object.assign(result, sanitizeSchemaDefinitions(schema));
  if (schema.type === "object" || schema.properties != null) {
    if (schema.properties != null) {
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([name21, definition]) => [
          name21,
          sanitizeDefinition(definition)
        ])
      );
    }
    result.additionalProperties = false;
    if (schema.required != null) {
      result.required = schema.required;
    }
  }
  if (schema.items != null) {
    result.items = Array.isArray(schema.items) ? schema.items.map(sanitizeDefinition) : sanitizeDefinition(schema.items);
  }
  if (typeof schema.format === "string" && SUPPORTED_STRING_FORMATS.has(schema.format)) {
    result.format = schema.format;
  }
  const constraintDescription = getConstraintDescription(schema);
  if (constraintDescription != null) {
    result.description = result.description == null ? constraintDescription : `${result.description}
${constraintDescription}`;
  }
  return result;
}
function sanitizeSchemaDefinitions(schema) {
  const { $defs } = schema;
  const sanitizeAll = (definitions) => Object.fromEntries(
    Object.entries(definitions).map(([name21, definition]) => [
      name21,
      sanitizeDefinition(definition)
    ])
  );
  return {
    ...schema.definitions != null && {
      definitions: sanitizeAll(schema.definitions)
    },
    ...$defs != null && { $defs: sanitizeAll($defs) }
  };
}
function getConstraintDescription(schema) {
  const descriptions = DESCRIPTION_CONSTRAINT_KEYS.flatMap((key) => {
    const value = schema[key];
    if (value == null || value === false) {
      return [];
    }
    return `${formatConstraintName(key)}: ${formatConstraintValue(value)}`;
  });
  if (typeof schema.format === "string" && !SUPPORTED_STRING_FORMATS.has(schema.format)) {
    descriptions.push(`format: ${schema.format}`);
  }
  return descriptions.length === 0 ? void 0 : `${descriptions.join("; ")}.`;
}
function formatConstraintName(key) {
  return key.replace(/[A-Z]/g, (match) => ` ${match.toLowerCase()}`);
}
function formatConstraintValue(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var SCHEMA_MAP_KEYWORDS = /* @__PURE__ */ new Set([
  "dependentSchemas",
  "patternProperties",
  "properties"
]);
var DATA_KEYWORDS = /* @__PURE__ */ new Set(["const", "default", "enum", "examples"]);
function hasCircularSchemaReference(schema) {
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit2 = (pointer) => {
    if (visiting.has(pointer)) {
      return true;
    }
    if (visited.has(pointer)) {
      return false;
    }
    const target = resolveSchemaPointer(schema, pointer);
    if (target === void 0) {
      return false;
    }
    visiting.add(pointer);
    const isCircular = collectLocalRefs(target).some(visit2);
    visiting.delete(pointer);
    visited.add(pointer);
    return isCircular;
  };
  return visit2("#");
}
function collectLocalRefs(node, refs = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectLocalRefs(item, refs);
    }
    return refs;
  }
  if (!isRecord(node)) {
    return refs;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === "$ref") {
      if (typeof value === "string" && value.startsWith("#")) {
        refs.push(value);
      }
    } else if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      for (const subschema of Object.values(value)) {
        collectLocalRefs(subschema, refs);
      }
    } else if (
      // definitions are only reached through a `$ref`:
      key !== "$defs" && key !== "definitions" && !DATA_KEYWORDS.has(key)
    ) {
      collectLocalRefs(value, refs);
    }
  }
  return refs;
}
function resolveSchemaPointer(schema, pointer) {
  if (pointer === "#") {
    return schema;
  }
  if (!pointer.startsWith("#/")) {
    return void 0;
  }
  let decodedPointer;
  try {
    decodedPointer = decodeURIComponent(pointer.slice(2));
  } catch (e) {
    return void 0;
  }
  let current = schema;
  for (const rawSegment of decodedPointer.split("/")) {
    const segment = rawSegment.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return void 0;
    }
  }
  return current;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
var MAX_OPTIONAL_PROPERTIES = 10;
var SUBSCHEMA_KEYWORDS = [
  "additionalProperties",
  "contains",
  "else",
  "if",
  "items",
  "not",
  "then"
];
var SUBSCHEMA_LIST_KEYWORDS = ["allOf", "anyOf", "oneOf", "prefixItems"];
var SUBSCHEMA_MAP_KEYWORDS = [
  "dependentSchemas",
  "patternProperties",
  "properties"
];
function supportsNativeStructuredOutputSchema(schema) {
  if (hasCircularSchemaReference(schema)) {
    return false;
  }
  const { optionalProperties, hasOpenObject } = getSchemaStats(
    schema,
    schema,
    /* @__PURE__ */ new Map()
  );
  return !hasOpenObject && optionalProperties <= MAX_OPTIONAL_PROPERTIES;
}
function getSchemaStats(node, root, refStats) {
  const stats = { optionalProperties: 0, hasOpenObject: false };
  if (!isRecord(node)) {
    return stats;
  }
  const add = (child) => {
    const childStats = getSchemaStats(child, root, refStats);
    stats.optionalProperties += childStats.optionalProperties;
    stats.hasOpenObject || (stats.hasOpenObject = childStats.hasOpenObject);
  };
  if (typeof node.$ref === "string" && node.$ref.startsWith("#")) {
    let resolved = refStats.get(node.$ref);
    if (resolved == null) {
      resolved = getSchemaStats(
        resolveSchemaPointer(root, node.$ref),
        root,
        refStats
      );
      refStats.set(node.$ref, resolved);
    }
    stats.optionalProperties += resolved.optionalProperties;
    stats.hasOpenObject || (stats.hasOpenObject = resolved.hasOpenObject);
  }
  if (isOpenObject(node)) {
    stats.hasOpenObject = true;
  }
  if (isRecord(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    stats.optionalProperties += Object.keys(node.properties).filter(
      (name21) => !required.has(name21)
    ).length;
  }
  for (const keyword of SUBSCHEMA_KEYWORDS) {
    const value = node[keyword];
    if (Array.isArray(value)) {
      value.forEach(add);
    } else {
      add(value);
    }
  }
  for (const keyword of SUBSCHEMA_LIST_KEYWORDS) {
    const value = node[keyword];
    if (Array.isArray(value)) {
      value.forEach(add);
    }
  }
  for (const keyword of SUBSCHEMA_MAP_KEYWORDS) {
    const value = node[keyword];
    if (isRecord(value)) {
      Object.values(value).forEach(add);
    }
  }
  return stats;
}
function isOpenObject(node) {
  const { additionalProperties, patternProperties, properties, type } = node;
  if (additionalProperties === true || isRecord(additionalProperties)) {
    return true;
  }
  if (isRecord(patternProperties) && Object.keys(patternProperties).length > 0) {
    return true;
  }
  const isObjectType = type === "object" || Array.isArray(type) && type.includes("object");
  return isObjectType && properties == null && additionalProperties !== false;
}
function validateToolsetMember({
  toolsetName,
  memberName,
  tools
}) {
  var _a21, _b15;
  const toolset = tools == null ? void 0 : tools.find(
    (tool2) => "type" in tool2 && tool2.type === "computer_toolset_20260801"
  );
  if (toolsetName !== "computer" || toolset == null || !computerToolset_20260801Members.some((member) => member === memberName) || ((_b15 = (_a21 = toolset.configs) == null ? void 0 : _a21[memberName]) == null ? void 0 : _b15.enabled) === false) {
    throw new InvalidResponseDataError2({
      data: { toolsetName, memberName },
      message: `Received an unavailable toolset member: ${toolsetName}.${memberName}.`
    });
  }
}
function createCitationSource(citation, citationDocuments, generateId3) {
  var _a21;
  if (citation.type === "web_search_result_location") {
    return {
      type: "source",
      sourceType: "url",
      id: generateId3(),
      url: citation.url,
      title: citation.title,
      providerMetadata: {
        anthropic: {
          citedText: citation.cited_text,
          encryptedIndex: citation.encrypted_index
        }
      }
    };
  }
  if (citation.type !== "page_location" && citation.type !== "char_location") {
    return;
  }
  const documentInfo = citationDocuments[citation.document_index];
  if (!documentInfo) {
    return;
  }
  return {
    type: "source",
    sourceType: "document",
    id: generateId3(),
    mediaType: documentInfo.mediaType,
    title: (_a21 = citation.document_title) != null ? _a21 : documentInfo.title,
    filename: documentInfo.filename,
    providerMetadata: {
      anthropic: citation.type === "page_location" ? {
        citedText: citation.cited_text,
        startPageNumber: citation.start_page_number,
        endPageNumber: citation.end_page_number
      } : {
        citedText: citation.cited_text,
        startCharIndex: citation.start_char_index,
        endCharIndex: citation.end_char_index
      }
    }
  };
}
function getAnthropicCallerInfo(caller) {
  return caller == null ? void 0 : {
    type: caller.type,
    toolId: "tool_id" in caller ? caller.tool_id : void 0
  };
}
function getAnthropicCallerMetadata(caller) {
  const callerInfo = getAnthropicCallerInfo(caller);
  return callerInfo == null ? {} : { providerMetadata: { anthropic: { caller: callerInfo } } };
}
function getAnthropicToolsetNames(tools) {
  const toolsetNames = {};
  for (const tool2 of tools != null ? tools : []) {
    if (tool2.type === "provider" && tool2.id === "anthropic.computer_toolset_20260801") {
      toolsetNames[tool2.name] = "computer";
    }
  }
  return toolsetNames;
}
function toToolsetMemberInput({
  memberName,
  input
}) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidResponseDataError2({
      data: input,
      message: "Invalid toolset member input: expected an object."
    });
  }
  return {
    ...input,
    action: memberName
  };
}
var TEXT_OR_THINKING_BLOCK_TYPES = /* @__PURE__ */ new Set([
  "redacted_thinking",
  "text",
  "thinking"
]);
function isContinuationStopReason(stopReason) {
  return stopReason === "pause_turn" || stopReason === "tool_use";
}
function getJsonResponseToolFallbackText(content, stopReason) {
  const text2 = /* @__PURE__ */ new Set();
  if (isContinuationStopReason(stopReason)) {
    return text2;
  }
  for (const part of content) {
    if (part.type === "tool_use" && part.name === "json") {
      return /* @__PURE__ */ new Set();
    }
    if (part.type === "text") {
      text2.add(part);
    } else if (!TEXT_OR_THINKING_BLOCK_TYPES.has(part.type)) {
      text2.clear();
    }
  }
  return text2;
}
var AnthropicMessagesLanguageModel = class {
  constructor(modelId, config) {
    this.specificationVersion = "v3";
    var _a21;
    this.modelId = modelId;
    this.config = config;
    this.generateId = (_a21 = config.generateId) != null ? _a21 : generateId;
  }
  supportsUrl(url) {
    return url.protocol === "https:";
  }
  get provider() {
    return this.config.provider;
  }
  /**
   * Extracts the dynamic provider name from the config.provider string.
   * e.g., 'my-custom-anthropic.messages' -> 'my-custom-anthropic'
   */
  get providerOptionsName() {
    const provider = this.config.provider;
    const dotIndex = provider.indexOf(".");
    return dotIndex === -1 ? provider : provider.substring(0, dotIndex);
  }
  get supportedUrls() {
    var _a21, _b15, _c;
    return (_c = (_b15 = (_a21 = this.config).supportedUrls) == null ? void 0 : _b15.call(_a21)) != null ? _c : {};
  }
  async getArgs({
    userSuppliedBetas,
    prompt,
    maxOutputTokens,
    temperature,
    topP,
    topK,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    responseFormat,
    seed,
    tools,
    toolChoice,
    providerOptions,
    stream
  }) {
    var _a21, _b15, _c, _d, _e, _f, _g, _h, _i, _j;
    const warnings = [];
    if (frequencyPenalty != null) {
      warnings.push({ type: "unsupported", feature: "frequencyPenalty" });
    }
    if (presencePenalty != null) {
      warnings.push({ type: "unsupported", feature: "presencePenalty" });
    }
    if (seed != null) {
      warnings.push({ type: "unsupported", feature: "seed" });
    }
    const maxTemperature = (_a21 = this.config.maxTemperature) != null ? _a21 : 1;
    const temperatureProvider = this.config.maxTemperature == null ? "anthropic" : this.providerOptionsName;
    if (temperature != null && temperature > maxTemperature) {
      warnings.push({
        type: "unsupported",
        feature: "temperature",
        details: `${temperature} exceeds ${temperatureProvider} maximum of ${maxTemperature.toFixed(1)}. clamped to ${maxTemperature.toFixed(1)}`
      });
      temperature = maxTemperature;
    } else if (temperature != null && temperature < 0) {
      warnings.push({
        type: "unsupported",
        feature: "temperature",
        details: `${temperature} is below ${temperatureProvider} minimum of 0. clamped to 0`
      });
      temperature = 0;
    }
    if ((responseFormat == null ? void 0 : responseFormat.type) === "json") {
      if (responseFormat.schema == null) {
        warnings.push({
          type: "unsupported",
          feature: "responseFormat",
          details: "JSON response format requires a schema. The response format is ignored."
        });
      }
    }
    const providerOptionsName = this.providerOptionsName;
    const canonicalOptions = await parseProviderOptions({
      provider: "anthropic",
      providerOptions,
      schema: anthropicLanguageModelOptions
    });
    const customProviderOptions = providerOptionsName !== "anthropic" ? await parseProviderOptions({
      provider: providerOptionsName,
      providerOptions,
      schema: anthropicLanguageModelOptions
    }) : null;
    const usedCustomProviderKey = customProviderOptions != null;
    const anthropicOptions = Object.assign(
      {},
      canonicalOptions != null ? canonicalOptions : {},
      customProviderOptions != null ? customProviderOptions : {}
    );
    const {
      maxOutputTokens: maxOutputTokensForModel,
      supportsStructuredOutput: modelSupportsStructuredOutput,
      rejectsSamplingParameters,
      rejectsThinkingDisabledAboveHighEffort,
      rejectsThinkingDisabled,
      rejectsBudgetThinking,
      rejectsForcedToolUse,
      supportsBetweenToolsThinking,
      isKnownModel
    } = getModelCapabilities(this.modelId);
    if (!isKnownModel && maxOutputTokens == null) {
      warnings.push({
        type: "compatibility",
        feature: "maxOutputTokens",
        details: `The model "${this.modelId}" is unknown. The max output tokens have been limited to ${maxOutputTokensForModel}. Set maxOutputTokens explicitly to override this limit.`
      });
    }
    if (rejectsSamplingParameters) {
      if (temperature != null) {
        warnings.push({
          type: "unsupported",
          feature: "temperature",
          details: `temperature is not supported by ${this.modelId} and will be ignored`
        });
        temperature = void 0;
      }
      if (topK != null) {
        warnings.push({
          type: "unsupported",
          feature: "topK",
          details: `topK is not supported by ${this.modelId} and will be ignored`
        });
        topK = void 0;
      }
      if (topP != null) {
        warnings.push({
          type: "unsupported",
          feature: "topP",
          details: `topP is not supported by ${this.modelId} and will be ignored`
        });
        topP = void 0;
      }
    }
    const isAnthropicModel = isKnownModel || this.modelId.includes("claude-");
    const supportsStructuredOutput = ((_b15 = this.config.supportsNativeStructuredOutput) != null ? _b15 : true) && modelSupportsStructuredOutput;
    const supportsResponseSchema = (responseFormat == null ? void 0 : responseFormat.type) !== "json" || responseFormat.schema == null || supportsNativeStructuredOutputSchema(responseFormat.schema);
    const supportsStrictTools = ((_c = this.config.supportsStrictTools) != null ? _c : true) && modelSupportsStructuredOutput;
    const structureOutputMode = (_d = anthropicOptions == null ? void 0 : anthropicOptions.structuredOutputMode) != null ? _d : "auto";
    let useStructuredOutput = structureOutputMode === "outputFormat" || structureOutputMode === "auto" && supportsStructuredOutput && supportsResponseSchema;
    if (!useStructuredOutput && rejectsForcedToolUse && modelSupportsStructuredOutput && (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && supportsNativeStructuredOutputSchema(responseFormat.schema)) {
      warnings.push({
        type: "unsupported",
        feature: "providerOptions.anthropic.structuredOutputMode",
        details: `structuredOutputMode 'jsonTool' is not supported by ${this.modelId} because it rejects forced tool use. Using 'outputFormat' instead.`
      });
      useStructuredOutput = true;
    }
    const jsonResponseTool = (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && !useStructuredOutput ? {
      type: "function",
      name: "json",
      description: "Respond with a JSON object.",
      inputSchema: responseFormat.schema
    } : void 0;
    if (jsonResponseTool != null && (anthropicOptions == null ? void 0 : anthropicOptions.disableParallelToolUse) === false) {
      warnings.push({
        type: "unsupported",
        feature: "providerOptions.anthropic.disableParallelToolUse",
        details: "`disableParallelToolUse: false` is ignored when using the JSON response tool. Parallel tool use is disabled to ensure a single coherent JSON tool call."
      });
    }
    const contextManagement = anthropicOptions == null ? void 0 : anthropicOptions.contextManagement;
    const cacheControlValidator = new CacheControlValidator(
      this.config.cacheControlProviderOptionsName
    );
    const defaultEagerInputStreaming = stream && ((_e = anthropicOptions == null ? void 0 : anthropicOptions.toolStreaming) != null ? _e : true);
    const inlineTools = await getInlineToolsFromPrompt(prompt);
    const declaredFunctionToolNames = new Set(
      (tools != null ? tools : []).flatMap(
        (tool2) => tool2.type === "function" ? [tool2.name] : []
      )
    );
    const toolNameMapping = createToolNameMapping({
      // later entries win when provider tool names collide, so the declared
      // tools go last and an inline tool cannot take over their mapping:
      tools: [
        ...inlineTools.filter(
          (tool2) => !(tool2.type === "provider" && declaredFunctionToolNames.has(tool2.name))
        ),
        ...tools != null ? tools : []
      ],
      providerToolNames: {
        "anthropic.code_execution_20250522": "code_execution",
        "anthropic.code_execution_20250825": "code_execution",
        "anthropic.code_execution_20260120": "code_execution",
        "anthropic.computer_20241022": "computer",
        "anthropic.computer_20250124": "computer",
        "anthropic.computer_20251124": "computer",
        "anthropic.computer_toolset_20260801": "computer",
        "anthropic.text_editor_20241022": "str_replace_editor",
        "anthropic.text_editor_20250124": "str_replace_editor",
        "anthropic.text_editor_20250429": "str_replace_based_edit_tool",
        "anthropic.text_editor_20250728": "str_replace_based_edit_tool",
        "anthropic.bash_20241022": "bash",
        "anthropic.bash_20250124": "bash",
        "anthropic.memory_20250818": "memory",
        "anthropic.web_search_20250305": "web_search",
        "anthropic.web_search_20260209": "web_search",
        "anthropic.web_fetch_20250910": "web_fetch",
        "anthropic.web_fetch_20260209": "web_fetch",
        "anthropic.tool_search_regex_20251119": "tool_search_tool_regex",
        "anthropic.tool_search_bm25_20251119": "tool_search_tool_bm25",
        "anthropic.advisor_20260301": "advisor"
      }
    });
    const toolsetNames = getAnthropicToolsetNames(tools);
    const inlineToolDefinitions = [];
    const { prompt: messagesPrompt, betas } = await convertToAnthropicMessagesPrompt({
      prompt,
      sendReasoning: (_f = anthropicOptions == null ? void 0 : anthropicOptions.sendReasoning) != null ? _f : true,
      warnings,
      cacheControlValidator,
      toolNameMapping,
      toolsetNames,
      convertMediaPart: this.config.convertMediaPart,
      convertInlineTool: async (tool2) => {
        const {
          tools: definitions,
          toolWarnings: toolWarnings2,
          betas: betas2
        } = await prepareTools({
          tools: [tool2],
          toolChoice: void 0,
          cacheControlValidator,
          supportsStructuredOutput,
          supportsStrictTools
          // no stream-dependent defaults (eager input streaming): the
          // definition is replayed on every request and has to stay
          // identical between streaming and non-streaming calls to keep
          // the cache.
        });
        if ((definitions == null ? void 0 : definitions[0]) != null) {
          inlineToolDefinitions.push({
            sdkName: tool2.name,
            definition: definitions[0]
          });
        }
        return {
          definition: definitions == null ? void 0 : definitions[0],
          warnings: toolWarnings2,
          betas: betas2
        };
      }
    });
    const emittedInlineDefinitions = new Set(
      messagesPrompt.messages.flatMap(
        (message) => message.role === "system" ? message.content.flatMap(
          (part) => part.type === "tool_addition" && part.tool.type === "tool_definition" ? [part.tool.definition] : []
        ) : []
      )
    );
    if (emittedInlineDefinitions.size > 0 && (anthropicOptions == null ? void 0 : anthropicOptions.allowInlineToolDefinitions) !== true) {
      throw new InvalidArgumentError$1({
        argument: "providerOptions.anthropic.allowInlineToolDefinitions",
        message: "Inline tool definitions require providerOptions.anthropic.allowInlineToolDefinitions to be true. Enable this option only for server-controlled messages, or declare tools in the tools option and add them by reference with toolName."
      });
    }
    if (rejectsThinkingDisabled && (anthropicOptions == null ? void 0 : anthropicOptions.thinking) != null) {
      const requestedThinking = anthropicOptions.thinking;
      const requestedType = "type" in requestedThinking ? requestedThinking.type : void 0;
      if (requestedType === "disabled" && supportsBetweenToolsThinking) {
        warnings.push({
          type: "unsupported",
          feature: "providerOptions.anthropic.thinking",
          details: `thinking cannot be disabled for ${this.modelId}. Using 'between_tools' thinking, the lowest thinking setting, instead.`
        });
        anthropicOptions.thinking = { type: "between_tools" };
      } else if (requestedType === "disabled") {
        warnings.push({
          type: "unsupported",
          feature: "providerOptions.anthropic.thinking",
          details: `thinking cannot be disabled for ${this.modelId}; it always uses adaptive thinking. The thinking setting has been removed. Lower 'effort' to reduce thinking.`
        });
        anthropicOptions.thinking = void 0;
      }
    }
    if (rejectsBudgetThinking && (anthropicOptions == null ? void 0 : anthropicOptions.thinking) != null && "type" in anthropicOptions.thinking && anthropicOptions.thinking.type === "enabled") {
      warnings.push({
        type: "unsupported",
        feature: "providerOptions.anthropic.thinking",
        details: rejectsThinkingDisabled ? `budget-based thinking is not supported by ${this.modelId}; it always uses adaptive thinking. Using adaptive thinking instead. Use 'effort' to control how much the model thinks.` : `budget-based thinking is not supported by ${this.modelId}. Using adaptive thinking instead. Use 'effort' to control how much the model thinks.`
      });
      anthropicOptions.thinking = { type: "adaptive" };
    }
    const thinking = anthropicOptions == null ? void 0 : anthropicOptions.thinking;
    const thinkingType = thinking != null && "type" in thinking ? thinking.type : void 0;
    if (rejectsThinkingDisabledAboveHighEffort && thinkingType === "disabled" && (anthropicOptions.effort === "xhigh" || anthropicOptions.effort === "max")) {
      warnings.push({
        type: "unsupported",
        feature: "providerOptions.anthropic.effort",
        details: `effort '${anthropicOptions.effort}' is not supported by ${this.modelId} when thinking is disabled. The effort has been lowered to 'high'.`
      });
      anthropicOptions.effort = "high";
    }
    if (thinkingType === "between_tools" && (anthropicOptions.effort === "xhigh" || anthropicOptions.effort === "max")) {
      warnings.push({
        type: "unsupported",
        feature: "providerOptions.anthropic.effort",
        details: `effort '${anthropicOptions.effort}' is not supported with 'between_tools' thinking. The effort has been lowered to 'high'.`
      });
      anthropicOptions.effort = "high";
    }
    const isThinking = thinkingType === "enabled" || thinkingType === "adaptive" || thinkingType === "between_tools";
    const sendThinking = isThinking || thinkingType === "disabled";
    let thinkingBudget = thinkingType === "enabled" && thinking != null && "budgetTokens" in thinking ? thinking.budgetTokens : void 0;
    const thinkingDisplay = thinkingType === "adaptive" && thinking != null && "display" in thinking ? thinking.display : void 0;
    const thinkingBlockBinding = thinking != null && "blockBinding" in thinking ? thinking.blockBinding : void 0;
    const sendThinkingConfig = sendThinking || thinkingBlockBinding != null;
    const maxTokens = maxOutputTokens != null ? maxOutputTokens : maxOutputTokensForModel;
    const baseArgs = {
      // model id:
      model: this.modelId,
      // standardized settings:
      max_tokens: maxTokens,
      temperature,
      top_k: topK,
      top_p: topP,
      stop_sequences: stopSequences,
      // provider specific settings:
      ...sendThinkingConfig && {
        thinking: {
          ...thinkingType != null && { type: thinkingType },
          ...thinkingBudget != null && { budget_tokens: thinkingBudget },
          ...thinkingDisplay != null && { display: thinkingDisplay },
          ...thinkingBlockBinding != null && {
            block_binding: {
              prefix_mismatch_behavior: thinkingBlockBinding.prefixMismatchBehavior
            }
          }
        }
      },
      ...((anthropicOptions == null ? void 0 : anthropicOptions.effort) || (anthropicOptions == null ? void 0 : anthropicOptions.taskBudget) || useStructuredOutput && (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null) && {
        output_config: {
          ...(anthropicOptions == null ? void 0 : anthropicOptions.effort) && {
            effort: anthropicOptions.effort
          },
          ...(anthropicOptions == null ? void 0 : anthropicOptions.taskBudget) && {
            task_budget: {
              type: anthropicOptions.taskBudget.type,
              total: anthropicOptions.taskBudget.total,
              ...anthropicOptions.taskBudget.remaining != null && {
                remaining: anthropicOptions.taskBudget.remaining
              }
            }
          },
          ...useStructuredOutput && (responseFormat == null ? void 0 : responseFormat.type) === "json" && responseFormat.schema != null && {
            format: {
              type: "json_schema",
              schema: sanitizeJsonSchema(responseFormat.schema)
            }
          }
        }
      },
      ...(anthropicOptions == null ? void 0 : anthropicOptions.speed) && {
        speed: anthropicOptions.speed
      },
      ...(anthropicOptions == null ? void 0 : anthropicOptions.inferenceGeo) && {
        inference_geo: anthropicOptions.inferenceGeo
      },
      ...(anthropicOptions == null ? void 0 : anthropicOptions.fallbacks) != null && (anthropicOptions.fallbacks === "default" || anthropicOptions.fallbacks.length > 0) && {
        fallbacks: anthropicOptions.fallbacks
      },
      ...(anthropicOptions == null ? void 0 : anthropicOptions.cacheControl) && {
        cache_control: anthropicOptions.cacheControl
      },
      ...((_g = anthropicOptions == null ? void 0 : anthropicOptions.metadata) == null ? void 0 : _g.userId) != null && {
        metadata: { user_id: anthropicOptions.metadata.userId }
      },
      // mcp servers:
      ...(anthropicOptions == null ? void 0 : anthropicOptions.mcpServers) && anthropicOptions.mcpServers.length > 0 && {
        mcp_servers: anthropicOptions.mcpServers.map((server) => ({
          type: server.type,
          name: server.name,
          url: server.url,
          authorization_token: server.authorizationToken,
          tool_configuration: server.toolConfiguration ? {
            allowed_tools: server.toolConfiguration.allowedTools,
            enabled: server.toolConfiguration.enabled
          } : void 0
        }))
      },
      // container: For programmatic tool calling (just an ID string) or agent skills (object with id and skills)
      ...(anthropicOptions == null ? void 0 : anthropicOptions.container) && {
        container: anthropicOptions.container.skills && anthropicOptions.container.skills.length > 0 ? (
          // Object format when skills are provided (agent skills feature)
          {
            id: anthropicOptions.container.id,
            skills: anthropicOptions.container.skills.map((skill) => ({
              type: skill.type,
              skill_id: skill.skillId,
              version: skill.version
            }))
          }
        ) : (
          // String format for container ID only (programmatic tool calling)
          anthropicOptions.container.id
        )
      },
      // prompt:
      system: messagesPrompt.system,
      messages: messagesPrompt.messages,
      ...(anthropicOptions == null ? void 0 : anthropicOptions.safeguards) && anthropicOptions.safeguards.length > 0 && {
        safeguards: anthropicOptions.safeguards.map((safeguard) => ({
          type: safeguard.type,
          ...safeguard.classifierContext !== void 0 && {
            classifier_context: safeguard.classifierContext
          }
        }))
      },
      ...contextManagement && {
        context_management: {
          edits: contextManagement.edits.map((edit) => {
            const strategy = edit.type;
            switch (strategy) {
              case "clear_tool_uses_20250919":
                return {
                  type: edit.type,
                  ...edit.trigger !== void 0 && {
                    trigger: edit.trigger
                  },
                  ...edit.keep !== void 0 && { keep: edit.keep },
                  ...edit.clearAtLeast !== void 0 && {
                    clear_at_least: edit.clearAtLeast
                  },
                  ...edit.clearToolInputs !== void 0 && {
                    clear_tool_inputs: edit.clearToolInputs
                  },
                  ...edit.excludeTools !== void 0 && {
                    exclude_tools: edit.excludeTools
                  }
                };
              case "clear_thinking_20251015":
                return {
                  type: edit.type,
                  ...edit.keep !== void 0 && { keep: edit.keep }
                };
              case "compact_20260112":
                return {
                  type: edit.type,
                  ...edit.trigger !== void 0 && {
                    trigger: edit.trigger
                  },
                  ...edit.pauseAfterCompaction !== void 0 && {
                    pause_after_compaction: edit.pauseAfterCompaction
                  },
                  ...edit.instructions !== void 0 && {
                    instructions: edit.instructions
                  }
                };
              default:
                warnings.push({
                  type: "other",
                  message: `Unknown context management strategy: ${strategy}`
                });
                return void 0;
            }
          }).filter((edit) => edit !== void 0)
        }
      }
    };
    if (isThinking) {
      if (thinkingType === "enabled" && thinkingBudget == null) {
        warnings.push({
          type: "compatibility",
          feature: "extended thinking",
          details: "thinking budget is required when thinking is enabled. using default budget of 1024 tokens."
        });
        baseArgs.thinking = {
          type: "enabled",
          budget_tokens: 1024
        };
        thinkingBudget = 1024;
      }
      if (baseArgs.temperature != null && !this.config.supportsTemperatureAndTopPWithThinking) {
        baseArgs.temperature = void 0;
        warnings.push({
          type: "unsupported",
          feature: "temperature",
          details: "temperature is not supported when thinking is enabled"
        });
      }
      if (topK != null) {
        baseArgs.top_k = void 0;
        warnings.push({
          type: "unsupported",
          feature: "topK",
          details: "topK is not supported when thinking is enabled"
        });
      }
      if (topP != null && !this.config.supportsTemperatureAndTopPWithThinking) {
        baseArgs.top_p = void 0;
        warnings.push({
          type: "unsupported",
          feature: "topP",
          details: "topP is not supported when thinking is enabled"
        });
      }
      baseArgs.max_tokens = maxTokens + (thinkingBudget != null ? thinkingBudget : 0);
    } else {
      if (isAnthropicModel && topP != null && temperature != null) {
        warnings.push({
          type: "unsupported",
          feature: "topP",
          details: `topP is not supported when temperature is set. topP is ignored.`
        });
        baseArgs.top_p = void 0;
      }
    }
    if (isKnownModel && baseArgs.max_tokens > maxOutputTokensForModel) {
      if (maxOutputTokens != null) {
        warnings.push({
          type: "unsupported",
          feature: "maxOutputTokens",
          details: `${baseArgs.max_tokens} (maxOutputTokens + thinkingBudget) is greater than ${this.modelId} ${maxOutputTokensForModel} max output tokens. The max output tokens have been limited to ${maxOutputTokensForModel}.`
        });
      }
      baseArgs.max_tokens = maxOutputTokensForModel;
    }
    if ((anthropicOptions == null ? void 0 : anthropicOptions.mcpServers) && anthropicOptions.mcpServers.length > 0) {
      betas.add("mcp-client-2025-04-04");
    }
    if ((anthropicOptions == null ? void 0 : anthropicOptions.safeguards) && anthropicOptions.safeguards.length > 0) {
      betas.add("dangerous-tool-use-2026-09-03");
    }
    if (contextManagement) {
      betas.add("context-management-2025-06-27");
      if (contextManagement.edits.some((e) => e.type === "compact_20260112")) {
        betas.add("compact-2026-01-12");
      }
    }
    if ((anthropicOptions == null ? void 0 : anthropicOptions.container) && anthropicOptions.container.skills && anthropicOptions.container.skills.length > 0) {
      betas.add("code-execution-2025-08-25");
      betas.add("skills-2025-10-02");
      betas.add("files-api-2025-04-14");
      if (!(tools == null ? void 0 : tools.some(
        (tool2) => tool2.type === "provider" && (tool2.id === "anthropic.code_execution_20250825" || tool2.id === "anthropic.code_execution_20260120")
      ))) {
        warnings.push({
          type: "other",
          message: "code execution tool is required when using skills"
        });
      }
    }
    if (anthropicOptions == null ? void 0 : anthropicOptions.taskBudget) {
      betas.add("task-budgets-2026-03-13");
    }
    if (thinkingDisplay === "updates") {
      betas.add("thinking-display-updates-2026-08-18");
    }
    if (thinkingBlockBinding != null) {
      betas.add("thinking-binding-controls-2026-08-01");
    }
    if ((anthropicOptions == null ? void 0 : anthropicOptions.speed) === "fast") {
      betas.add("fast-mode-2026-02-01");
    }
    if ((anthropicOptions == null ? void 0 : anthropicOptions.fallbacks) === "default") {
      betas.add("server-side-fallback-2026-07-01");
    } else if ((anthropicOptions == null ? void 0 : anthropicOptions.fallbacks) && anthropicOptions.fallbacks.length > 0) {
      betas.add("server-side-fallback-2026-06-01");
    }
    const {
      tools: anthropicTools2,
      toolChoice: anthropicToolChoice,
      toolWarnings,
      betas: toolsBetas
    } = await prepareTools(
      jsonResponseTool != null ? {
        tools: [
          ...(tools != null ? tools : []).filter(
            (tool2) => (toolChoice == null ? void 0 : toolChoice.type) !== "none" && ((toolChoice == null ? void 0 : toolChoice.type) !== "tool" || tool2.name === toolChoice.toolName)
          ),
          jsonResponseTool
        ],
        toolChoice: { type: "required" },
        disableParallelToolUse: true,
        cacheControlValidator,
        supportsStructuredOutput: false,
        supportsStrictTools,
        defaultEagerInputStreaming,
        rejectsForcedToolUse: rejectsForcedToolUse || thinkingType === "enabled"
      } : {
        tools: tools != null ? tools : [],
        toolChoice,
        // tool changes can add tools when `tools` is empty, so the tool
        // choice and parallel tool use settings still apply:
        hasInlineTools: inlineTools.length > 0,
        disableParallelToolUse: anthropicOptions == null ? void 0 : anthropicOptions.disableParallelToolUse,
        cacheControlValidator,
        supportsStructuredOutput,
        supportsStrictTools,
        defaultEagerInputStreaming,
        rejectsForcedToolUse: rejectsForcedToolUse || thinkingType === "enabled"
      }
    );
    if ((toolChoice == null ? void 0 : toolChoice.type) === "tool" && ((anthropicToolChoice == null ? void 0 : anthropicToolChoice.type) === "auto" || jsonResponseTool != null) || (toolChoice == null ? void 0 : toolChoice.type) === "none" && jsonResponseTool != null) {
      for (const server of (_h = baseArgs.mcp_servers) != null ? _h : []) {
        server.tool_configuration = {
          allowed_tools: (_i = server.tool_configuration) == null ? void 0 : _i.allowed_tools,
          enabled: false
        };
      }
      const selectedSdkName = toolChoice.type === "tool" ? toolChoice.toolName : void 0;
      const selectedTool = tools == null ? void 0 : tools.find((tool2) => tool2.name === selectedSdkName);
      const selectedProviderName = jsonResponseTool != null && selectedSdkName != null && (selectedTool == null ? void 0 : selectedTool.type) !== "function" ? toolNameMapping.toProviderToolName(selectedSdkName) : selectedSdkName;
      const conflictingTool = inlineToolDefinitions.find(
        ({ sdkName, definition }) => emittedInlineDefinitions.has(definition) && (toolChoice.type === "none" || // The JSON-tool path filters application tools by SDK name before
        // conversion; the forced-choice fallback filters by provider name.
        jsonResponseTool != null && sdkName !== selectedSdkName || !("name" in definition) || definition.name !== selectedProviderName)
      );
      if (conflictingTool != null) {
        const toolName = "name" in conflictingTool.definition ? conflictingTool.definition.name : conflictingTool.definition.type;
        const choice2 = toolChoice.type === "tool" ? `named tool choice '${toolChoice.toolName}'` : `tool choice 'none'`;
        throw new InvalidArgumentError$1({
          argument: "toolChoice",
          message: `Inline tool '${toolName}' conflicts with ${choice2}. Inline definitions must respect the tool choice when forced tool use falls back or the JSON response tool is used.`
        });
      }
    }
    const cacheWarnings = cacheControlValidator.getWarnings();
    return {
      args: {
        ...baseArgs,
        tools: anthropicTools2,
        tool_choice: anthropicToolChoice,
        stream: stream === true ? true : void 0
        // do not send when not streaming
      },
      warnings: [...warnings, ...toolWarnings, ...cacheWarnings],
      betas: /* @__PURE__ */ new Set([
        ...betas,
        ...toolsBetas,
        ...userSuppliedBetas,
        ...(_j = anthropicOptions == null ? void 0 : anthropicOptions.anthropicBeta) != null ? _j : []
      ]),
      usesJsonResponseTool: jsonResponseTool != null,
      toolNameMapping,
      providerOptionsName,
      usedCustomProviderKey
    };
  }
  async getHeaders({
    betas,
    headers
  }) {
    return combineHeaders(
      await resolve(this.config.headers),
      headers,
      betas.size > 0 ? { "anthropic-beta": Array.from(betas).join(",") } : {}
    );
  }
  async getBetasFromHeaders(requestHeaders) {
    var _a21, _b15;
    const configHeaders = await resolve(this.config.headers);
    const configBetaHeader = (_a21 = configHeaders["anthropic-beta"]) != null ? _a21 : "";
    const requestBetaHeader = (_b15 = requestHeaders == null ? void 0 : requestHeaders["anthropic-beta"]) != null ? _b15 : "";
    return new Set(
      [
        ...configBetaHeader.toLowerCase().split(","),
        ...requestBetaHeader.toLowerCase().split(",")
      ].map((beta) => beta.trim()).filter((beta) => beta !== "")
    );
  }
  buildRequestUrl(isStreaming) {
    var _a21, _b15, _c;
    return (_c = (_b15 = (_a21 = this.config).buildRequestUrl) == null ? void 0 : _b15.call(_a21, this.config.baseURL, isStreaming)) != null ? _c : `${this.config.baseURL}/messages`;
  }
  transformRequestBody(args, betas) {
    var _a21, _b15, _c;
    return (_c = (_b15 = (_a21 = this.config).transformRequestBody) == null ? void 0 : _b15.call(_a21, args, betas)) != null ? _c : args;
  }
  extractCitationDocuments(prompt) {
    const isCitationPart = (part) => {
      var _a21, _b15;
      if (part.type !== "file") {
        return false;
      }
      if (part.mediaType !== "application/pdf" && part.mediaType !== "text/plain") {
        return false;
      }
      const anthropic2 = (_a21 = part.providerOptions) == null ? void 0 : _a21.anthropic;
      const citationsConfig = anthropic2 == null ? void 0 : anthropic2.citations;
      return (_b15 = citationsConfig == null ? void 0 : citationsConfig.enabled) != null ? _b15 : false;
    };
    return prompt.filter((message) => message.role === "user").flatMap((message) => message.content).filter(isCitationPart).map((part) => {
      var _a21;
      const filePart = part;
      return {
        title: (_a21 = filePart.filename) != null ? _a21 : "Untitled Document",
        filename: filePart.filename,
        mediaType: filePart.mediaType
      };
    });
  }
  async doGenerate(options) {
    var _a21, _b15, _c, _d, _e, _f, _g, _h, _i;
    const {
      args,
      warnings,
      betas,
      usesJsonResponseTool,
      toolNameMapping,
      providerOptionsName,
      usedCustomProviderKey
    } = await this.getArgs({
      ...options,
      stream: false,
      userSuppliedBetas: await this.getBetasFromHeaders(options.headers)
    });
    const citationDocuments = [
      ...this.extractCitationDocuments(options.prompt)
    ];
    const markCodeExecutionDynamic = hasWebTool20260209WithoutCodeExecution(
      args.tools
    );
    const {
      responseHeaders,
      value: response,
      rawValue: rawResponse
    } = await postJsonToApi({
      url: this.buildRequestUrl(false),
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(args, betas),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        anthropicMessagesResponseSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    const content = [];
    const mcpToolCalls = {};
    const serverToolCalls = {};
    let isJsonResponseFromTool = false;
    const jsonResponseToolFallbackText = usesJsonResponseTool ? getJsonResponseToolFallbackText(response.content, response.stop_reason) : void 0;
    for (const part of response.content) {
      switch (part.type) {
        case "text": {
          if (jsonResponseToolFallbackText == null || jsonResponseToolFallbackText.has(part)) {
            const webSearchCitations = (_a21 = part.citations) == null ? void 0 : _a21.filter(
              (citation) => citation.type === "web_search_result_location"
            );
            content.push({
              type: "text",
              text: part.text,
              ...webSearchCitations != null && webSearchCitations.length > 0 && {
                providerMetadata: {
                  anthropic: {
                    citations: webSearchCitations
                  }
                }
              }
            });
            if (part.citations) {
              for (const citation of part.citations) {
                const source = createCitationSource(
                  citation,
                  citationDocuments,
                  this.generateId
                );
                if (source) {
                  content.push(source);
                }
              }
            }
          }
          break;
        }
        case "thinking": {
          content.push({
            type: "reasoning",
            text: part.thinking,
            providerMetadata: {
              anthropic: {
                signature: part.signature
              }
            }
          });
          break;
        }
        case "redacted_thinking": {
          content.push({
            type: "reasoning",
            text: "",
            providerMetadata: {
              anthropic: {
                redactedData: part.data
              }
            }
          });
          break;
        }
        case "compaction": {
          content.push({
            type: "text",
            text: part.content,
            providerMetadata: {
              anthropic: {
                type: "compaction"
              }
            }
          });
          break;
        }
        case "tool_use": {
          const isJsonResponseTool = usesJsonResponseTool && part.name === "json";
          if (isJsonResponseTool) {
            isJsonResponseFromTool = true;
            content.push({
              type: "text",
              text: JSON.stringify(part.input)
            });
          } else if (part.toolset_name != null) {
            validateToolsetMember({
              toolsetName: part.toolset_name,
              memberName: part.name,
              tools: args.tools
            });
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: toolNameMapping.toCustomToolName(part.toolset_name),
              input: JSON.stringify(
                toToolsetMemberInput({
                  memberName: part.name,
                  input: part.input
                })
              ),
              providerMetadata: {
                anthropic: {
                  toolsetName: part.toolset_name,
                  ...(_b15 = getAnthropicCallerMetadata(part.caller).providerMetadata) == null ? void 0 : _b15.anthropic
                }
              }
            });
          } else {
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: part.name,
              input: JSON.stringify(part.input),
              ...getAnthropicCallerMetadata(part.caller)
            });
          }
          break;
        }
        case "server_tool_use": {
          if (part.name === "text_editor_code_execution" || part.name === "bash_code_execution") {
            const providerToolName = "code_execution";
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: toolNameMapping.toCustomToolName("code_execution"),
              input: JSON.stringify({ type: part.name, ...part.input }),
              providerExecuted: true,
              // Specific 'web_fetch' or 'web_search' tools may need code execution, which the Anthropic API
              // implicitly allows. In this scenario, we need to allow 'code_execution' tool calls even if the
              // tool was not explicitly provided. We therefore bypass the general validation by marking the
              // tool as dynamic.
              ...markCodeExecutionDynamic && providerToolName === "code_execution" ? { dynamic: true } : {},
              ...getAnthropicCallerMetadata(part.caller)
            });
          } else if (part.name === "web_search" || part.name === "code_execution" || part.name === "web_fetch") {
            const inputToSerialize = part.name === "code_execution" && part.input != null && typeof part.input === "object" && "code" in part.input && !("type" in part.input) ? { type: "programmatic-tool-call", ...part.input } : part.input;
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: toolNameMapping.toCustomToolName(part.name),
              input: JSON.stringify(inputToSerialize),
              providerExecuted: true,
              // Specific 'web_fetch' or 'web_search' tools may need code execution, which the Anthropic API
              // implicitly allows. In this scenario, we need to allow 'code_execution' tool calls even if the
              // tool was not explicitly provided. We therefore bypass the general validation by marking the
              // tool as dynamic.
              ...markCodeExecutionDynamic && part.name === "code_execution" ? { dynamic: true } : {},
              ...getAnthropicCallerMetadata(part.caller)
            });
          } else if (part.name === "tool_search_tool_regex" || part.name === "tool_search_tool_bm25") {
            serverToolCalls[part.id] = part.name;
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: toolNameMapping.toCustomToolName(part.name),
              input: JSON.stringify(part.input),
              providerExecuted: true,
              ...getAnthropicCallerMetadata(part.caller)
            });
          } else if (part.name === "advisor") {
            content.push({
              type: "tool-call",
              toolCallId: part.id,
              toolName: toolNameMapping.toCustomToolName("advisor"),
              input: JSON.stringify(part.input),
              providerExecuted: true,
              ...getAnthropicCallerMetadata(part.caller)
            });
          }
          break;
        }
        case "mcp_tool_use": {
          mcpToolCalls[part.id] = {
            type: "tool-call",
            toolCallId: part.id,
            toolName: part.name,
            input: JSON.stringify(part.input),
            providerExecuted: true,
            dynamic: true,
            providerMetadata: {
              anthropic: {
                type: "mcp-tool-use",
                serverName: part.server_name
              }
            }
          };
          content.push(mcpToolCalls[part.id]);
          break;
        }
        case "mcp_tool_result": {
          content.push({
            type: "tool-result",
            toolCallId: part.tool_use_id,
            toolName: mcpToolCalls[part.tool_use_id].toolName,
            isError: part.is_error,
            result: part.content,
            dynamic: true,
            providerMetadata: mcpToolCalls[part.tool_use_id].providerMetadata
          });
          break;
        }
        case "web_fetch_tool_result": {
          if (part.content.type === "web_fetch_result") {
            citationDocuments.push({
              title: (_c = part.content.content.title) != null ? _c : part.content.url,
              mediaType: part.content.content.source.media_type
            });
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("web_fetch"),
              result: {
                type: "web_fetch_result",
                url: part.content.url,
                retrievedAt: part.content.retrieved_at,
                content: {
                  type: part.content.content.type,
                  title: part.content.content.title,
                  citations: part.content.content.citations,
                  source: {
                    type: part.content.content.source.type,
                    mediaType: part.content.content.source.media_type,
                    data: part.content.content.source.data
                  }
                }
              },
              ...getAnthropicCallerMetadata(part.caller)
            });
          } else if (part.content.type === "web_fetch_tool_result_error") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("web_fetch"),
              isError: true,
              result: {
                type: "web_fetch_tool_result_error",
                errorCode: part.content.error_code
              },
              ...getAnthropicCallerMetadata(part.caller)
            });
          }
          break;
        }
        case "web_search_tool_result": {
          if (Array.isArray(part.content)) {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("web_search"),
              result: part.content.map((result) => {
                var _a22;
                return {
                  url: result.url,
                  title: result.title,
                  pageAge: (_a22 = result.page_age) != null ? _a22 : null,
                  encryptedContent: result.encrypted_content,
                  type: result.type
                };
              }),
              ...getAnthropicCallerMetadata(part.caller)
            });
            for (const result of part.content) {
              content.push({
                type: "source",
                sourceType: "url",
                id: this.generateId(),
                url: result.url,
                title: result.title,
                providerMetadata: {
                  anthropic: {
                    pageAge: (_d = result.page_age) != null ? _d : null
                  }
                }
              });
            }
          } else {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("web_search"),
              isError: true,
              result: {
                type: "web_search_tool_result_error",
                errorCode: part.content.error_code
              },
              ...getAnthropicCallerMetadata(part.caller)
            });
          }
          break;
        }
        // code execution 20250522:
        case "code_execution_tool_result": {
          if (part.content.type === "code_execution_result") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("code_execution"),
              result: {
                type: part.content.type,
                stdout: part.content.stdout,
                stderr: part.content.stderr,
                return_code: part.content.return_code,
                content: (_e = part.content.content) != null ? _e : []
              }
            });
          } else if (part.content.type === "encrypted_code_execution_result") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("code_execution"),
              result: {
                type: part.content.type,
                encrypted_stdout: part.content.encrypted_stdout,
                stderr: part.content.stderr,
                return_code: part.content.return_code,
                content: (_f = part.content.content) != null ? _f : []
              }
            });
          } else if (part.content.type === "code_execution_tool_result_error") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName("code_execution"),
              isError: true,
              result: {
                type: "code_execution_tool_result_error",
                errorCode: part.content.error_code
              }
            });
          }
          break;
        }
        // code execution 20250825:
        case "bash_code_execution_tool_result":
        case "text_editor_code_execution_tool_result": {
          content.push({
            type: "tool-result",
            toolCallId: part.tool_use_id,
            toolName: toolNameMapping.toCustomToolName("code_execution"),
            result: part.content
          });
          break;
        }
        // tool search tool results:
        case "tool_search_tool_result": {
          let providerToolName = serverToolCalls[part.tool_use_id];
          if (providerToolName == null) {
            const bm25CustomName = toolNameMapping.toCustomToolName(
              "tool_search_tool_bm25"
            );
            const regexCustomName = toolNameMapping.toCustomToolName(
              "tool_search_tool_regex"
            );
            if (bm25CustomName !== "tool_search_tool_bm25") {
              providerToolName = "tool_search_tool_bm25";
            } else if (regexCustomName !== "tool_search_tool_regex") {
              providerToolName = "tool_search_tool_regex";
            } else {
              providerToolName = "tool_search_tool_regex";
            }
          }
          if (part.content.type === "tool_search_tool_search_result") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName(providerToolName),
              result: part.content.tool_references.map((ref) => ({
                type: ref.type,
                toolName: ref.tool_name
              }))
            });
          } else {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: toolNameMapping.toCustomToolName(providerToolName),
              isError: true,
              result: {
                type: "tool_search_tool_result_error",
                errorCode: part.content.error_code
              }
            });
          }
          break;
        }
        // advisor results for advisor_20260301:
        case "advisor_tool_result": {
          const advisorToolName = toolNameMapping.toCustomToolName("advisor");
          if (part.content.type === "advisor_result") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: advisorToolName,
              result: {
                type: "advisor_result",
                text: part.content.text
              }
            });
          } else if (part.content.type === "advisor_redacted_result") {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: advisorToolName,
              result: {
                type: "advisor_redacted_result",
                encryptedContent: part.content.encrypted_content
              }
            });
          } else {
            content.push({
              type: "tool-result",
              toolCallId: part.tool_use_id,
              toolName: advisorToolName,
              isError: true,
              result: {
                type: "advisor_tool_result_error",
                errorCode: part.content.error_code
              }
            });
          }
          break;
        }
      }
    }
    return {
      content,
      finishReason: {
        unified: mapAnthropicStopReason({
          finishReason: response.stop_reason,
          isJsonResponseFromTool
        }),
        raw: (_g = response.stop_reason) != null ? _g : void 0
      },
      usage: convertAnthropicMessagesUsage({ usage: response.usage }),
      request: { body: args },
      response: {
        id: (_h = response.id) != null ? _h : void 0,
        modelId: (_i = response.model) != null ? _i : void 0,
        headers: responseHeaders,
        body: rawResponse
      },
      warnings,
      providerMetadata: (() => {
        var _a22, _b22, _c2, _d2, _e2;
        const stopDetails = mapAnthropicStopDetails(response.stop_details);
        const anthropicMetadata = {
          usage: response.usage,
          cacheCreationInputTokens: (_a22 = response.usage.cache_creation_input_tokens) != null ? _a22 : null,
          stopSequence: (_b22 = response.stop_sequence) != null ? _b22 : null,
          ...stopDetails != null ? { stopDetails } : {},
          ...response.input_transformations != null ? { inputTransformations: response.input_transformations } : {},
          ...response.safeguard_results != null ? { safeguardResults: response.safeguard_results } : {},
          iterations: response.usage.iterations ? response.usage.iterations.map(
            (iter) => ({
              type: iter.type,
              ...iter.model != null ? { model: iter.model } : {},
              inputTokens: iter.input_tokens,
              outputTokens: iter.output_tokens,
              ...iter.cache_creation_input_tokens ? {
                cacheCreationInputTokens: iter.cache_creation_input_tokens
              } : {},
              ...iter.cache_read_input_tokens ? {
                cacheReadInputTokens: iter.cache_read_input_tokens
              } : {}
            })
          ) : null,
          container: response.container ? {
            expiresAt: response.container.expires_at,
            id: response.container.id,
            skills: (_d2 = (_c2 = response.container.skills) == null ? void 0 : _c2.map((skill) => ({
              type: skill.type,
              skillId: skill.skill_id,
              version: skill.version
            }))) != null ? _d2 : null
          } : null,
          contextManagement: (_e2 = mapAnthropicResponseContextManagement(
            response.context_management
          )) != null ? _e2 : null
        };
        const providerMetadata = {
          anthropic: anthropicMetadata
        };
        if (usedCustomProviderKey && providerOptionsName !== "anthropic") {
          providerMetadata[providerOptionsName] = anthropicMetadata;
        }
        return providerMetadata;
      })()
    };
  }
  async doStream(options) {
    var _a21, _b15;
    const {
      args: body,
      warnings,
      betas,
      usesJsonResponseTool,
      toolNameMapping,
      providerOptionsName,
      usedCustomProviderKey
    } = await this.getArgs({
      ...options,
      stream: true,
      userSuppliedBetas: await this.getBetasFromHeaders(options.headers)
    });
    const citationDocuments = [
      ...this.extractCitationDocuments(options.prompt)
    ];
    const markCodeExecutionDynamic = hasWebTool20260209WithoutCodeExecution(
      body.tools
    );
    const url = this.buildRequestUrl(true);
    const { responseHeaders, value: response } = await postJsonToApi({
      url,
      headers: await this.getHeaders({ betas, headers: options.headers }),
      body: this.transformRequestBody(body, betas),
      failedResponseHandler: anthropicFailedResponseHandler,
      successfulResponseHandler: createEventSourceResponseHandler(
        anthropicMessagesChunkSchema
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch
    });
    let finishReason = {
      unified: "other",
      raw: void 0
    };
    const usage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      iterations: null
    };
    const contentBlocks = {};
    const mcpToolCalls = {};
    const serverToolCalls = {};
    let contextManagement = null;
    let rawUsage = void 0;
    let cacheCreationInputTokens = null;
    let stopSequence = null;
    let stopDetails = void 0;
    let inputTransformations;
    let safeguardResults;
    let container = null;
    let isJsonResponseFromTool = false;
    const heldBackText = [];
    const heldBackTextByIndex = /* @__PURE__ */ new Map();
    const createTextEnd = (id, citations) => ({
      type: "text-end",
      id,
      ...citations.length > 0 && {
        providerMetadata: { anthropic: { citations } }
      }
    });
    let isMessageOpen = false;
    let activeMessageId;
    let hasInvalidMessageSequence = false;
    let blockType = void 0;
    const generateId3 = this.generateId;
    const transformedStream = response.pipeThrough(
      new TransformStream({
        start(controller) {
          controller.enqueue({ type: "stream-start", warnings });
        },
        transform(chunk, controller) {
          var _a22, _b22, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o;
          if (hasInvalidMessageSequence) {
            return;
          }
          if (options.includeRawChunks) {
            controller.enqueue({ type: "raw", rawValue: chunk.rawValue });
          }
          if (!chunk.success) {
            controller.enqueue({ type: "error", error: chunk.error });
            return;
          }
          const value = chunk.value;
          switch (value.type) {
            case "ping": {
              return;
            }
            case "content_block_start": {
              const part = value.content_block;
              const contentBlockType = part.type;
              if (contentBlockType === "fallback") {
                return;
              }
              blockType = contentBlockType;
              if (!TEXT_OR_THINKING_BLOCK_TYPES.has(contentBlockType)) {
                heldBackText.length = 0;
              }
              switch (contentBlockType) {
                case "text": {
                  if (usesJsonResponseTool) {
                    const entry = {
                      id: String(value.index),
                      text: "",
                      citations: []
                    };
                    heldBackText.push(entry);
                    heldBackTextByIndex.set(value.index, entry);
                    return;
                  }
                  contentBlocks[value.index] = {
                    type: "text",
                    citations: []
                  };
                  controller.enqueue({
                    type: "text-start",
                    id: String(value.index)
                  });
                  return;
                }
                case "thinking": {
                  contentBlocks[value.index] = { type: "reasoning" };
                  controller.enqueue({
                    type: "reasoning-start",
                    id: String(value.index)
                  });
                  return;
                }
                case "redacted_thinking": {
                  contentBlocks[value.index] = { type: "reasoning" };
                  controller.enqueue({
                    type: "reasoning-start",
                    id: String(value.index),
                    providerMetadata: {
                      anthropic: {
                        redactedData: part.data
                      }
                    }
                  });
                  return;
                }
                case "compaction": {
                  contentBlocks[value.index] = {
                    type: "text",
                    citations: []
                  };
                  controller.enqueue({
                    type: "text-start",
                    id: String(value.index),
                    providerMetadata: {
                      anthropic: {
                        type: "compaction"
                      }
                    }
                  });
                  return;
                }
                case "tool_use": {
                  const isJsonResponseTool = usesJsonResponseTool && part.name === "json";
                  if (isJsonResponseTool) {
                    isJsonResponseFromTool = true;
                    contentBlocks[value.index] = {
                      type: "text",
                      citations: []
                    };
                    controller.enqueue({
                      type: "text-start",
                      id: String(value.index)
                    });
                  } else if (part.toolset_name != null) {
                    validateToolsetMember({
                      toolsetName: part.toolset_name,
                      memberName: part.name,
                      tools: body.tools
                    });
                    const callerInfo = getAnthropicCallerInfo(part.caller);
                    const customToolName = toolNameMapping.toCustomToolName(
                      part.toolset_name
                    );
                    const hasNonEmptyInput = part.input && Object.keys(part.input).length > 0;
                    contentBlocks[value.index] = {
                      type: "tool-call",
                      toolCallId: part.id,
                      toolName: customToolName,
                      input: hasNonEmptyInput ? JSON.stringify(part.input) : "",
                      firstDelta: true,
                      toolset: {
                        name: part.toolset_name,
                        memberName: part.name
                      },
                      ...callerInfo && { caller: callerInfo }
                    };
                    controller.enqueue({
                      type: "tool-input-start",
                      id: part.id,
                      toolName: customToolName
                    });
                  } else {
                    const callerInfo = getAnthropicCallerInfo(part.caller);
                    const hasNonEmptyInput = part.input && Object.keys(part.input).length > 0;
                    const initialInput = hasNonEmptyInput ? JSON.stringify(part.input) : "";
                    contentBlocks[value.index] = {
                      type: "tool-call",
                      toolCallId: part.id,
                      toolName: part.name,
                      input: initialInput,
                      firstDelta: initialInput.length === 0,
                      ...callerInfo && { caller: callerInfo }
                    };
                    controller.enqueue({
                      type: "tool-input-start",
                      id: part.id,
                      toolName: part.name
                    });
                  }
                  return;
                }
                case "server_tool_use": {
                  const callerInfo = getAnthropicCallerInfo(part.caller);
                  if ([
                    "web_fetch",
                    "web_search",
                    // code execution 20250825:
                    "code_execution",
                    // code execution 20250825 text editor:
                    "text_editor_code_execution",
                    // code execution 20250825 bash:
                    "bash_code_execution"
                  ].includes(part.name)) {
                    const providerToolName = part.name === "text_editor_code_execution" || part.name === "bash_code_execution" ? "code_execution" : part.name;
                    const providerToolInputType = part.name === "text_editor_code_execution" || part.name === "bash_code_execution" ? part.name : part.name === "code_execution" ? "programmatic-tool-call" : void 0;
                    const customToolName = toolNameMapping.toCustomToolName(providerToolName);
                    const finalInput = part.input != null && typeof part.input === "object" && Object.keys(part.input).length > 0 ? JSON.stringify(part.input) : "";
                    contentBlocks[value.index] = {
                      type: "tool-call",
                      toolCallId: part.id,
                      toolName: customToolName,
                      input: finalInput,
                      providerExecuted: true,
                      // Specific 'web_fetch' or 'web_search' tools may need code execution, which the Anthropic API
                      // implicitly allows. In this scenario, we need to allow 'code_execution' tool calls even if the
                      // tool was not explicitly provided. We therefore bypass the general validation by marking the
                      // tool as dynamic.
                      ...markCodeExecutionDynamic && providerToolName === "code_execution" ? { dynamic: true } : {},
                      firstDelta: finalInput.length === 0,
                      providerToolName,
                      providerToolInputType,
                      ...callerInfo && { caller: callerInfo }
                    };
                    controller.enqueue({
                      type: "tool-input-start",
                      id: part.id,
                      toolName: customToolName,
                      providerExecuted: true,
                      // Specific 'web_fetch' or 'web_search' tools may need code execution, which the Anthropic API
                      // implicitly allows. In this scenario, we need to allow 'code_execution' tool calls even if the
                      // tool was not explicitly provided. We therefore bypass the general validation by marking the
                      // tool as dynamic.
                      ...markCodeExecutionDynamic && providerToolName === "code_execution" ? { dynamic: true } : {}
                    });
                  } else if (part.name === "tool_search_tool_regex" || part.name === "tool_search_tool_bm25") {
                    serverToolCalls[part.id] = part.name;
                    const customToolName = toolNameMapping.toCustomToolName(
                      part.name
                    );
                    contentBlocks[value.index] = {
                      type: "tool-call",
                      toolCallId: part.id,
                      toolName: customToolName,
                      input: "",
                      providerExecuted: true,
                      firstDelta: true,
                      providerToolName: part.name,
                      ...callerInfo && { caller: callerInfo }
                    };
                    controller.enqueue({
                      type: "tool-input-start",
                      id: part.id,
                      toolName: customToolName,
                      providerExecuted: true
                    });
                  } else if (part.name === "advisor") {
                    const customToolName = toolNameMapping.toCustomToolName("advisor");
                    contentBlocks[value.index] = {
                      type: "tool-call",
                      toolCallId: part.id,
                      toolName: customToolName,
                      input: "{}",
                      providerExecuted: true,
                      firstDelta: true,
                      providerToolName: part.name,
                      ...callerInfo && { caller: callerInfo }
                    };
                    controller.enqueue({
                      type: "tool-input-start",
                      id: part.id,
                      toolName: customToolName,
                      providerExecuted: true
                    });
                  }
                  return;
                }
                case "web_fetch_tool_result": {
                  if (part.content.type === "web_fetch_result") {
                    citationDocuments.push({
                      title: (_a22 = part.content.content.title) != null ? _a22 : part.content.url,
                      mediaType: part.content.content.source.media_type
                    });
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("web_fetch"),
                      result: {
                        type: "web_fetch_result",
                        url: part.content.url,
                        retrievedAt: part.content.retrieved_at,
                        content: {
                          type: part.content.content.type,
                          title: part.content.content.title,
                          citations: part.content.content.citations,
                          source: {
                            type: part.content.content.source.type,
                            mediaType: part.content.content.source.media_type,
                            data: part.content.content.source.data
                          }
                        }
                      },
                      ...getAnthropicCallerMetadata(part.caller)
                    });
                  } else if (part.content.type === "web_fetch_tool_result_error") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("web_fetch"),
                      isError: true,
                      result: {
                        type: "web_fetch_tool_result_error",
                        errorCode: part.content.error_code
                      },
                      ...getAnthropicCallerMetadata(part.caller)
                    });
                  }
                  return;
                }
                case "web_search_tool_result": {
                  if (Array.isArray(part.content)) {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("web_search"),
                      result: part.content.map((result) => {
                        var _a32;
                        return {
                          url: result.url,
                          title: result.title,
                          pageAge: (_a32 = result.page_age) != null ? _a32 : null,
                          encryptedContent: result.encrypted_content,
                          type: result.type
                        };
                      }),
                      ...getAnthropicCallerMetadata(part.caller)
                    });
                    for (const result of part.content) {
                      controller.enqueue({
                        type: "source",
                        sourceType: "url",
                        id: generateId3(),
                        url: result.url,
                        title: result.title,
                        providerMetadata: {
                          anthropic: {
                            pageAge: (_b22 = result.page_age) != null ? _b22 : null
                          }
                        }
                      });
                    }
                  } else {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("web_search"),
                      isError: true,
                      result: {
                        type: "web_search_tool_result_error",
                        errorCode: part.content.error_code
                      },
                      ...getAnthropicCallerMetadata(part.caller)
                    });
                  }
                  return;
                }
                // code execution 20250522:
                case "code_execution_tool_result": {
                  if (part.content.type === "code_execution_result") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("code_execution"),
                      result: {
                        type: part.content.type,
                        stdout: part.content.stdout,
                        stderr: part.content.stderr,
                        return_code: part.content.return_code,
                        content: (_c = part.content.content) != null ? _c : []
                      }
                    });
                  } else if (part.content.type === "encrypted_code_execution_result") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("code_execution"),
                      result: {
                        type: part.content.type,
                        encrypted_stdout: part.content.encrypted_stdout,
                        stderr: part.content.stderr,
                        return_code: part.content.return_code,
                        content: (_d = part.content.content) != null ? _d : []
                      }
                    });
                  } else if (part.content.type === "code_execution_tool_result_error") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName("code_execution"),
                      isError: true,
                      result: {
                        type: "code_execution_tool_result_error",
                        errorCode: part.content.error_code
                      }
                    });
                  }
                  return;
                }
                // code execution 20250825:
                case "bash_code_execution_tool_result":
                case "text_editor_code_execution_tool_result": {
                  controller.enqueue({
                    type: "tool-result",
                    toolCallId: part.tool_use_id,
                    toolName: toolNameMapping.toCustomToolName("code_execution"),
                    result: part.content
                  });
                  return;
                }
                // tool search tool results:
                case "tool_search_tool_result": {
                  let providerToolName = serverToolCalls[part.tool_use_id];
                  if (providerToolName == null) {
                    const bm25CustomName = toolNameMapping.toCustomToolName(
                      "tool_search_tool_bm25"
                    );
                    const regexCustomName = toolNameMapping.toCustomToolName(
                      "tool_search_tool_regex"
                    );
                    if (bm25CustomName !== "tool_search_tool_bm25") {
                      providerToolName = "tool_search_tool_bm25";
                    } else if (regexCustomName !== "tool_search_tool_regex") {
                      providerToolName = "tool_search_tool_regex";
                    } else {
                      providerToolName = "tool_search_tool_regex";
                    }
                  }
                  if (part.content.type === "tool_search_tool_search_result") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName(providerToolName),
                      result: part.content.tool_references.map((ref) => ({
                        type: ref.type,
                        toolName: ref.tool_name
                      }))
                    });
                  } else {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: toolNameMapping.toCustomToolName(providerToolName),
                      isError: true,
                      result: {
                        type: "tool_search_tool_result_error",
                        errorCode: part.content.error_code
                      }
                    });
                  }
                  return;
                }
                // advisor results for advisor_20260301:
                // arrives fully formed in a single content_block_start (no deltas).
                case "advisor_tool_result": {
                  const advisorToolName = toolNameMapping.toCustomToolName("advisor");
                  if (part.content.type === "advisor_result") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: advisorToolName,
                      result: {
                        type: "advisor_result",
                        text: part.content.text
                      }
                    });
                  } else if (part.content.type === "advisor_redacted_result") {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: advisorToolName,
                      result: {
                        type: "advisor_redacted_result",
                        encryptedContent: part.content.encrypted_content
                      }
                    });
                  } else {
                    controller.enqueue({
                      type: "tool-result",
                      toolCallId: part.tool_use_id,
                      toolName: advisorToolName,
                      isError: true,
                      result: {
                        type: "advisor_tool_result_error",
                        errorCode: part.content.error_code
                      }
                    });
                  }
                  return;
                }
                case "mcp_tool_use": {
                  mcpToolCalls[part.id] = {
                    type: "tool-call",
                    toolCallId: part.id,
                    toolName: part.name,
                    input: JSON.stringify(part.input),
                    providerExecuted: true,
                    dynamic: true,
                    providerMetadata: {
                      anthropic: {
                        type: "mcp-tool-use",
                        serverName: part.server_name
                      }
                    }
                  };
                  controller.enqueue(mcpToolCalls[part.id]);
                  return;
                }
                case "mcp_tool_result": {
                  controller.enqueue({
                    type: "tool-result",
                    toolCallId: part.tool_use_id,
                    toolName: mcpToolCalls[part.tool_use_id].toolName,
                    isError: part.is_error,
                    result: part.content,
                    dynamic: true,
                    providerMetadata: mcpToolCalls[part.tool_use_id].providerMetadata
                  });
                  return;
                }
                default: {
                  const _exhaustiveCheck = contentBlockType;
                  throw new Error(
                    `Unsupported content block type: ${_exhaustiveCheck}`
                  );
                }
              }
            }
            case "content_block_stop": {
              if (contentBlocks[value.index] != null) {
                const contentBlock = contentBlocks[value.index];
                switch (contentBlock.type) {
                  case "text": {
                    controller.enqueue(
                      createTextEnd(
                        String(value.index),
                        contentBlock.citations
                      )
                    );
                    break;
                  }
                  case "reasoning": {
                    controller.enqueue({
                      type: "reasoning-end",
                      id: String(value.index)
                    });
                    break;
                  }
                  case "tool-call":
                    const isJsonResponseTool = usesJsonResponseTool && contentBlock.toolName === "json";
                    if (!isJsonResponseTool) {
                      if (contentBlock.toolset != null) {
                        let memberInput = {};
                        try {
                          memberInput = contentBlock.input === "" ? {} : secureJsonParse(contentBlock.input);
                        } catch (e) {
                          throw new InvalidResponseDataError2({
                            data: contentBlock.input,
                            message: "Invalid toolset member input JSON."
                          });
                        }
                        contentBlock.input = JSON.stringify(
                          toToolsetMemberInput({
                            memberName: contentBlock.toolset.memberName,
                            input: memberInput
                          })
                        );
                        controller.enqueue({
                          type: "tool-input-delta",
                          id: contentBlock.toolCallId,
                          delta: contentBlock.input
                        });
                      }
                      controller.enqueue({
                        type: "tool-input-end",
                        id: contentBlock.toolCallId
                      });
                      let finalInput = contentBlock.input === "" ? "{}" : contentBlock.input;
                      if (contentBlock.providerToolName === "code_execution") {
                        try {
                          const parsed = secureJsonParse(finalInput);
                          if (parsed != null && typeof parsed === "object" && "code" in parsed && !("type" in parsed)) {
                            finalInput = JSON.stringify({
                              type: "programmatic-tool-call",
                              ...parsed
                            });
                          }
                        } catch (e) {
                        }
                      }
                      controller.enqueue({
                        type: "tool-call",
                        toolCallId: contentBlock.toolCallId,
                        toolName: contentBlock.toolName,
                        input: finalInput,
                        providerExecuted: contentBlock.providerExecuted,
                        // Specific 'web_fetch' or 'web_search' tools may need code execution, which the Anthropic API
                        // implicitly allows. In this scenario, we need to allow 'code_execution' tool calls even if the
                        // tool was not explicitly provided. We therefore bypass the general validation by marking the
                        // tool as dynamic.
                        ...markCodeExecutionDynamic && contentBlock.providerToolName === "code_execution" ? { dynamic: true } : {},
                        ...(contentBlock.caller || contentBlock.toolset) && {
                          providerMetadata: {
                            anthropic: {
                              ...contentBlock.toolset && {
                                toolsetName: contentBlock.toolset.name
                              },
                              ...contentBlock.caller && {
                                caller: contentBlock.caller
                              }
                            }
                          }
                        }
                      });
                    }
                    break;
                }
                delete contentBlocks[value.index];
              }
              blockType = void 0;
              return;
            }
            case "content_block_delta": {
              const deltaType = value.delta.type;
              switch (deltaType) {
                case "text_delta": {
                  if (usesJsonResponseTool) {
                    const entry = heldBackTextByIndex.get(value.index);
                    if (entry != null) {
                      entry.text += value.delta.text;
                    }
                    return;
                  }
                  controller.enqueue({
                    type: "text-delta",
                    id: String(value.index),
                    delta: value.delta.text
                  });
                  return;
                }
                case "thinking_delta": {
                  controller.enqueue({
                    type: "reasoning-delta",
                    id: String(value.index),
                    delta: value.delta.thinking
                  });
                  return;
                }
                case "signature_delta": {
                  if (blockType === "thinking") {
                    controller.enqueue({
                      type: "reasoning-delta",
                      id: String(value.index),
                      delta: "",
                      providerMetadata: {
                        anthropic: {
                          signature: value.delta.signature
                        }
                      }
                    });
                  }
                  return;
                }
                case "compaction_delta": {
                  if (value.delta.content != null) {
                    controller.enqueue({
                      type: "text-delta",
                      id: String(value.index),
                      delta: value.delta.content
                    });
                  }
                  return;
                }
                case "input_json_delta": {
                  const contentBlock = contentBlocks[value.index];
                  let delta = value.delta.partial_json;
                  if (delta.length === 0) {
                    return;
                  }
                  if (isJsonResponseFromTool) {
                    if ((contentBlock == null ? void 0 : contentBlock.type) !== "text") {
                      return;
                    }
                    controller.enqueue({
                      type: "text-delta",
                      id: String(value.index),
                      delta
                    });
                  } else {
                    if ((contentBlock == null ? void 0 : contentBlock.type) !== "tool-call") {
                      return;
                    }
                    if (contentBlock.toolset != null) {
                      contentBlock.input += delta;
                      return;
                    }
                    if (contentBlock.firstDelta && contentBlock.providerToolInputType != null) {
                      delta = `{"type": "${contentBlock.providerToolInputType}",${delta.substring(1)}`;
                    }
                    controller.enqueue({
                      type: "tool-input-delta",
                      id: contentBlock.toolCallId,
                      delta
                    });
                    contentBlock.input += delta;
                    contentBlock.firstDelta = false;
                  }
                  return;
                }
                case "citations_delta": {
                  const citation = value.delta.citation;
                  const contentBlock = contentBlocks[value.index];
                  if (citation.type === "web_search_result_location") {
                    if ((contentBlock == null ? void 0 : contentBlock.type) === "text") {
                      contentBlock.citations.push(citation);
                    }
                    (_e = heldBackTextByIndex.get(value.index)) == null ? void 0 : _e.citations.push(citation);
                  }
                  const source = createCitationSource(
                    citation,
                    citationDocuments,
                    generateId3
                  );
                  if (source) {
                    controller.enqueue(source);
                  }
                  return;
                }
                default: {
                  const _exhaustiveCheck = deltaType;
                  throw new Error(
                    `Unsupported delta type: ${_exhaustiveCheck}`
                  );
                }
              }
            }
            case "message_start": {
              if (isMessageOpen) {
                if (activeMessageId === value.message.id) {
                  return;
                }
                hasInvalidMessageSequence = true;
                controller.enqueue({
                  type: "error",
                  error: new InvalidResponseDataError2({
                    data: value,
                    message: `Received message_start for message ${JSON.stringify(value.message.id)} while message ${JSON.stringify(activeMessageId)} is still open.`
                  })
                });
                return;
              }
              isMessageOpen = true;
              activeMessageId = value.message.id;
              heldBackTextByIndex.clear();
              usage.input_tokens = value.message.usage.input_tokens;
              usage.cache_read_input_tokens = (_f = value.message.usage.cache_read_input_tokens) != null ? _f : 0;
              usage.cache_creation_input_tokens = (_g = value.message.usage.cache_creation_input_tokens) != null ? _g : 0;
              rawUsage = {
                ...value.message.usage
              };
              cacheCreationInputTokens = (_h = value.message.usage.cache_creation_input_tokens) != null ? _h : null;
              if (value.message.input_transformations != null) {
                inputTransformations = value.message.input_transformations;
              }
              if (value.message.container != null) {
                container = {
                  expiresAt: value.message.container.expires_at,
                  id: value.message.container.id,
                  skills: null
                };
              }
              if (value.message.stop_reason != null) {
                finishReason = {
                  unified: mapAnthropicStopReason({
                    finishReason: value.message.stop_reason,
                    isJsonResponseFromTool
                  }),
                  raw: value.message.stop_reason
                };
              }
              controller.enqueue({
                type: "response-metadata",
                id: (_i = value.message.id) != null ? _i : void 0,
                modelId: (_j = value.message.model) != null ? _j : void 0
              });
              if (value.message.content != null) {
                for (let contentIndex = 0; contentIndex < value.message.content.length; contentIndex++) {
                  const part = value.message.content[contentIndex];
                  if (part.type === "tool_use") {
                    const callerInfo = getAnthropicCallerInfo(part.caller);
                    controller.enqueue({
                      type: "tool-input-start",
                      id: part.id,
                      toolName: part.name
                    });
                    const inputStr = JSON.stringify((_k = part.input) != null ? _k : {});
                    controller.enqueue({
                      type: "tool-input-delta",
                      id: part.id,
                      delta: inputStr
                    });
                    controller.enqueue({
                      type: "tool-input-end",
                      id: part.id
                    });
                    controller.enqueue({
                      type: "tool-call",
                      toolCallId: part.id,
                      toolName: part.name,
                      input: inputStr,
                      ...callerInfo && {
                        providerMetadata: {
                          anthropic: {
                            caller: callerInfo
                          }
                        }
                      }
                    });
                  }
                }
              }
              return;
            }
            case "message_delta": {
              if (value.usage.input_tokens != null && usage.input_tokens !== value.usage.input_tokens) {
                usage.input_tokens = value.usage.input_tokens;
              }
              usage.output_tokens = value.usage.output_tokens;
              if (value.usage.output_tokens_details != null) {
                usage.output_tokens_details = value.usage.output_tokens_details;
              }
              if (value.usage.cache_read_input_tokens != null) {
                usage.cache_read_input_tokens = value.usage.cache_read_input_tokens;
              }
              if (value.usage.cache_creation_input_tokens != null) {
                usage.cache_creation_input_tokens = value.usage.cache_creation_input_tokens;
                cacheCreationInputTokens = value.usage.cache_creation_input_tokens;
              }
              if (value.usage.iterations != null) {
                usage.iterations = value.usage.iterations;
              }
              finishReason = {
                unified: mapAnthropicStopReason({
                  finishReason: value.delta.stop_reason,
                  isJsonResponseFromTool
                }),
                raw: (_l = value.delta.stop_reason) != null ? _l : void 0
              };
              stopSequence = (_m = value.delta.stop_sequence) != null ? _m : null;
              stopDetails = mapAnthropicStopDetails(value.delta.stop_details);
              container = value.delta.container != null ? {
                expiresAt: value.delta.container.expires_at,
                id: value.delta.container.id,
                skills: (_o = (_n = value.delta.container.skills) == null ? void 0 : _n.map((skill) => ({
                  type: skill.type,
                  skillId: skill.skill_id,
                  version: skill.version
                }))) != null ? _o : null
              } : null;
              if (value.context_management) {
                contextManagement = mapAnthropicResponseContextManagement(
                  value.context_management
                );
              }
              if (value.input_transformations != null) {
                inputTransformations = value.input_transformations;
              }
              if (value.delta.safeguard_results != null) {
                safeguardResults = value.delta.safeguard_results;
              }
              rawUsage = {
                ...rawUsage,
                ...value.usage
              };
              return;
            }
            case "message_stop": {
              isMessageOpen = false;
              activeMessageId = void 0;
              const anthropicMetadata = {
                usage: rawUsage != null ? rawUsage : null,
                cacheCreationInputTokens,
                stopSequence,
                ...stopDetails != null ? { stopDetails } : {},
                ...inputTransformations != null ? { inputTransformations } : {},
                ...safeguardResults != null ? { safeguardResults } : {},
                iterations: usage.iterations ? usage.iterations.map(
                  (iter) => ({
                    type: iter.type,
                    ...iter.model != null ? { model: iter.model } : {},
                    inputTokens: iter.input_tokens,
                    outputTokens: iter.output_tokens,
                    ...iter.cache_creation_input_tokens ? {
                      cacheCreationInputTokens: iter.cache_creation_input_tokens
                    } : {},
                    ...iter.cache_read_input_tokens ? {
                      cacheReadInputTokens: iter.cache_read_input_tokens
                    } : {}
                  })
                ) : null,
                container,
                contextManagement
              };
              const providerMetadata = {
                anthropic: anthropicMetadata
              };
              if (usedCustomProviderKey && providerOptionsName !== "anthropic") {
                providerMetadata[providerOptionsName] = anthropicMetadata;
              }
              if (!isJsonResponseFromTool && !isContinuationStopReason(finishReason.raw)) {
                for (const { id, text: text2, citations } of heldBackText) {
                  if (text2.length === 0) continue;
                  controller.enqueue({ type: "text-start", id });
                  controller.enqueue({ type: "text-delta", id, delta: text2 });
                  controller.enqueue(createTextEnd(id, citations));
                }
              }
              heldBackText.length = 0;
              controller.enqueue({
                type: "finish",
                finishReason,
                usage: convertAnthropicMessagesUsage({ usage, rawUsage }),
                providerMetadata
              });
              return;
            }
            case "error": {
              controller.enqueue({ type: "error", error: value.error });
              return;
            }
            default: {
              const _exhaustiveCheck = value;
              throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
            }
          }
        }
      })
    );
    const [streamForFirstChunk, streamForConsumer] = transformedStream.tee();
    const firstChunkReader = streamForFirstChunk.getReader();
    try {
      await firstChunkReader.read();
      let result = await firstChunkReader.read();
      if (((_a21 = result.value) == null ? void 0 : _a21.type) === "raw") {
        result = await firstChunkReader.read();
      }
      if (((_b15 = result.value) == null ? void 0 : _b15.type) === "error") {
        const error = result.value.error;
        throw new APICallError2({
          message: error.message,
          url,
          requestBodyValues: body,
          statusCode: error.type === "overloaded_error" ? 529 : 500,
          responseHeaders,
          responseBody: JSON.stringify(error),
          isRetryable: error.type === "overloaded_error"
        });
      }
    } finally {
      firstChunkReader.cancel().catch(() => {
      });
      firstChunkReader.releaseLock();
    }
    return {
      stream: streamForConsumer,
      request: { body },
      response: { headers: responseHeaders }
    };
  }
};
function getModelCapabilities(modelId) {
  if (modelId.includes("claude-sonnet-5-5")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: true,
      rejectsThinkingDisabled: true,
      rejectsBudgetThinking: true,
      rejectsForcedToolUse: true,
      supportsBetweenToolsThinking: true,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-opus-5-5")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: true,
      rejectsThinkingDisabled: true,
      rejectsBudgetThinking: true,
      rejectsForcedToolUse: true,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-haiku-5-5")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: true,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: true,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-opus-5")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: true,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-fable-5-2") || modelId.includes("claude-fable-5-1")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: true,
      rejectsBudgetThinking: true,
      rejectsForcedToolUse: true,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-fable-5")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: true,
      rejectsBudgetThinking: true,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-opus-4-8") || modelId.includes("claude-opus-4-7") || modelId.includes("claude-sonnet-5")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-sonnet-4-6") || modelId.includes("claude-opus-4-6")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-sonnet-4-5") || modelId.includes("claude-opus-4-5") || modelId.includes("claude-haiku-4-5")) {
    return {
      maxOutputTokens: 64e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-opus-4-1")) {
    return {
      maxOutputTokens: 32e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-sonnet-4-")) {
    return {
      maxOutputTokens: 64e3,
      supportsStructuredOutput: false,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-opus-4-")) {
    return {
      maxOutputTokens: 32e3,
      supportsStructuredOutput: false,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (modelId.includes("claude-3-haiku")) {
    return {
      maxOutputTokens: 4096,
      supportsStructuredOutput: false,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: true
    };
  } else if (/claude-(?:instant(?:-|$)|v?2(?=$|[-.:])|3(?=$|[-.]))/.test(modelId)) {
    return {
      maxOutputTokens: 4096,
      supportsStructuredOutput: false,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: false
    };
  } else if (modelId.includes("claude-")) {
    return {
      maxOutputTokens: 128e3,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      rejectsThinkingDisabledAboveHighEffort: true,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: false
    };
  } else {
    return {
      maxOutputTokens: 4096,
      supportsStructuredOutput: false,
      rejectsSamplingParameters: false,
      rejectsThinkingDisabledAboveHighEffort: false,
      rejectsThinkingDisabled: false,
      rejectsBudgetThinking: false,
      rejectsForcedToolUse: false,
      supportsBetweenToolsThinking: false,
      isKnownModel: false
    };
  }
}
function hasWebTool20260209WithoutCodeExecution(tools) {
  if (!tools) {
    return false;
  }
  let hasWebTool20260209 = false;
  let hasCodeExecutionTool = false;
  for (const tool2 of tools) {
    if ("type" in tool2 && (tool2.type === "web_fetch_20260209" || tool2.type === "web_search_20260209")) {
      hasWebTool20260209 = true;
      continue;
    }
    if ("name" in tool2 && tool2.name === "code_execution") {
      hasCodeExecutionTool = true;
      break;
    }
  }
  return hasWebTool20260209 && !hasCodeExecutionTool;
}
function mapAnthropicResponseContextManagement(contextManagement) {
  return contextManagement ? {
    appliedEdits: contextManagement.applied_edits.map((edit) => {
      const strategy = edit.type;
      switch (strategy) {
        case "clear_tool_uses_20250919":
          return {
            type: edit.type,
            clearedToolUses: edit.cleared_tool_uses,
            clearedInputTokens: edit.cleared_input_tokens
          };
        case "clear_thinking_20251015":
          return {
            type: edit.type,
            clearedThinkingTurns: edit.cleared_thinking_turns,
            clearedInputTokens: edit.cleared_input_tokens
          };
        case "compact_20260112":
          return {
            type: edit.type
          };
      }
    }).filter((edit) => edit !== void 0)
  } : null;
}
function mapAnthropicStopDetails(stopDetails) {
  if (stopDetails == null) {
    return void 0;
  }
  return {
    type: stopDetails.type,
    ...stopDetails.category != null ? { category: stopDetails.category } : {},
    ...stopDetails.explanation != null ? { explanation: stopDetails.explanation } : {},
    ...stopDetails.recommended_model != null ? { recommendedModel: stopDetails.recommended_model } : {}
  };
}
var bash_20241022InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      command: string(),
      restart: boolean().optional()
    })
  )
);
var bash_20241022 = createProviderToolFactory({
  id: "anthropic.bash_20241022",
  inputSchema: bash_20241022InputSchema
});
var bash_20250124InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      command: string(),
      restart: boolean().optional()
    })
  )
);
var bash_20250124 = createProviderToolFactory({
  id: "anthropic.bash_20250124",
  inputSchema: bash_20250124InputSchema
});
var computer_20241022InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      action: _enum([
        "key",
        "type",
        "mouse_move",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click",
        "double_click",
        "screenshot",
        "cursor_position"
      ]),
      coordinate: array$1(number().int()).optional(),
      text: string().optional()
    })
  )
);
var computer_20241022 = createProviderToolFactory({
  id: "anthropic.computer_20241022",
  inputSchema: computer_20241022InputSchema
});
var computer_20250124InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      action: _enum([
        "key",
        "hold_key",
        "type",
        "cursor_position",
        "mouse_move",
        "left_mouse_down",
        "left_mouse_up",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click",
        "double_click",
        "triple_click",
        "scroll",
        "wait",
        "screenshot"
      ]),
      coordinate: tuple([number().int(), number().int()]).optional(),
      duration: number().optional(),
      scroll_amount: number().optional(),
      scroll_direction: _enum(["up", "down", "left", "right"]).optional(),
      start_coordinate: tuple([number().int(), number().int()]).optional(),
      text: string().optional()
    })
  )
);
var computer_20250124 = createProviderToolFactory({
  id: "anthropic.computer_20250124",
  inputSchema: computer_20250124InputSchema
});
var computer_20251124InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      action: _enum([
        "key",
        "hold_key",
        "type",
        "cursor_position",
        "mouse_move",
        "left_mouse_down",
        "left_mouse_up",
        "left_click",
        "left_click_drag",
        "right_click",
        "middle_click",
        "double_click",
        "triple_click",
        "scroll",
        "wait",
        "screenshot",
        "zoom"
      ]),
      coordinate: tuple([number().int(), number().int()]).optional(),
      duration: number().optional(),
      region: tuple([
        number().int(),
        number().int(),
        number().int(),
        number().int()
      ]).optional(),
      scroll_amount: number().optional(),
      scroll_direction: _enum(["up", "down", "left", "right"]).optional(),
      start_coordinate: tuple([number().int(), number().int()]).optional(),
      text: string().optional()
    })
  )
);
var computer_20251124 = createProviderToolFactory({
  id: "anthropic.computer_20251124",
  inputSchema: computer_20251124InputSchema
});
var memory_20250818InputSchema = lazySchema(
  () => zodSchema(
    discriminatedUnion("command", [
      object$1({
        command: literal("view"),
        path: string(),
        view_range: tuple([number(), number()]).optional()
      }),
      object$1({
        command: literal("create"),
        path: string(),
        file_text: string()
      }),
      object$1({
        command: literal("str_replace"),
        path: string(),
        old_str: string(),
        new_str: string()
      }),
      object$1({
        command: literal("insert"),
        path: string(),
        insert_line: number(),
        insert_text: string()
      }),
      object$1({
        command: literal("delete"),
        path: string()
      }),
      object$1({
        command: literal("rename"),
        old_path: string(),
        new_path: string()
      })
    ])
  )
);
var memory_20250818 = createProviderToolFactory({
  id: "anthropic.memory_20250818",
  inputSchema: memory_20250818InputSchema
});
var textEditor_20241022InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      command: _enum(["view", "create", "str_replace", "insert", "undo_edit"]),
      path: string(),
      file_text: string().optional(),
      insert_line: number().int().optional(),
      new_str: string().optional(),
      insert_text: string().optional(),
      old_str: string().optional(),
      view_range: array$1(number().int()).optional()
    })
  )
);
var textEditor_20241022 = createProviderToolFactory({
  id: "anthropic.text_editor_20241022",
  inputSchema: textEditor_20241022InputSchema
});
var textEditor_20250124InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      command: _enum(["view", "create", "str_replace", "insert", "undo_edit"]),
      path: string(),
      file_text: string().optional(),
      insert_line: number().int().optional(),
      new_str: string().optional(),
      insert_text: string().optional(),
      old_str: string().optional(),
      view_range: array$1(number().int()).optional()
    })
  )
);
var textEditor_20250124 = createProviderToolFactory({
  id: "anthropic.text_editor_20250124",
  inputSchema: textEditor_20250124InputSchema
});
var textEditor_20250429InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      command: _enum(["view", "create", "str_replace", "insert"]),
      path: string(),
      file_text: string().optional(),
      insert_line: number().int().optional(),
      new_str: string().optional(),
      insert_text: string().optional(),
      old_str: string().optional(),
      view_range: array$1(number().int()).optional()
    })
  )
);
var textEditor_20250429 = createProviderToolFactory({
  id: "anthropic.text_editor_20250429",
  inputSchema: textEditor_20250429InputSchema
});
var toolSearchBm25_20251119OutputSchema = lazySchema(
  () => zodSchema(
    array$1(
      object$1({
        type: literal("tool_reference"),
        toolName: string()
      })
    )
  )
);
var toolSearchBm25_20251119InputSchema = lazySchema(
  () => zodSchema(
    object$1({
      /**
       * A natural language query to search for tools.
       * Claude will use BM25 text search to find relevant tools.
       */
      query: string(),
      /**
       * Maximum number of tools to return. Optional.
       */
      limit: number().optional()
    })
  )
);
var factory12 = createProviderToolFactoryWithOutputSchema({
  id: "anthropic.tool_search_bm25_20251119",
  inputSchema: toolSearchBm25_20251119InputSchema,
  outputSchema: toolSearchBm25_20251119OutputSchema,
  supportsDeferredResults: true
});
var toolSearchBm25_20251119 = (args = {}) => {
  return factory12(args);
};
var anthropicTools = {
  /**
   * Pairs a faster executor model with a higher-intelligence advisor model
   * that provides strategic guidance mid-generation.
   *
   * The advisor lets a faster, lower-cost executor model consult a
   * higher-intelligence advisor model server-side. The advisor reads the
   * executor's full transcript and produces a plan or course correction;
   * the executor continues with the task, informed by the advice. All of
   * this happens inside a single `/v1/messages` request.
   *
   * Beta header `advisor-tool-2026-03-01` is added automatically when this
   * tool is included.
   *
   * Multi-turn conversations: pass the full assistant content (including
   * `advisor_tool_result` blocks) back to the API on subsequent turns. If
   * you omit the advisor tool from `tools` on a follow-up turn while the
   * message history still contains `advisor_tool_result` blocks, the API
   * returns a `400 invalid_request_error`.
   *
   * Supported executor models: Claude Haiku 4.5, Sonnet 4.6, Opus 4.6,
   * Opus 4.7. The advisor must be at least as capable as the executor.
   *
   * @param model - The advisor model ID (required), e.g. `"claude-opus-4-8"`.
   * @param maxUses - Maximum advisor calls per request (per-request cap).
   * @param caching - Enables prompt caching for the advisor's transcript
   * across calls within a conversation. Worthwhile from ~3 advisor calls
   * per conversation.
   */
  advisor_20260301,
  /**
   * The bash tool enables Claude to execute shell commands in a persistent bash session,
   * allowing system operations, script execution, and command-line automation.
   *
   * Image results are supported.
   */
  bash_20241022,
  /**
   * The bash tool enables Claude to execute shell commands in a persistent bash session,
   * allowing system operations, script execution, and command-line automation.
   *
   * Image results are supported.
   */
  bash_20250124,
  /**
   * Claude can analyze data, create visualizations, perform complex calculations,
   * run system commands, create and edit files, and process uploaded files directly within
   * the API conversation.
   *
   * The code execution tool allows Claude to run Bash commands and manipulate files,
   * including writing code, in a secure, sandboxed environment.
   */
  codeExecution_20250522,
  /**
   * Claude can analyze data, create visualizations, perform complex calculations,
   * run system commands, create and edit files, and process uploaded files directly within
   * the API conversation.
   *
   * The code execution tool allows Claude to run both Python and Bash commands and manipulate files,
   * including writing code, in a secure, sandboxed environment.
   *
   * This is the latest version with enhanced Bash support and file operations.
   */
  codeExecution_20250825,
  /**
   * Claude can analyze data, create visualizations, perform complex calculations,
   * run system commands, create and edit files, and process uploaded files directly within
   * the API conversation.
   *
   * The code execution tool allows Claude to run both Python and Bash commands and manipulate files,
   * including writing code, in a secure, sandboxed environment.
   *
   * This is the recommended version. Does not require a beta header.
   *
   * Supported models: Claude Opus 4.6, Sonnet 4.6, Sonnet 4.5, Opus 4.5
   */
  codeExecution_20260120,
  /**
   * Claude can interact with computer environments through the computer use tool, which
   * provides screenshot capabilities and mouse/keyboard control for autonomous desktop interaction.
   *
   * Image results are supported.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   */
  computer_20241022,
  /**
   * Claude can interact with computer environments through the computer use tool, which
   * provides screenshot capabilities and mouse/keyboard control for autonomous desktop interaction.
   *
   * Image results are supported.
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   */
  computer_20250124,
  /**
   * Claude can interact with computer environments through the computer use tool, which
   * provides screenshot capabilities and mouse/keyboard control for autonomous desktop interaction.
   *
   * This version adds the zoom action for detailed screen region inspection.
   *
   * Image results are supported.
   *
   * Supported models: Claude Opus 4.5
   *
   * @param displayWidthPx - The width of the display being controlled by the model in pixels.
   * @param displayHeightPx - The height of the display being controlled by the model in pixels.
   * @param displayNumber - The display number to control (only relevant for X11 environments). If specified, the tool will be provided a display number in the tool definition.
   * @param enableZoom - Enable zoom action. Set to true to allow Claude to zoom into specific screen regions. Default: false.
   */
  computer_20251124,
  /**
   * The computer toolset lets Claude control a computer through screenshots,
   * mouse, and keyboard. It replaces the versioned computer tools
   * (`computer_20251124` and earlier) on newer models.
   *
   * The API returns each computer action as its own `tool_use` block with
   * `toolset_name: 'computer'`. The AI SDK maps every member call to this tool
   * and exposes the member name as `action`, so `execute` receives the same
   * input shape as the older computer tools. Claude may return several actions
   * in one turn.
   *
   * Coordinates are always in the pixel space of the screenshots you return;
   * there are no display size parameters. Zoom is enabled by default.
   *
   * Does not require a beta header.
   *
   * Supported models: Claude Opus 5.5 (required; older computer tool types
   * are rejected), Opus 5, Sonnet 5, Fable 5, Fable 5.1, Opus 4.8.
   *
   * @param configs - Per-member settings keyed by member name, e.g.
   * `{ zoom: { enabled: false } }`. Omitted members keep their defaults.
   */
  computerToolset_20260801,
  /**
   * The memory tool enables Claude to store and retrieve information across conversations through a memory file directory.
   * Claude can create, read, update, and delete files that persist between sessions,
   * allowing it to build knowledge over time without keeping everything in the context window.
   * The memory tool operates client-side—you control where and how the data is stored through your own infrastructure.
   *
   * Supported models: Claude Sonnet 4.5, Claude Sonnet 4, Claude Opus 4.1, Claude Opus 4.
   */
  memory_20250818,
  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Supported models: Claude Sonnet 3.5
   */
  textEditor_20241022,
  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Supported models: Claude Sonnet 3.7
   */
  textEditor_20250124,
  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Note: This version does not support the "undo_edit" command.
   *
   * @deprecated Use textEditor_20250728 instead
   */
  textEditor_20250429,
  /**
   * Claude can use an Anthropic-defined text editor tool to view and modify text files,
   * helping you debug, fix, and improve your code or other text documents. This allows Claude
   * to directly interact with your files, providing hands-on assistance rather than just suggesting changes.
   *
   * Note: This version does not support the "undo_edit" command and adds optional max_characters parameter.
   *
   * Supported models: Claude Sonnet 4, Opus 4, and Opus 4.1
   *
   * @param maxCharacters - Optional maximum number of characters to view in the file
   */
  textEditor_20250728,
  /**
   * Creates a web fetch tool that gives Claude direct access to real-time web content.
   *
   * @param maxUses - The max_uses parameter limits the number of web fetches performed
   * @param allowedDomains - Only fetch from these domains
   * @param blockedDomains - Never fetch from these domains
   * @param citations - Unlike web search where citations are always enabled, citations are optional for web fetch. Set "citations": {"enabled": true} to enable Claude to cite specific passages from fetched documents.
   * @param maxContentTokens - The max_content_tokens parameter limits the amount of content that will be included in the context.
   */
  webFetch_20250910,
  /**
   * Creates a web fetch tool that gives Claude direct access to real-time web content.
   *
   * @param maxUses - The max_uses parameter limits the number of web fetches performed
   * @param allowedDomains - Only fetch from these domains
   * @param blockedDomains - Never fetch from these domains
   * @param citations - Unlike web search where citations are always enabled, citations are optional for web fetch. Set "citations": {"enabled": true} to enable Claude to cite specific passages from fetched documents.
   * @param maxContentTokens - The max_content_tokens parameter limits the amount of content that will be included in the context.
   */
  webFetch_20260209,
  /**
   * Creates a web search tool that gives Claude direct access to real-time web content.
   *
   * @param maxUses - Maximum number of web searches Claude can perform during the conversation.
   * @param allowedDomains - Optional list of domains that Claude is allowed to search.
   * @param blockedDomains - Optional list of domains that Claude should avoid when searching.
   * @param userLocation - Optional user location information to provide geographically relevant search results.
   */
  webSearch_20250305,
  /**
   * Creates a web search tool that gives Claude direct access to real-time web content.
   *
   * @param maxUses - Maximum number of web searches Claude can perform during the conversation.
   * @param allowedDomains - Optional list of domains that Claude is allowed to search.
   * @param blockedDomains - Optional list of domains that Claude should avoid when searching.
   * @param userLocation - Optional user location information to provide geographically relevant search results.
   */
  webSearch_20260209,
  /**
   * Creates a tool search tool that uses regex patterns to find tools.
   *
   * The tool search tool enables Claude to work with hundreds or thousands of tools
   * by dynamically discovering and loading them on-demand. Instead of loading all
   * tool definitions into the context window upfront, Claude searches your tool
   * catalog and loads only the tools it needs.
   *
   * Use `providerOptions: { anthropic: { deferLoading: true } }` on other tools
   * to mark them for deferred loading.
   *
   * Supported models: Claude Opus 4.5, Claude Sonnet 4.5
   */
  toolSearchRegex_20251119,
  /**
   * Creates a tool search tool that uses BM25 (natural language) to find tools.
   *
   * The tool search tool enables Claude to work with hundreds or thousands of tools
   * by dynamically discovering and loading them on-demand. Instead of loading all
   * tool definitions into the context window upfront, Claude searches your tool
   * catalog and loads only the tools it needs.
   *
   * Use `providerOptions: { anthropic: { deferLoading: true } }` on other tools
   * to mark them for deferred loading.
   *
   * Supported models: Claude Opus 4.5, Claude Sonnet 4.5
   */
  toolSearchBm25_20251119
};
var ANTHROPIC_API_URL = "https://api.anthropic.com";
var ANTHROPIC_API_VERSIONED_URL = `${ANTHROPIC_API_URL}/v1`;
function normalizeBaseURL(baseURL) {
  const baseURLWithoutTrailingSlash = withoutTrailingSlash(baseURL);
  return baseURLWithoutTrailingSlash === ANTHROPIC_API_URL ? ANTHROPIC_API_VERSIONED_URL : baseURLWithoutTrailingSlash;
}
function createAnthropic(options = {}) {
  var _a21, _b15;
  const baseURL = (_a21 = normalizeBaseURL(
    loadOptionalSetting({
      settingValue: options.baseURL,
      environmentVariableName: "ANTHROPIC_BASE_URL"
    })
  )) != null ? _a21 : ANTHROPIC_API_VERSIONED_URL;
  const providerName = (_b15 = options.name) != null ? _b15 : "anthropic.messages";
  if (options.apiKey && options.authToken) {
    throw new InvalidArgumentError$1({
      argument: "apiKey/authToken",
      message: "Both apiKey and authToken were provided. Please use only one authentication method."
    });
  }
  const getHeaders = () => {
    const authHeaders = options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {
      "x-api-key": loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: "ANTHROPIC_API_KEY",
        description: "Anthropic"
      })
    };
    return withUserAgentSuffix(
      {
        "anthropic-version": "2023-06-01",
        ...authHeaders,
        ...options.headers
      },
      `ai-sdk/anthropic/${VERSION$3}`
    );
  };
  const createChatModel = (modelId) => {
    var _a22;
    return new AnthropicMessagesLanguageModel(modelId, {
      provider: providerName,
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      generateId: (_a22 = options.generateId) != null ? _a22 : generateId,
      supportedUrls: () => ({
        "image/*": [/^https?:\/\/.*$/],
        "application/pdf": [/^https?:\/\/.*$/]
      })
    });
  };
  const provider = function(modelId) {
    if (new.target) {
      throw new Error(
        "The Anthropic model function cannot be called with the new keyword."
      );
    }
    return createChatModel(modelId);
  };
  provider.specificationVersion = "v3";
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.embeddingModel = (modelId) => {
    throw new NoSuchModelError2({ modelId, modelType: "embeddingModel" });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError2({ modelId, modelType: "imageModel" });
  };
  provider.tools = anthropicTools;
  return provider;
}
createAnthropic();
var getContext_1;
var hasRequiredGetContext;
function requireGetContext() {
  if (hasRequiredGetContext) return getContext_1;
  hasRequiredGetContext = 1;
  var __defProp2 = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export2 = (target, all) => {
    for (var name21 in all)
      __defProp2(target, name21, { get: all[name21], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp2({}, "__esModule", { value: true }), mod);
  var get_context_exports = {};
  __export2(get_context_exports, {
    SYMBOL_FOR_REQ_CONTEXT: () => SYMBOL_FOR_REQ_CONTEXT,
    getContext: () => getContext
  });
  getContext_1 = __toCommonJS(get_context_exports);
  const SYMBOL_FOR_REQ_CONTEXT = Symbol.for("@vercel/request-context");
  function getContext() {
    var _a21, _b15;
    const fromSymbol = globalThis;
    return ((_b15 = (_a21 = fromSymbol[SYMBOL_FOR_REQ_CONTEXT]) == null ? void 0 : _a21.get) == null ? void 0 : _b15.call(_a21)) ?? {};
  }
  return getContext_1;
}
var indexBrowser;
var hasRequiredIndexBrowser;
function requireIndexBrowser() {
  if (hasRequiredIndexBrowser) return indexBrowser;
  hasRequiredIndexBrowser = 1;
  var __defProp2 = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export2 = (target, all) => {
    for (var name21 in all)
      __defProp2(target, name21, { get: all[name21], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp2({}, "__esModule", { value: true }), mod);
  var index_browser_exports = {};
  __export2(index_browser_exports, {
    getContext: () => import_get_context.getContext,
    getVercelOidcToken: () => getVercelOidcToken,
    getVercelOidcTokenSync: () => getVercelOidcTokenSync
  });
  indexBrowser = __toCommonJS(index_browser_exports);
  var import_get_context = requireGetContext();
  async function getVercelOidcToken() {
    return "";
  }
  function getVercelOidcTokenSync() {
    return "";
  }
  return indexBrowser;
}
var indexBrowserExports = requireIndexBrowser();
var marker$1 = "vercel.ai.gateway.error";
var symbol$1 = Symbol.for(marker$1);
var _a$1, _b;
var GatewayError = class _GatewayError extends (_b = Error, _a$1 = symbol$1, _b) {
  constructor({
    message,
    statusCode = 500,
    cause,
    generationId
  }) {
    super(generationId ? `${message} [${generationId}]` : message);
    this[_a$1] = true;
    this.statusCode = statusCode;
    this.cause = cause;
    this.generationId = generationId;
  }
  /**
   * Checks if the given error is a Gateway Error.
   * @param {unknown} error - The error to check.
   * @returns {boolean} True if the error is a Gateway Error, false otherwise.
   */
  static isInstance(error) {
    return _GatewayError.hasMarker(error);
  }
  static hasMarker(error) {
    return typeof error === "object" && error !== null && symbol$1 in error && error[symbol$1] === true;
  }
};
var name$1 = "GatewayAuthenticationError";
var marker2$1 = `vercel.ai.gateway.error.${name$1}`;
var symbol2$1 = Symbol.for(marker2$1);
var _a2$1, _b2;
var GatewayAuthenticationError = class _GatewayAuthenticationError extends (_b2 = GatewayError, _a2$1 = symbol2$1, _b2) {
  constructor({
    message = "Authentication failed",
    statusCode = 401,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a2$1] = true;
    this.name = name$1;
    this.type = "authentication_error";
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol2$1 in error;
  }
  /**
   * Creates a contextual error message when authentication fails
   */
  static createContextualError({
    apiKeyProvided,
    oidcTokenProvided,
    message = "Authentication failed",
    statusCode = 401,
    cause,
    generationId
  }) {
    let contextualMessage;
    if (apiKeyProvided) {
      contextualMessage = `AI Gateway authentication failed: Invalid API key.

Create a new API key: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys

Provide via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.`;
    } else if (oidcTokenProvided) {
      contextualMessage = `AI Gateway authentication failed: Invalid OIDC token.

Run 'npx vercel link' to link your project, then 'vc env pull' to fetch the token.

Alternatively, use an API key: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys`;
    } else {
      contextualMessage = `AI Gateway authentication failed: No authentication provided.

Option 1 - API key:
Create an API key: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys
Provide via 'apiKey' option or 'AI_GATEWAY_API_KEY' environment variable.

Option 2 - OIDC token:
Run 'npx vercel link' to link your project, then 'vc env pull' to fetch the token.`;
    }
    return new _GatewayAuthenticationError({
      message: contextualMessage,
      statusCode,
      cause,
      generationId
    });
  }
};
var name2$1 = "GatewayInvalidRequestError";
var marker3$1 = `vercel.ai.gateway.error.${name2$1}`;
var symbol3$1 = Symbol.for(marker3$1);
var _a3$1, _b3;
var GatewayInvalidRequestError = class extends (_b3 = GatewayError, _a3$1 = symbol3$1, _b3) {
  constructor({
    message = "Invalid request",
    statusCode = 400,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a3$1] = true;
    this.name = name2$1;
    this.type = "invalid_request_error";
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol3$1 in error;
  }
};
var name3$1 = "GatewayRateLimitError";
var marker4$1 = `vercel.ai.gateway.error.${name3$1}`;
var symbol4$1 = Symbol.for(marker4$1);
var _a4$1, _b4;
var GatewayRateLimitError = class extends (_b4 = GatewayError, _a4$1 = symbol4$1, _b4) {
  constructor({
    message = "Rate limit exceeded",
    statusCode = 429,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a4$1] = true;
    this.name = name3$1;
    this.type = "rate_limit_exceeded";
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol4$1 in error;
  }
};
var name4$1 = "GatewayModelNotFoundError";
var marker5$1 = `vercel.ai.gateway.error.${name4$1}`;
var symbol5$1 = Symbol.for(marker5$1);
var modelNotFoundParamSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      modelId: string()
    })
  )
);
var _a5$1, _b5;
var GatewayModelNotFoundError = class extends (_b5 = GatewayError, _a5$1 = symbol5$1, _b5) {
  constructor({
    message = "Model not found",
    statusCode = 404,
    modelId,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a5$1] = true;
    this.name = name4$1;
    this.type = "model_not_found";
    this.modelId = modelId;
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol5$1 in error;
  }
};
var name5$1 = "GatewayInternalServerError";
var marker6$1 = `vercel.ai.gateway.error.${name5$1}`;
var symbol6$1 = Symbol.for(marker6$1);
var _a6$1, _b6;
var GatewayInternalServerError = class extends (_b6 = GatewayError, _a6$1 = symbol6$1, _b6) {
  constructor({
    message = "Internal server error",
    statusCode = 500,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a6$1] = true;
    this.name = name5$1;
    this.type = "internal_server_error";
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol6$1 in error;
  }
};
var name6$1 = "GatewayResponseError";
var marker7$1 = `vercel.ai.gateway.error.${name6$1}`;
var symbol7$1 = Symbol.for(marker7$1);
var _a7$1, _b7;
var GatewayResponseError = class extends (_b7 = GatewayError, _a7$1 = symbol7$1, _b7) {
  constructor({
    message = "Invalid response from Gateway",
    statusCode = 502,
    response,
    validationError,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a7$1] = true;
    this.name = name6$1;
    this.type = "response_error";
    this.response = response;
    this.validationError = validationError;
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol7$1 in error;
  }
};
async function createGatewayErrorFromResponse({
  response,
  statusCode,
  defaultMessage = "Gateway request failed",
  cause,
  authMethod
}) {
  var _a92;
  const parseResult = await safeValidateTypes$1({
    value: response,
    schema: gatewayErrorResponseSchema
  });
  if (!parseResult.success) {
    const rawGenerationId = typeof response === "object" && response !== null && "generationId" in response ? response.generationId : void 0;
    return new GatewayResponseError({
      message: `Invalid error response format: ${defaultMessage}`,
      statusCode,
      response,
      validationError: parseResult.error,
      cause,
      generationId: rawGenerationId
    });
  }
  const validatedResponse = parseResult.value;
  const errorType = validatedResponse.error.type;
  const message = validatedResponse.error.message;
  const generationId = (_a92 = validatedResponse.generationId) != null ? _a92 : void 0;
  switch (errorType) {
    case "authentication_error":
      return GatewayAuthenticationError.createContextualError({
        apiKeyProvided: authMethod === "api-key",
        oidcTokenProvided: authMethod === "oidc",
        statusCode,
        cause,
        generationId
      });
    case "invalid_request_error":
      return new GatewayInvalidRequestError({
        message,
        statusCode,
        cause,
        generationId
      });
    case "rate_limit_exceeded":
      return new GatewayRateLimitError({
        message,
        statusCode,
        cause,
        generationId
      });
    case "model_not_found": {
      const modelResult = await safeValidateTypes$1({
        value: validatedResponse.error.param,
        schema: modelNotFoundParamSchema
      });
      return new GatewayModelNotFoundError({
        message,
        statusCode,
        modelId: modelResult.success ? modelResult.value.modelId : void 0,
        cause,
        generationId
      });
    }
    case "internal_server_error":
      return new GatewayInternalServerError({
        message,
        statusCode,
        cause,
        generationId
      });
    default:
      return new GatewayInternalServerError({
        message,
        statusCode,
        cause,
        generationId
      });
  }
}
var gatewayErrorResponseSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      error: object$1({
        message: string(),
        type: string().nullish(),
        param: unknown().nullish(),
        code: union([string(), number()]).nullish()
      }),
      generationId: string().nullish()
    })
  )
);
var name7$1 = "GatewayTimeoutError";
var marker8$1 = `vercel.ai.gateway.error.${name7$1}`;
var symbol8$1 = Symbol.for(marker8$1);
var _a8$1, _b8;
var GatewayTimeoutError = class _GatewayTimeoutError extends (_b8 = GatewayError, _a8$1 = symbol8$1, _b8) {
  constructor({
    message = "Request timed out",
    statusCode = 408,
    cause,
    generationId
  } = {}) {
    super({ message, statusCode, cause, generationId });
    this[_a8$1] = true;
    this.name = name7$1;
    this.type = "timeout_error";
  }
  static isInstance(error) {
    return GatewayError.hasMarker(error) && symbol8$1 in error;
  }
  /**
   * Creates a helpful timeout error message with troubleshooting guidance
   */
  static createTimeoutError({
    originalMessage,
    statusCode = 408,
    cause,
    generationId
  }) {
    const message = `Gateway request timed out: ${originalMessage}

    This is a client-side timeout. To resolve this, increase your timeout configuration: https://vercel.com/docs/ai-gateway/capabilities/video-generation#extending-timeouts-for-node.js`;
    return new _GatewayTimeoutError({
      message,
      statusCode,
      cause,
      generationId
    });
  }
};
function isTimeoutError(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  const errorCode = error.code;
  if (typeof errorCode === "string") {
    const undiciTimeoutCodes = [
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
      "UND_ERR_CONNECT_TIMEOUT"
    ];
    return undiciTimeoutCodes.includes(errorCode);
  }
  return false;
}
async function asGatewayError(error, authMethod) {
  var _a92;
  if (GatewayError.isInstance(error)) {
    return error;
  }
  if (isTimeoutError(error)) {
    return GatewayTimeoutError.createTimeoutError({
      originalMessage: error instanceof Error ? error.message : "Unknown error",
      cause: error
    });
  }
  if (APICallError$1.isInstance(error)) {
    if (error.cause && isTimeoutError(error.cause)) {
      return GatewayTimeoutError.createTimeoutError({
        originalMessage: error.message,
        cause: error
      });
    }
    return await createGatewayErrorFromResponse({
      response: extractApiCallResponse(error),
      statusCode: (_a92 = error.statusCode) != null ? _a92 : 500,
      defaultMessage: "Gateway request failed",
      cause: error,
      authMethod
    });
  }
  return await createGatewayErrorFromResponse({
    response: {},
    statusCode: 500,
    defaultMessage: error instanceof Error ? `Gateway request failed: ${error.message}` : "Unknown Gateway error",
    cause: error,
    authMethod
  });
}
function extractApiCallResponse(error) {
  if (error.data !== void 0) {
    return error.data;
  }
  if (error.responseBody != null) {
    try {
      return JSON.parse(error.responseBody);
    } catch (e) {
      return error.responseBody;
    }
  }
  return {};
}
var GATEWAY_AUTH_METHOD_HEADER = "ai-gateway-auth-method";
async function parseAuthMethod(headers) {
  const result = await safeValidateTypes$1({
    value: headers[GATEWAY_AUTH_METHOD_HEADER],
    schema: gatewayAuthMethodSchema
  });
  return result.success ? result.value : void 0;
}
var gatewayAuthMethodSchema = lazySchema$1(
  () => zodSchema$1(union([literal("api-key"), literal("oidc")]))
);
var GatewayFetchMetadata = class {
  constructor(config) {
    this.config = config;
  }
  async getAvailableModels() {
    try {
      const { value } = await getFromApi({
        url: `${this.config.baseURL}/config`,
        headers: await resolve$1(this.config.headers()),
        successfulResponseHandler: createJsonResponseHandler$1(
          gatewayAvailableModelsResponseSchema
        ),
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        fetch: this.config.fetch
      });
      return value;
    } catch (error) {
      throw await asGatewayError(error);
    }
  }
  async getCredits() {
    try {
      const baseUrl = new URL(this.config.baseURL);
      const { value } = await getFromApi({
        url: `${baseUrl.origin}/v1/credits`,
        headers: await resolve$1(this.config.headers()),
        successfulResponseHandler: createJsonResponseHandler$1(
          gatewayCreditsResponseSchema
        ),
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        fetch: this.config.fetch
      });
      return value;
    } catch (error) {
      throw await asGatewayError(error);
    }
  }
};
var gatewayAvailableModelsResponseSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      models: array$1(
        object$1({
          id: string(),
          name: string(),
          description: string().nullish(),
          pricing: object$1({
            input: string(),
            output: string(),
            input_cache_read: string().nullish(),
            input_cache_write: string().nullish()
          }).transform(
            ({ input, output, input_cache_read, input_cache_write }) => ({
              input,
              output,
              ...input_cache_read ? { cachedInputTokens: input_cache_read } : {},
              ...input_cache_write ? { cacheCreationInputTokens: input_cache_write } : {}
            })
          ).nullish(),
          specification: object$1({
            specificationVersion: literal("v3"),
            provider: string(),
            modelId: string()
          }),
          modelType: _enum(["embedding", "image", "language", "video"]).nullish()
        })
      )
    })
  )
);
var gatewayCreditsResponseSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      balance: string(),
      total_used: string()
    }).transform(({ balance, total_used }) => ({
      balance,
      totalUsed: total_used
    }))
  )
);
var GatewayLanguageModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v3";
    this.supportedUrls = { "*/*": [/.*/] };
  }
  get provider() {
    return this.config.provider;
  }
  async getArgs(options) {
    const { abortSignal: _abortSignal, ...optionsWithoutSignal } = options;
    return {
      args: this.maybeEncodeFileParts(optionsWithoutSignal),
      warnings: []
    };
  }
  async doGenerate(options) {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;
    const resolvedHeaders = await resolve$1(this.config.headers());
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue: rawResponse
      } = await postJsonToApi$1({
        url: this.getUrl(),
        headers: combineHeaders$1(
          resolvedHeaders,
          options.headers,
          this.getModelConfigHeaders(this.modelId, false),
          await resolve$1(this.config.o11yHeaders)
        ),
        body: args,
        successfulResponseHandler: createJsonResponseHandler$1(any()),
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        ...abortSignal && { abortSignal },
        fetch: this.config.fetch
      });
      return {
        ...responseBody,
        request: { body: args },
        response: { headers: responseHeaders, body: rawResponse },
        warnings
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }
  async doStream(options) {
    const { args, warnings } = await this.getArgs(options);
    const { abortSignal } = options;
    const resolvedHeaders = await resolve$1(this.config.headers());
    try {
      const { value: response, responseHeaders } = await postJsonToApi$1({
        url: this.getUrl(),
        headers: combineHeaders$1(
          resolvedHeaders,
          options.headers,
          this.getModelConfigHeaders(this.modelId, true),
          await resolve$1(this.config.o11yHeaders)
        ),
        body: args,
        successfulResponseHandler: createEventSourceResponseHandler$1(any()),
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        ...abortSignal && { abortSignal },
        fetch: this.config.fetch
      });
      return {
        stream: response.pipeThrough(
          new TransformStream({
            start(controller) {
              if (warnings.length > 0) {
                controller.enqueue({ type: "stream-start", warnings });
              }
            },
            transform(chunk, controller) {
              if (chunk.success) {
                const streamPart = chunk.value;
                if (streamPart.type === "raw" && !options.includeRawChunks) {
                  return;
                }
                if (streamPart.type === "response-metadata" && streamPart.timestamp && typeof streamPart.timestamp === "string") {
                  streamPart.timestamp = new Date(streamPart.timestamp);
                }
                controller.enqueue(streamPart);
              } else {
                controller.error(
                  chunk.error
                );
              }
            }
          })
        ),
        request: { body: args },
        response: { headers: responseHeaders }
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }
  isFilePart(part) {
    return part && typeof part === "object" && "type" in part && part.type === "file";
  }
  /**
   * Encodes file parts in the prompt to base64. Mutates the passed options
   * instance directly to avoid copying the file data.
   * @param options - The options to encode.
   * @returns The options with the file parts encoded.
   */
  maybeEncodeFileParts(options) {
    for (const message of options.prompt) {
      for (const part of message.content) {
        if (this.isFilePart(part)) {
          const filePart = part;
          if (filePart.data instanceof Uint8Array) {
            const buffer = Uint8Array.from(filePart.data);
            const base64Data = Buffer.from(buffer).toString("base64");
            filePart.data = new URL(
              `data:${filePart.mediaType || "application/octet-stream"};base64,${base64Data}`
            );
          }
        }
      }
    }
    return options;
  }
  getUrl() {
    return `${this.config.baseURL}/language-model`;
  }
  getModelConfigHeaders(modelId, streaming) {
    return {
      "ai-language-model-specification-version": "3",
      "ai-language-model-id": modelId,
      "ai-language-model-streaming": String(streaming)
    };
  }
};
var GatewayEmbeddingModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v3";
    this.maxEmbeddingsPerCall = 2048;
    this.supportsParallelCalls = true;
  }
  get provider() {
    return this.config.provider;
  }
  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions
  }) {
    var _a92;
    const resolvedHeaders = await resolve$1(this.config.headers());
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue
      } = await postJsonToApi$1({
        url: this.getUrl(),
        headers: combineHeaders$1(
          resolvedHeaders,
          headers != null ? headers : {},
          this.getModelConfigHeaders(),
          await resolve$1(this.config.o11yHeaders)
        ),
        body: {
          values,
          ...providerOptions ? { providerOptions } : {}
        },
        successfulResponseHandler: createJsonResponseHandler$1(
          gatewayEmbeddingResponseSchema
        ),
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        ...abortSignal && { abortSignal },
        fetch: this.config.fetch
      });
      return {
        embeddings: responseBody.embeddings,
        usage: (_a92 = responseBody.usage) != null ? _a92 : void 0,
        providerMetadata: responseBody.providerMetadata,
        response: { headers: responseHeaders, body: rawValue },
        warnings: []
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }
  getUrl() {
    return `${this.config.baseURL}/embedding-model`;
  }
  getModelConfigHeaders() {
    return {
      "ai-embedding-model-specification-version": "3",
      "ai-model-id": this.modelId
    };
  }
};
var gatewayEmbeddingResponseSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      embeddings: array$1(array$1(number())),
      usage: object$1({ tokens: number() }).nullish(),
      providerMetadata: record(string(), record(string(), unknown())).optional()
    })
  )
);
var GatewayImageModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v3";
    this.maxImagesPerCall = Number.MAX_SAFE_INTEGER;
  }
  get provider() {
    return this.config.provider;
  }
  async doGenerate({
    prompt,
    n,
    size,
    aspectRatio,
    seed,
    files,
    mask,
    providerOptions,
    headers,
    abortSignal
  }) {
    var _a92, _b92, _c, _d;
    const resolvedHeaders = await resolve$1(this.config.headers());
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue
      } = await postJsonToApi$1({
        url: this.getUrl(),
        headers: combineHeaders$1(
          resolvedHeaders,
          headers != null ? headers : {},
          this.getModelConfigHeaders(),
          await resolve$1(this.config.o11yHeaders)
        ),
        body: {
          prompt,
          n,
          ...size && { size },
          ...aspectRatio && { aspectRatio },
          ...seed && { seed },
          ...providerOptions && { providerOptions },
          ...files && {
            files: files.map((file) => maybeEncodeImageFile(file))
          },
          ...mask && { mask: maybeEncodeImageFile(mask) }
        },
        successfulResponseHandler: createJsonResponseHandler$1(
          gatewayImageResponseSchema
        ),
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        ...abortSignal && { abortSignal },
        fetch: this.config.fetch
      });
      return {
        images: responseBody.images,
        // Always base64 strings from server
        warnings: (_a92 = responseBody.warnings) != null ? _a92 : [],
        providerMetadata: responseBody.providerMetadata,
        response: {
          timestamp: /* @__PURE__ */ new Date(),
          modelId: this.modelId,
          headers: responseHeaders
        },
        ...responseBody.usage != null && {
          usage: {
            inputTokens: (_b92 = responseBody.usage.inputTokens) != null ? _b92 : void 0,
            outputTokens: (_c = responseBody.usage.outputTokens) != null ? _c : void 0,
            totalTokens: (_d = responseBody.usage.totalTokens) != null ? _d : void 0
          }
        }
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }
  getUrl() {
    return `${this.config.baseURL}/image-model`;
  }
  getModelConfigHeaders() {
    return {
      "ai-image-model-specification-version": "3",
      "ai-model-id": this.modelId
    };
  }
};
function maybeEncodeImageFile(file) {
  if (file.type === "file" && file.data instanceof Uint8Array) {
    return {
      ...file,
      data: convertUint8ArrayToBase64$1(file.data)
    };
  }
  return file;
}
var providerMetadataEntrySchema = object$1({
  images: array$1(unknown()).optional()
}).catchall(unknown());
var gatewayImageWarningSchema = discriminatedUnion("type", [
  object$1({
    type: literal("unsupported"),
    feature: string(),
    details: string().optional()
  }),
  object$1({
    type: literal("compatibility"),
    feature: string(),
    details: string().optional()
  }),
  object$1({
    type: literal("other"),
    message: string()
  })
]);
var gatewayImageUsageSchema = object$1({
  inputTokens: number().nullish(),
  outputTokens: number().nullish(),
  totalTokens: number().nullish()
});
var gatewayImageResponseSchema = object$1({
  images: array$1(string()),
  // Always base64 strings over the wire
  warnings: array$1(gatewayImageWarningSchema).optional(),
  providerMetadata: record(string(), providerMetadataEntrySchema).optional(),
  usage: gatewayImageUsageSchema.optional()
});
var GatewayVideoModel = class {
  constructor(modelId, config) {
    this.modelId = modelId;
    this.config = config;
    this.specificationVersion = "v3";
    this.maxVideosPerCall = Number.MAX_SAFE_INTEGER;
  }
  get provider() {
    return this.config.provider;
  }
  async doGenerate({
    prompt,
    n,
    aspectRatio,
    resolution,
    duration,
    fps,
    seed,
    image,
    providerOptions,
    headers,
    abortSignal
  }) {
    var _a92;
    const resolvedHeaders = await resolve$1(this.config.headers());
    try {
      const { responseHeaders, value: responseBody } = await postJsonToApi$1({
        url: this.getUrl(),
        headers: combineHeaders$1(
          resolvedHeaders,
          headers != null ? headers : {},
          this.getModelConfigHeaders(),
          await resolve$1(this.config.o11yHeaders),
          { accept: "text/event-stream" }
        ),
        body: {
          prompt,
          n,
          ...aspectRatio && { aspectRatio },
          ...resolution && { resolution },
          ...duration && { duration },
          ...fps && { fps },
          ...seed && { seed },
          ...providerOptions && { providerOptions },
          ...image && { image: maybeEncodeVideoFile(image) }
        },
        successfulResponseHandler: async ({
          response,
          url,
          requestBodyValues
        }) => {
          if (response.body == null) {
            throw new APICallError$1({
              message: "SSE response body is empty",
              url,
              requestBodyValues,
              statusCode: response.status
            });
          }
          const eventStream = parseJsonEventStream$1({
            stream: response.body,
            schema: gatewayVideoEventSchema
          });
          const reader = eventStream.getReader();
          const { done, value: parseResult } = await reader.read();
          reader.releaseLock();
          if (done || !parseResult) {
            throw new APICallError$1({
              message: "SSE stream ended without a data event",
              url,
              requestBodyValues,
              statusCode: response.status
            });
          }
          if (!parseResult.success) {
            throw new APICallError$1({
              message: "Failed to parse video SSE event",
              cause: parseResult.error,
              url,
              requestBodyValues,
              statusCode: response.status
            });
          }
          const event = parseResult.value;
          if (event.type === "error") {
            throw new APICallError$1({
              message: event.message,
              statusCode: event.statusCode,
              url,
              requestBodyValues,
              responseHeaders: Object.fromEntries([...response.headers]),
              responseBody: JSON.stringify(event),
              data: {
                error: {
                  message: event.message,
                  type: event.errorType,
                  param: event.param
                }
              }
            });
          }
          return {
            value: {
              videos: event.videos,
              warnings: event.warnings,
              providerMetadata: event.providerMetadata
            },
            responseHeaders: Object.fromEntries([...response.headers])
          };
        },
        failedResponseHandler: createJsonErrorResponseHandler$1({
          errorSchema: any(),
          errorToMessage: (data) => data
        }),
        ...abortSignal && { abortSignal },
        fetch: this.config.fetch
      });
      return {
        videos: responseBody.videos,
        warnings: (_a92 = responseBody.warnings) != null ? _a92 : [],
        providerMetadata: responseBody.providerMetadata,
        response: {
          timestamp: /* @__PURE__ */ new Date(),
          modelId: this.modelId,
          headers: responseHeaders
        }
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }
  getUrl() {
    return `${this.config.baseURL}/video-model`;
  }
  getModelConfigHeaders() {
    return {
      "ai-video-model-specification-version": "3",
      "ai-model-id": this.modelId
    };
  }
};
function maybeEncodeVideoFile(file) {
  if (file.type === "file" && file.data instanceof Uint8Array) {
    return {
      ...file,
      data: convertUint8ArrayToBase64$1(file.data)
    };
  }
  return file;
}
var providerMetadataEntrySchema2 = object$1({
  videos: array$1(unknown()).optional()
}).catchall(unknown());
var gatewayVideoDataSchema = union([
  object$1({
    type: literal("url"),
    url: string(),
    mediaType: string()
  }),
  object$1({
    type: literal("base64"),
    data: string(),
    mediaType: string()
  })
]);
var gatewayVideoWarningSchema = discriminatedUnion("type", [
  object$1({
    type: literal("unsupported"),
    feature: string(),
    details: string().optional()
  }),
  object$1({
    type: literal("compatibility"),
    feature: string(),
    details: string().optional()
  }),
  object$1({
    type: literal("other"),
    message: string()
  })
]);
var gatewayVideoEventSchema = discriminatedUnion("type", [
  object$1({
    type: literal("result"),
    videos: array$1(gatewayVideoDataSchema),
    warnings: array$1(gatewayVideoWarningSchema).optional(),
    providerMetadata: record(string(), providerMetadataEntrySchema2).optional()
  }),
  object$1({
    type: literal("error"),
    message: string(),
    errorType: string(),
    statusCode: number(),
    param: unknown().nullable()
  })
]);
var parallelSearchInputSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      objective: string().describe(
        "Natural-language description of the web research goal, including source or freshness guidance and broader context from the task. Maximum 5000 characters."
      ),
      search_queries: array$1(string()).optional().describe(
        "Optional search queries to supplement the objective. Maximum 200 characters per query."
      ),
      mode: _enum(["one-shot", "agentic"]).optional().describe(
        'Mode preset: "one-shot" for comprehensive results with longer excerpts (default), "agentic" for concise, token-efficient results for multi-step workflows.'
      ),
      max_results: number().optional().describe(
        "Maximum number of results to return (1-20). Defaults to 10 if not specified."
      ),
      source_policy: object$1({
        include_domains: array$1(string()).optional().describe("List of domains to include in search results."),
        exclude_domains: array$1(string()).optional().describe("List of domains to exclude from search results."),
        after_date: string().optional().describe(
          "Only include results published after this date (ISO 8601 format)."
        )
      }).optional().describe(
        "Source policy for controlling which domains to include/exclude and freshness."
      ),
      excerpts: object$1({
        max_chars_per_result: number().optional().describe("Maximum characters per result."),
        max_chars_total: number().optional().describe("Maximum total characters across all results.")
      }).optional().describe("Excerpt configuration for controlling result length."),
      fetch_policy: object$1({
        max_age_seconds: number().optional().describe(
          "Maximum age in seconds for cached content. Set to 0 to always fetch fresh content."
        )
      }).optional().describe("Fetch policy for controlling content freshness.")
    })
  )
);
var parallelSearchOutputSchema = lazySchema$1(
  () => zodSchema$1(
    union([
      // Success response
      object$1({
        searchId: string(),
        results: array$1(
          object$1({
            url: string(),
            title: string(),
            excerpt: string(),
            publishDate: string().nullable().optional(),
            relevanceScore: number().optional()
          })
        )
      }),
      // Error response
      object$1({
        error: _enum([
          "api_error",
          "rate_limit",
          "timeout",
          "invalid_input",
          "configuration_error",
          "unknown"
        ]),
        statusCode: number().optional(),
        message: string()
      })
    ])
  )
);
var parallelSearchToolFactory = createProviderToolFactoryWithOutputSchema$1({
  id: "gateway.parallel_search",
  inputSchema: parallelSearchInputSchema,
  outputSchema: parallelSearchOutputSchema
});
var parallelSearch = (config = {}) => parallelSearchToolFactory(config);
var perplexitySearchInputSchema = lazySchema$1(
  () => zodSchema$1(
    object$1({
      query: union([string(), array$1(string())]).describe(
        "Search query (string) or multiple queries (array of up to 5 strings). Multi-query searches return combined results from all queries."
      ),
      max_results: number().optional().describe(
        "Maximum number of search results to return (1-20, default: 10)"
      ),
      max_tokens_per_page: number().optional().describe(
        "Maximum number of tokens to extract per search result page (256-2048, default: 2048)"
      ),
      max_tokens: number().optional().describe(
        "Maximum total tokens across all search results (default: 25000, max: 1000000)"
      ),
      country: string().optional().describe(
        "Two-letter ISO 3166-1 alpha-2 country code for regional search results (e.g., 'US', 'GB', 'FR')"
      ),
      search_domain_filter: array$1(string()).optional().describe(
        "List of domains to include or exclude from search results (max 20). To include: ['nature.com', 'science.org']. To exclude: ['-example.com', '-spam.net']"
      ),
      search_language_filter: array$1(string()).optional().describe(
        "List of ISO 639-1 language codes to filter results (max 10, lowercase). Examples: ['en', 'fr', 'de']"
      ),
      search_after_date: string().optional().describe(
        "Include only results published after this date. Format: 'MM/DD/YYYY' (e.g., '3/1/2025'). Cannot be used with search_recency_filter."
      ),
      search_before_date: string().optional().describe(
        "Include only results published before this date. Format: 'MM/DD/YYYY' (e.g., '3/15/2025'). Cannot be used with search_recency_filter."
      ),
      last_updated_after_filter: string().optional().describe(
        "Include only results last updated after this date. Format: 'MM/DD/YYYY' (e.g., '3/1/2025'). Cannot be used with search_recency_filter."
      ),
      last_updated_before_filter: string().optional().describe(
        "Include only results last updated before this date. Format: 'MM/DD/YYYY' (e.g., '3/15/2025'). Cannot be used with search_recency_filter."
      ),
      search_recency_filter: _enum(["day", "week", "month", "year"]).optional().describe(
        "Filter results by relative time period. Cannot be used with search_after_date or search_before_date."
      )
    })
  )
);
var perplexitySearchOutputSchema = lazySchema$1(
  () => zodSchema$1(
    union([
      // Success response
      object$1({
        results: array$1(
          object$1({
            title: string(),
            url: string(),
            snippet: string(),
            date: string().optional(),
            lastUpdated: string().optional()
          })
        ),
        id: string()
      }),
      // Error response
      object$1({
        error: _enum([
          "api_error",
          "rate_limit",
          "timeout",
          "invalid_input",
          "unknown"
        ]),
        statusCode: number().optional(),
        message: string()
      })
    ])
  )
);
var perplexitySearchToolFactory = createProviderToolFactoryWithOutputSchema$1({
  id: "gateway.perplexity_search",
  inputSchema: perplexitySearchInputSchema,
  outputSchema: perplexitySearchOutputSchema
});
var perplexitySearch = (config = {}) => perplexitySearchToolFactory(config);
var gatewayTools = {
  /**
   * Search the web using Parallel AI's Search API for LLM-optimized excerpts.
   *
   * Takes a natural language objective and returns relevant excerpts,
   * replacing multiple keyword searches with a single call for broad
   * or complex queries. Supports different search types for depth vs
   * breadth tradeoffs.
   */
  parallelSearch,
  /**
   * Search the web using Perplexity's Search API for real-time information,
   * news, research papers, and articles.
   *
   * Provides ranked search results with advanced filtering options including
   * domain, language, date range, and recency filters.
   */
  perplexitySearch
};
async function getVercelRequestId() {
  var _a92;
  return (_a92 = indexBrowserExports.getContext().headers) == null ? void 0 : _a92["x-vercel-id"];
}
var VERSION$2 = "3.0.66";
var AI_GATEWAY_PROTOCOL_VERSION = "0.0.1";
function createGatewayProvider(options = {}) {
  var _a92, _b92;
  let pendingMetadata = null;
  let metadataCache = null;
  const cacheRefreshMillis = (_a92 = options.metadataCacheRefreshMillis) != null ? _a92 : 1e3 * 60 * 5;
  let lastFetchTime = 0;
  const baseURL = (_b92 = withoutTrailingSlash$1(options.baseURL)) != null ? _b92 : "https://ai-gateway.vercel.sh/v3/ai";
  const getHeaders = async () => {
    try {
      const auth = await getGatewayAuthToken(options);
      return withUserAgentSuffix$1(
        {
          Authorization: `Bearer ${auth.token}`,
          "ai-gateway-protocol-version": AI_GATEWAY_PROTOCOL_VERSION,
          [GATEWAY_AUTH_METHOD_HEADER]: auth.authMethod,
          ...options.headers
        },
        `ai-sdk/gateway/${VERSION$2}`
      );
    } catch (error) {
      throw GatewayAuthenticationError.createContextualError({
        apiKeyProvided: false,
        oidcTokenProvided: false,
        statusCode: 401,
        cause: error
      });
    }
  };
  const createO11yHeaders = () => {
    const deploymentId = loadOptionalSetting$1({
      settingValue: void 0,
      environmentVariableName: "VERCEL_DEPLOYMENT_ID"
    });
    const environment = loadOptionalSetting$1({
      settingValue: void 0,
      environmentVariableName: "VERCEL_ENV"
    });
    const region = loadOptionalSetting$1({
      settingValue: void 0,
      environmentVariableName: "VERCEL_REGION"
    });
    const projectId = loadOptionalSetting$1({
      settingValue: void 0,
      environmentVariableName: "VERCEL_PROJECT_ID"
    });
    return async () => {
      const requestId = await getVercelRequestId();
      return {
        ...deploymentId && { "ai-o11y-deployment-id": deploymentId },
        ...environment && { "ai-o11y-environment": environment },
        ...region && { "ai-o11y-region": region },
        ...requestId && { "ai-o11y-request-id": requestId },
        ...projectId && { "ai-o11y-project-id": projectId }
      };
    };
  };
  const createLanguageModel = (modelId) => {
    return new GatewayLanguageModel(modelId, {
      provider: "gateway",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: createO11yHeaders()
    });
  };
  const getAvailableModels = async () => {
    var _a102, _b102, _c;
    const now2 = (_c = (_b102 = (_a102 = options._internal) == null ? void 0 : _a102.currentDate) == null ? void 0 : _b102.call(_a102).getTime()) != null ? _c : Date.now();
    if (!pendingMetadata || now2 - lastFetchTime > cacheRefreshMillis) {
      lastFetchTime = now2;
      pendingMetadata = new GatewayFetchMetadata({
        baseURL,
        headers: getHeaders,
        fetch: options.fetch
      }).getAvailableModels().then((metadata) => {
        metadataCache = metadata;
        return metadata;
      }).catch(async (error) => {
        throw await asGatewayError(
          error,
          await parseAuthMethod(await getHeaders())
        );
      });
    }
    return metadataCache ? Promise.resolve(metadataCache) : pendingMetadata;
  };
  const getCredits = async () => {
    return new GatewayFetchMetadata({
      baseURL,
      headers: getHeaders,
      fetch: options.fetch
    }).getCredits().catch(async (error) => {
      throw await asGatewayError(
        error,
        await parseAuthMethod(await getHeaders())
      );
    });
  };
  const provider = function(modelId) {
    if (new.target) {
      throw new Error(
        "The Gateway Provider model function cannot be called with the new keyword."
      );
    }
    return createLanguageModel(modelId);
  };
  provider.specificationVersion = "v3";
  provider.getAvailableModels = getAvailableModels;
  provider.getCredits = getCredits;
  provider.imageModel = (modelId) => {
    return new GatewayImageModel(modelId, {
      provider: "gateway",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: createO11yHeaders()
    });
  };
  provider.languageModel = createLanguageModel;
  const createEmbeddingModel = (modelId) => {
    return new GatewayEmbeddingModel(modelId, {
      provider: "gateway",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: createO11yHeaders()
    });
  };
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.videoModel = (modelId) => {
    return new GatewayVideoModel(modelId, {
      provider: "gateway",
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      o11yHeaders: createO11yHeaders()
    });
  };
  provider.chat = provider.languageModel;
  provider.embedding = provider.embeddingModel;
  provider.image = provider.imageModel;
  provider.video = provider.videoModel;
  provider.tools = gatewayTools;
  return provider;
}
var gateway = createGatewayProvider();
async function getGatewayAuthToken(options) {
  const apiKey = loadOptionalSetting$1({
    settingValue: options.apiKey,
    environmentVariableName: "AI_GATEWAY_API_KEY"
  });
  if (apiKey) {
    return {
      token: apiKey,
      authMethod: "api-key"
    };
  }
  const oidcToken = await indexBrowserExports.getVercelOidcToken();
  return {
    token: oidcToken,
    authMethod: "oidc"
  };
}
var _globalThis = typeof globalThis === "object" ? globalThis : typeof self === "object" ? self : typeof window === "object" ? window : typeof global === "object" ? global : {};
var VERSION$1 = "1.9.0";
var re = /^(\d+)\.(\d+)\.(\d+)(-(.+))?$/;
function _makeCompatibilityCheck(ownVersion) {
  var acceptedVersions = /* @__PURE__ */ new Set([ownVersion]);
  var rejectedVersions = /* @__PURE__ */ new Set();
  var myVersionMatch = ownVersion.match(re);
  if (!myVersionMatch) {
    return function() {
      return false;
    };
  }
  var ownVersionParsed = {
    major: +myVersionMatch[1],
    minor: +myVersionMatch[2],
    patch: +myVersionMatch[3],
    prerelease: myVersionMatch[4]
  };
  if (ownVersionParsed.prerelease != null) {
    return function isExactmatch(globalVersion) {
      return globalVersion === ownVersion;
    };
  }
  function _reject(v) {
    rejectedVersions.add(v);
    return false;
  }
  function _accept(v) {
    acceptedVersions.add(v);
    return true;
  }
  return function isCompatible2(globalVersion) {
    if (acceptedVersions.has(globalVersion)) {
      return true;
    }
    if (rejectedVersions.has(globalVersion)) {
      return false;
    }
    var globalVersionMatch = globalVersion.match(re);
    if (!globalVersionMatch) {
      return _reject(globalVersion);
    }
    var globalVersionParsed = {
      major: +globalVersionMatch[1],
      minor: +globalVersionMatch[2],
      patch: +globalVersionMatch[3],
      prerelease: globalVersionMatch[4]
    };
    if (globalVersionParsed.prerelease != null) {
      return _reject(globalVersion);
    }
    if (ownVersionParsed.major !== globalVersionParsed.major) {
      return _reject(globalVersion);
    }
    if (ownVersionParsed.major === 0) {
      if (ownVersionParsed.minor === globalVersionParsed.minor && ownVersionParsed.patch <= globalVersionParsed.patch) {
        return _accept(globalVersion);
      }
      return _reject(globalVersion);
    }
    if (ownVersionParsed.minor <= globalVersionParsed.minor) {
      return _accept(globalVersion);
    }
    return _reject(globalVersion);
  };
}
var isCompatible = _makeCompatibilityCheck(VERSION$1);
var major = VERSION$1.split(".")[0];
var GLOBAL_OPENTELEMETRY_API_KEY = Symbol.for("opentelemetry.js.api." + major);
var _global = _globalThis;
function registerGlobal(type, instance, diag, allowOverride) {
  var _a21;
  if (allowOverride === void 0) {
    allowOverride = false;
  }
  var api = _global[GLOBAL_OPENTELEMETRY_API_KEY] = (_a21 = _global[GLOBAL_OPENTELEMETRY_API_KEY]) !== null && _a21 !== void 0 ? _a21 : {
    version: VERSION$1
  };
  if (!allowOverride && api[type]) {
    var err = new Error("@opentelemetry/api: Attempted duplicate registration of API: " + type);
    diag.error(err.stack || err.message);
    return false;
  }
  if (api.version !== VERSION$1) {
    var err = new Error("@opentelemetry/api: Registration of version v" + api.version + " for " + type + " does not match previously registered API v" + VERSION$1);
    diag.error(err.stack || err.message);
    return false;
  }
  api[type] = instance;
  diag.debug("@opentelemetry/api: Registered a global for " + type + " v" + VERSION$1 + ".");
  return true;
}
function getGlobal(type) {
  var _a21, _b15;
  var globalVersion = (_a21 = _global[GLOBAL_OPENTELEMETRY_API_KEY]) === null || _a21 === void 0 ? void 0 : _a21.version;
  if (!globalVersion || !isCompatible(globalVersion)) {
    return;
  }
  return (_b15 = _global[GLOBAL_OPENTELEMETRY_API_KEY]) === null || _b15 === void 0 ? void 0 : _b15[type];
}
function unregisterGlobal(type, diag) {
  diag.debug("@opentelemetry/api: Unregistering a global for " + type + " v" + VERSION$1 + ".");
  var api = _global[GLOBAL_OPENTELEMETRY_API_KEY];
  if (api) {
    delete api[type];
  }
}
var __read$4 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray$3 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var DiagComponentLogger = (
  /** @class */
  (function() {
    function DiagComponentLogger2(props) {
      this._namespace = props.namespace || "DiagComponentLogger";
    }
    DiagComponentLogger2.prototype.debug = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("debug", this._namespace, args);
    };
    DiagComponentLogger2.prototype.error = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("error", this._namespace, args);
    };
    DiagComponentLogger2.prototype.info = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("info", this._namespace, args);
    };
    DiagComponentLogger2.prototype.warn = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("warn", this._namespace, args);
    };
    DiagComponentLogger2.prototype.verbose = function() {
      var args = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        args[_i] = arguments[_i];
      }
      return logProxy("verbose", this._namespace, args);
    };
    return DiagComponentLogger2;
  })()
);
function logProxy(funcName, namespace, args) {
  var logger = getGlobal("diag");
  if (!logger) {
    return;
  }
  args.unshift(namespace);
  return logger[funcName].apply(logger, __spreadArray$3([], __read$4(args), false));
}
var DiagLogLevel;
(function(DiagLogLevel2) {
  DiagLogLevel2[DiagLogLevel2["NONE"] = 0] = "NONE";
  DiagLogLevel2[DiagLogLevel2["ERROR"] = 30] = "ERROR";
  DiagLogLevel2[DiagLogLevel2["WARN"] = 50] = "WARN";
  DiagLogLevel2[DiagLogLevel2["INFO"] = 60] = "INFO";
  DiagLogLevel2[DiagLogLevel2["DEBUG"] = 70] = "DEBUG";
  DiagLogLevel2[DiagLogLevel2["VERBOSE"] = 80] = "VERBOSE";
  DiagLogLevel2[DiagLogLevel2["ALL"] = 9999] = "ALL";
})(DiagLogLevel || (DiagLogLevel = {}));
function createLogLevelDiagLogger(maxLevel, logger) {
  if (maxLevel < DiagLogLevel.NONE) {
    maxLevel = DiagLogLevel.NONE;
  } else if (maxLevel > DiagLogLevel.ALL) {
    maxLevel = DiagLogLevel.ALL;
  }
  logger = logger || {};
  function _filterFunc(funcName, theLevel) {
    var theFunc = logger[funcName];
    if (typeof theFunc === "function" && maxLevel >= theLevel) {
      return theFunc.bind(logger);
    }
    return function() {
    };
  }
  return {
    error: _filterFunc("error", DiagLogLevel.ERROR),
    warn: _filterFunc("warn", DiagLogLevel.WARN),
    info: _filterFunc("info", DiagLogLevel.INFO),
    debug: _filterFunc("debug", DiagLogLevel.DEBUG),
    verbose: _filterFunc("verbose", DiagLogLevel.VERBOSE)
  };
}
var __read$3 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray$2 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var API_NAME$4 = "diag";
var DiagAPI = (
  /** @class */
  (function() {
    function DiagAPI2() {
      function _logProxy(funcName) {
        return function() {
          var args = [];
          for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
          }
          var logger = getGlobal("diag");
          if (!logger)
            return;
          return logger[funcName].apply(logger, __spreadArray$2([], __read$3(args), false));
        };
      }
      var self2 = this;
      var setLogger = function(logger, optionsOrLogLevel) {
        var _a21, _b15, _c;
        if (optionsOrLogLevel === void 0) {
          optionsOrLogLevel = { logLevel: DiagLogLevel.INFO };
        }
        if (logger === self2) {
          var err = new Error("Cannot use diag as the logger for itself. Please use a DiagLogger implementation like ConsoleDiagLogger or a custom implementation");
          self2.error((_a21 = err.stack) !== null && _a21 !== void 0 ? _a21 : err.message);
          return false;
        }
        if (typeof optionsOrLogLevel === "number") {
          optionsOrLogLevel = {
            logLevel: optionsOrLogLevel
          };
        }
        var oldLogger = getGlobal("diag");
        var newLogger = createLogLevelDiagLogger((_b15 = optionsOrLogLevel.logLevel) !== null && _b15 !== void 0 ? _b15 : DiagLogLevel.INFO, logger);
        if (oldLogger && !optionsOrLogLevel.suppressOverrideMessage) {
          var stack = (_c = new Error().stack) !== null && _c !== void 0 ? _c : "<failed to generate stacktrace>";
          oldLogger.warn("Current logger will be overwritten from " + stack);
          newLogger.warn("Current logger will overwrite one already registered from " + stack);
        }
        return registerGlobal("diag", newLogger, self2, true);
      };
      self2.setLogger = setLogger;
      self2.disable = function() {
        unregisterGlobal(API_NAME$4, self2);
      };
      self2.createComponentLogger = function(options) {
        return new DiagComponentLogger(options);
      };
      self2.verbose = _logProxy("verbose");
      self2.debug = _logProxy("debug");
      self2.info = _logProxy("info");
      self2.warn = _logProxy("warn");
      self2.error = _logProxy("error");
    }
    DiagAPI2.instance = function() {
      if (!this._instance) {
        this._instance = new DiagAPI2();
      }
      return this._instance;
    };
    return DiagAPI2;
  })()
);
var __read$2 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __values = function(o) {
  var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
  if (m) return m.call(o);
  if (o && typeof o.length === "number") return {
    next: function() {
      if (o && i >= o.length) o = void 0;
      return { value: o && o[i++], done: !o };
    }
  };
  throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var BaggageImpl = (
  /** @class */
  (function() {
    function BaggageImpl2(entries) {
      this._entries = entries ? new Map(entries) : /* @__PURE__ */ new Map();
    }
    BaggageImpl2.prototype.getEntry = function(key) {
      var entry = this._entries.get(key);
      if (!entry) {
        return void 0;
      }
      return Object.assign({}, entry);
    };
    BaggageImpl2.prototype.getAllEntries = function() {
      return Array.from(this._entries.entries()).map(function(_a21) {
        var _b15 = __read$2(_a21, 2), k = _b15[0], v = _b15[1];
        return [k, v];
      });
    };
    BaggageImpl2.prototype.setEntry = function(key, entry) {
      var newBaggage = new BaggageImpl2(this._entries);
      newBaggage._entries.set(key, entry);
      return newBaggage;
    };
    BaggageImpl2.prototype.removeEntry = function(key) {
      var newBaggage = new BaggageImpl2(this._entries);
      newBaggage._entries.delete(key);
      return newBaggage;
    };
    BaggageImpl2.prototype.removeEntries = function() {
      var e_1, _a21;
      var keys = [];
      for (var _i = 0; _i < arguments.length; _i++) {
        keys[_i] = arguments[_i];
      }
      var newBaggage = new BaggageImpl2(this._entries);
      try {
        for (var keys_1 = __values(keys), keys_1_1 = keys_1.next(); !keys_1_1.done; keys_1_1 = keys_1.next()) {
          var key = keys_1_1.value;
          newBaggage._entries.delete(key);
        }
      } catch (e_1_1) {
        e_1 = { error: e_1_1 };
      } finally {
        try {
          if (keys_1_1 && !keys_1_1.done && (_a21 = keys_1.return)) _a21.call(keys_1);
        } finally {
          if (e_1) throw e_1.error;
        }
      }
      return newBaggage;
    };
    BaggageImpl2.prototype.clear = function() {
      return new BaggageImpl2();
    };
    return BaggageImpl2;
  })()
);
DiagAPI.instance();
function createBaggage(entries) {
  if (entries === void 0) {
    entries = {};
  }
  return new BaggageImpl(new Map(Object.entries(entries)));
}
function createContextKey(description) {
  return Symbol.for(description);
}
var BaseContext = (
  /** @class */
  /* @__PURE__ */ (function() {
    function BaseContext2(parentContext) {
      var self2 = this;
      self2._currentContext = parentContext ? new Map(parentContext) : /* @__PURE__ */ new Map();
      self2.getValue = function(key) {
        return self2._currentContext.get(key);
      };
      self2.setValue = function(key, value) {
        var context2 = new BaseContext2(self2._currentContext);
        context2._currentContext.set(key, value);
        return context2;
      };
      self2.deleteValue = function(key) {
        var context2 = new BaseContext2(self2._currentContext);
        context2._currentContext.delete(key);
        return context2;
      };
    }
    return BaseContext2;
  })()
);
var ROOT_CONTEXT = new BaseContext();
var __extends = /* @__PURE__ */ (function() {
  var extendStatics = function(d, b) {
    extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
      d2.__proto__ = b2;
    } || function(d2, b2) {
      for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
    };
    return extendStatics(d, b);
  };
  return function(d, b) {
    if (typeof b !== "function" && b !== null)
      throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
    extendStatics(d, b);
    function __() {
      this.constructor = d;
    }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
  };
})();
var NoopMeter = (
  /** @class */
  (function() {
    function NoopMeter2() {
    }
    NoopMeter2.prototype.createGauge = function(_name, _options) {
      return NOOP_GAUGE_METRIC;
    };
    NoopMeter2.prototype.createHistogram = function(_name, _options) {
      return NOOP_HISTOGRAM_METRIC;
    };
    NoopMeter2.prototype.createCounter = function(_name, _options) {
      return NOOP_COUNTER_METRIC;
    };
    NoopMeter2.prototype.createUpDownCounter = function(_name, _options) {
      return NOOP_UP_DOWN_COUNTER_METRIC;
    };
    NoopMeter2.prototype.createObservableGauge = function(_name, _options) {
      return NOOP_OBSERVABLE_GAUGE_METRIC;
    };
    NoopMeter2.prototype.createObservableCounter = function(_name, _options) {
      return NOOP_OBSERVABLE_COUNTER_METRIC;
    };
    NoopMeter2.prototype.createObservableUpDownCounter = function(_name, _options) {
      return NOOP_OBSERVABLE_UP_DOWN_COUNTER_METRIC;
    };
    NoopMeter2.prototype.addBatchObservableCallback = function(_callback, _observables) {
    };
    NoopMeter2.prototype.removeBatchObservableCallback = function(_callback) {
    };
    return NoopMeter2;
  })()
);
var NoopMetric = (
  /** @class */
  /* @__PURE__ */ (function() {
    function NoopMetric2() {
    }
    return NoopMetric2;
  })()
);
var NoopCounterMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopCounterMetric2, _super);
    function NoopCounterMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    NoopCounterMetric2.prototype.add = function(_value, _attributes) {
    };
    return NoopCounterMetric2;
  })(NoopMetric)
);
var NoopUpDownCounterMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopUpDownCounterMetric2, _super);
    function NoopUpDownCounterMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    NoopUpDownCounterMetric2.prototype.add = function(_value, _attributes) {
    };
    return NoopUpDownCounterMetric2;
  })(NoopMetric)
);
var NoopGaugeMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopGaugeMetric2, _super);
    function NoopGaugeMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    NoopGaugeMetric2.prototype.record = function(_value, _attributes) {
    };
    return NoopGaugeMetric2;
  })(NoopMetric)
);
var NoopHistogramMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopHistogramMetric2, _super);
    function NoopHistogramMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    NoopHistogramMetric2.prototype.record = function(_value, _attributes) {
    };
    return NoopHistogramMetric2;
  })(NoopMetric)
);
var NoopObservableMetric = (
  /** @class */
  (function() {
    function NoopObservableMetric2() {
    }
    NoopObservableMetric2.prototype.addCallback = function(_callback) {
    };
    NoopObservableMetric2.prototype.removeCallback = function(_callback) {
    };
    return NoopObservableMetric2;
  })()
);
var NoopObservableCounterMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopObservableCounterMetric2, _super);
    function NoopObservableCounterMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    return NoopObservableCounterMetric2;
  })(NoopObservableMetric)
);
var NoopObservableGaugeMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopObservableGaugeMetric2, _super);
    function NoopObservableGaugeMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    return NoopObservableGaugeMetric2;
  })(NoopObservableMetric)
);
var NoopObservableUpDownCounterMetric = (
  /** @class */
  (function(_super) {
    __extends(NoopObservableUpDownCounterMetric2, _super);
    function NoopObservableUpDownCounterMetric2() {
      return _super !== null && _super.apply(this, arguments) || this;
    }
    return NoopObservableUpDownCounterMetric2;
  })(NoopObservableMetric)
);
var NOOP_METER = new NoopMeter();
var NOOP_COUNTER_METRIC = new NoopCounterMetric();
var NOOP_GAUGE_METRIC = new NoopGaugeMetric();
var NOOP_HISTOGRAM_METRIC = new NoopHistogramMetric();
var NOOP_UP_DOWN_COUNTER_METRIC = new NoopUpDownCounterMetric();
var NOOP_OBSERVABLE_COUNTER_METRIC = new NoopObservableCounterMetric();
var NOOP_OBSERVABLE_GAUGE_METRIC = new NoopObservableGaugeMetric();
var NOOP_OBSERVABLE_UP_DOWN_COUNTER_METRIC = new NoopObservableUpDownCounterMetric();
var defaultTextMapGetter = {
  get: function(carrier, key) {
    if (carrier == null) {
      return void 0;
    }
    return carrier[key];
  },
  keys: function(carrier) {
    if (carrier == null) {
      return [];
    }
    return Object.keys(carrier);
  }
};
var defaultTextMapSetter = {
  set: function(carrier, key, value) {
    if (carrier == null) {
      return;
    }
    carrier[key] = value;
  }
};
var __read$1 = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray$1 = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var NoopContextManager = (
  /** @class */
  (function() {
    function NoopContextManager2() {
    }
    NoopContextManager2.prototype.active = function() {
      return ROOT_CONTEXT;
    };
    NoopContextManager2.prototype.with = function(_context, fn, thisArg) {
      var args = [];
      for (var _i = 3; _i < arguments.length; _i++) {
        args[_i - 3] = arguments[_i];
      }
      return fn.call.apply(fn, __spreadArray$1([thisArg], __read$1(args), false));
    };
    NoopContextManager2.prototype.bind = function(_context, target) {
      return target;
    };
    NoopContextManager2.prototype.enable = function() {
      return this;
    };
    NoopContextManager2.prototype.disable = function() {
      return this;
    };
    return NoopContextManager2;
  })()
);
var __read = function(o, n) {
  var m = typeof Symbol === "function" && o[Symbol.iterator];
  if (!m) return o;
  var i = m.call(o), r, ar = [], e;
  try {
    while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
  } catch (error) {
    e = { error };
  } finally {
    try {
      if (r && !r.done && (m = i["return"])) m.call(i);
    } finally {
      if (e) throw e.error;
    }
  }
  return ar;
};
var __spreadArray = function(to, from, pack) {
  if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
    if (ar || !(i in from)) {
      if (!ar) ar = Array.prototype.slice.call(from, 0, i);
      ar[i] = from[i];
    }
  }
  return to.concat(ar || Array.prototype.slice.call(from));
};
var API_NAME$3 = "context";
var NOOP_CONTEXT_MANAGER = new NoopContextManager();
var ContextAPI = (
  /** @class */
  (function() {
    function ContextAPI2() {
    }
    ContextAPI2.getInstance = function() {
      if (!this._instance) {
        this._instance = new ContextAPI2();
      }
      return this._instance;
    };
    ContextAPI2.prototype.setGlobalContextManager = function(contextManager) {
      return registerGlobal(API_NAME$3, contextManager, DiagAPI.instance());
    };
    ContextAPI2.prototype.active = function() {
      return this._getContextManager().active();
    };
    ContextAPI2.prototype.with = function(context2, fn, thisArg) {
      var _a21;
      var args = [];
      for (var _i = 3; _i < arguments.length; _i++) {
        args[_i - 3] = arguments[_i];
      }
      return (_a21 = this._getContextManager()).with.apply(_a21, __spreadArray([context2, fn, thisArg], __read(args), false));
    };
    ContextAPI2.prototype.bind = function(context2, target) {
      return this._getContextManager().bind(context2, target);
    };
    ContextAPI2.prototype._getContextManager = function() {
      return getGlobal(API_NAME$3) || NOOP_CONTEXT_MANAGER;
    };
    ContextAPI2.prototype.disable = function() {
      this._getContextManager().disable();
      unregisterGlobal(API_NAME$3, DiagAPI.instance());
    };
    return ContextAPI2;
  })()
);
var TraceFlags;
(function(TraceFlags2) {
  TraceFlags2[TraceFlags2["NONE"] = 0] = "NONE";
  TraceFlags2[TraceFlags2["SAMPLED"] = 1] = "SAMPLED";
})(TraceFlags || (TraceFlags = {}));
var INVALID_SPANID = "0000000000000000";
var INVALID_TRACEID = "00000000000000000000000000000000";
var INVALID_SPAN_CONTEXT = {
  traceId: INVALID_TRACEID,
  spanId: INVALID_SPANID,
  traceFlags: TraceFlags.NONE
};
var NonRecordingSpan = (
  /** @class */
  (function() {
    function NonRecordingSpan2(_spanContext) {
      if (_spanContext === void 0) {
        _spanContext = INVALID_SPAN_CONTEXT;
      }
      this._spanContext = _spanContext;
    }
    NonRecordingSpan2.prototype.spanContext = function() {
      return this._spanContext;
    };
    NonRecordingSpan2.prototype.setAttribute = function(_key, _value) {
      return this;
    };
    NonRecordingSpan2.prototype.setAttributes = function(_attributes) {
      return this;
    };
    NonRecordingSpan2.prototype.addEvent = function(_name, _attributes) {
      return this;
    };
    NonRecordingSpan2.prototype.addLink = function(_link) {
      return this;
    };
    NonRecordingSpan2.prototype.addLinks = function(_links) {
      return this;
    };
    NonRecordingSpan2.prototype.setStatus = function(_status) {
      return this;
    };
    NonRecordingSpan2.prototype.updateName = function(_name) {
      return this;
    };
    NonRecordingSpan2.prototype.end = function(_endTime) {
    };
    NonRecordingSpan2.prototype.isRecording = function() {
      return false;
    };
    NonRecordingSpan2.prototype.recordException = function(_exception, _time) {
    };
    return NonRecordingSpan2;
  })()
);
var SPAN_KEY = createContextKey("OpenTelemetry Context Key SPAN");
function getSpan(context2) {
  return context2.getValue(SPAN_KEY) || void 0;
}
function getActiveSpan() {
  return getSpan(ContextAPI.getInstance().active());
}
function setSpan(context2, span) {
  return context2.setValue(SPAN_KEY, span);
}
function deleteSpan(context2) {
  return context2.deleteValue(SPAN_KEY);
}
function setSpanContext(context2, spanContext) {
  return setSpan(context2, new NonRecordingSpan(spanContext));
}
function getSpanContext(context2) {
  var _a21;
  return (_a21 = getSpan(context2)) === null || _a21 === void 0 ? void 0 : _a21.spanContext();
}
var VALID_TRACEID_REGEX = /^([0-9a-f]{32})$/i;
var VALID_SPANID_REGEX = /^[0-9a-f]{16}$/i;
function isValidTraceId(traceId) {
  return VALID_TRACEID_REGEX.test(traceId) && traceId !== INVALID_TRACEID;
}
function isValidSpanId(spanId) {
  return VALID_SPANID_REGEX.test(spanId) && spanId !== INVALID_SPANID;
}
function isSpanContextValid(spanContext) {
  return isValidTraceId(spanContext.traceId) && isValidSpanId(spanContext.spanId);
}
function wrapSpanContext(spanContext) {
  return new NonRecordingSpan(spanContext);
}
var contextApi = ContextAPI.getInstance();
var NoopTracer = (
  /** @class */
  (function() {
    function NoopTracer2() {
    }
    NoopTracer2.prototype.startSpan = function(name21, options, context2) {
      if (context2 === void 0) {
        context2 = contextApi.active();
      }
      var root = Boolean(options === null || options === void 0 ? void 0 : options.root);
      if (root) {
        return new NonRecordingSpan();
      }
      var parentFromContext = context2 && getSpanContext(context2);
      if (isSpanContext(parentFromContext) && isSpanContextValid(parentFromContext)) {
        return new NonRecordingSpan(parentFromContext);
      } else {
        return new NonRecordingSpan();
      }
    };
    NoopTracer2.prototype.startActiveSpan = function(name21, arg2, arg3, arg4) {
      var opts;
      var ctx;
      var fn;
      if (arguments.length < 2) {
        return;
      } else if (arguments.length === 2) {
        fn = arg2;
      } else if (arguments.length === 3) {
        opts = arg2;
        fn = arg3;
      } else {
        opts = arg2;
        ctx = arg3;
        fn = arg4;
      }
      var parentContext = ctx !== null && ctx !== void 0 ? ctx : contextApi.active();
      var span = this.startSpan(name21, opts, parentContext);
      var contextWithSpanSet = setSpan(parentContext, span);
      return contextApi.with(contextWithSpanSet, fn, void 0, span);
    };
    return NoopTracer2;
  })()
);
function isSpanContext(spanContext) {
  return typeof spanContext === "object" && typeof spanContext["spanId"] === "string" && typeof spanContext["traceId"] === "string" && typeof spanContext["traceFlags"] === "number";
}
var NOOP_TRACER = new NoopTracer();
var ProxyTracer = (
  /** @class */
  (function() {
    function ProxyTracer2(_provider, name21, version, options) {
      this._provider = _provider;
      this.name = name21;
      this.version = version;
      this.options = options;
    }
    ProxyTracer2.prototype.startSpan = function(name21, options, context2) {
      return this._getTracer().startSpan(name21, options, context2);
    };
    ProxyTracer2.prototype.startActiveSpan = function(_name, _options, _context, _fn) {
      var tracer = this._getTracer();
      return Reflect.apply(tracer.startActiveSpan, tracer, arguments);
    };
    ProxyTracer2.prototype._getTracer = function() {
      if (this._delegate) {
        return this._delegate;
      }
      var tracer = this._provider.getDelegateTracer(this.name, this.version, this.options);
      if (!tracer) {
        return NOOP_TRACER;
      }
      this._delegate = tracer;
      return this._delegate;
    };
    return ProxyTracer2;
  })()
);
var NoopTracerProvider = (
  /** @class */
  (function() {
    function NoopTracerProvider2() {
    }
    NoopTracerProvider2.prototype.getTracer = function(_name, _version, _options) {
      return new NoopTracer();
    };
    return NoopTracerProvider2;
  })()
);
var NOOP_TRACER_PROVIDER = new NoopTracerProvider();
var ProxyTracerProvider = (
  /** @class */
  (function() {
    function ProxyTracerProvider2() {
    }
    ProxyTracerProvider2.prototype.getTracer = function(name21, version, options) {
      var _a21;
      return (_a21 = this.getDelegateTracer(name21, version, options)) !== null && _a21 !== void 0 ? _a21 : new ProxyTracer(this, name21, version, options);
    };
    ProxyTracerProvider2.prototype.getDelegate = function() {
      var _a21;
      return (_a21 = this._delegate) !== null && _a21 !== void 0 ? _a21 : NOOP_TRACER_PROVIDER;
    };
    ProxyTracerProvider2.prototype.setDelegate = function(delegate) {
      this._delegate = delegate;
    };
    ProxyTracerProvider2.prototype.getDelegateTracer = function(name21, version, options) {
      var _a21;
      return (_a21 = this._delegate) === null || _a21 === void 0 ? void 0 : _a21.getTracer(name21, version, options);
    };
    return ProxyTracerProvider2;
  })()
);
var SpanStatusCode;
(function(SpanStatusCode2) {
  SpanStatusCode2[SpanStatusCode2["UNSET"] = 0] = "UNSET";
  SpanStatusCode2[SpanStatusCode2["OK"] = 1] = "OK";
  SpanStatusCode2[SpanStatusCode2["ERROR"] = 2] = "ERROR";
})(SpanStatusCode || (SpanStatusCode = {}));
var context = ContextAPI.getInstance();
DiagAPI.instance();
var NoopMeterProvider = (
  /** @class */
  (function() {
    function NoopMeterProvider2() {
    }
    NoopMeterProvider2.prototype.getMeter = function(_name, _version, _options) {
      return NOOP_METER;
    };
    return NoopMeterProvider2;
  })()
);
var NOOP_METER_PROVIDER = new NoopMeterProvider();
var API_NAME$2 = "metrics";
var MetricsAPI = (
  /** @class */
  (function() {
    function MetricsAPI2() {
    }
    MetricsAPI2.getInstance = function() {
      if (!this._instance) {
        this._instance = new MetricsAPI2();
      }
      return this._instance;
    };
    MetricsAPI2.prototype.setGlobalMeterProvider = function(provider) {
      return registerGlobal(API_NAME$2, provider, DiagAPI.instance());
    };
    MetricsAPI2.prototype.getMeterProvider = function() {
      return getGlobal(API_NAME$2) || NOOP_METER_PROVIDER;
    };
    MetricsAPI2.prototype.getMeter = function(name21, version, options) {
      return this.getMeterProvider().getMeter(name21, version, options);
    };
    MetricsAPI2.prototype.disable = function() {
      unregisterGlobal(API_NAME$2, DiagAPI.instance());
    };
    return MetricsAPI2;
  })()
);
MetricsAPI.getInstance();
var NoopTextMapPropagator = (
  /** @class */
  (function() {
    function NoopTextMapPropagator2() {
    }
    NoopTextMapPropagator2.prototype.inject = function(_context, _carrier) {
    };
    NoopTextMapPropagator2.prototype.extract = function(context2, _carrier) {
      return context2;
    };
    NoopTextMapPropagator2.prototype.fields = function() {
      return [];
    };
    return NoopTextMapPropagator2;
  })()
);
var BAGGAGE_KEY = createContextKey("OpenTelemetry Baggage Key");
function getBaggage(context2) {
  return context2.getValue(BAGGAGE_KEY) || void 0;
}
function getActiveBaggage() {
  return getBaggage(ContextAPI.getInstance().active());
}
function setBaggage(context2, baggage) {
  return context2.setValue(BAGGAGE_KEY, baggage);
}
function deleteBaggage(context2) {
  return context2.deleteValue(BAGGAGE_KEY);
}
var API_NAME$1 = "propagation";
var NOOP_TEXT_MAP_PROPAGATOR = new NoopTextMapPropagator();
var PropagationAPI = (
  /** @class */
  (function() {
    function PropagationAPI2() {
      this.createBaggage = createBaggage;
      this.getBaggage = getBaggage;
      this.getActiveBaggage = getActiveBaggage;
      this.setBaggage = setBaggage;
      this.deleteBaggage = deleteBaggage;
    }
    PropagationAPI2.getInstance = function() {
      if (!this._instance) {
        this._instance = new PropagationAPI2();
      }
      return this._instance;
    };
    PropagationAPI2.prototype.setGlobalPropagator = function(propagator) {
      return registerGlobal(API_NAME$1, propagator, DiagAPI.instance());
    };
    PropagationAPI2.prototype.inject = function(context2, carrier, setter) {
      if (setter === void 0) {
        setter = defaultTextMapSetter;
      }
      return this._getGlobalPropagator().inject(context2, carrier, setter);
    };
    PropagationAPI2.prototype.extract = function(context2, carrier, getter) {
      if (getter === void 0) {
        getter = defaultTextMapGetter;
      }
      return this._getGlobalPropagator().extract(context2, carrier, getter);
    };
    PropagationAPI2.prototype.fields = function() {
      return this._getGlobalPropagator().fields();
    };
    PropagationAPI2.prototype.disable = function() {
      unregisterGlobal(API_NAME$1, DiagAPI.instance());
    };
    PropagationAPI2.prototype._getGlobalPropagator = function() {
      return getGlobal(API_NAME$1) || NOOP_TEXT_MAP_PROPAGATOR;
    };
    return PropagationAPI2;
  })()
);
PropagationAPI.getInstance();
var API_NAME = "trace";
var TraceAPI = (
  /** @class */
  (function() {
    function TraceAPI2() {
      this._proxyTracerProvider = new ProxyTracerProvider();
      this.wrapSpanContext = wrapSpanContext;
      this.isSpanContextValid = isSpanContextValid;
      this.deleteSpan = deleteSpan;
      this.getSpan = getSpan;
      this.getActiveSpan = getActiveSpan;
      this.getSpanContext = getSpanContext;
      this.setSpan = setSpan;
      this.setSpanContext = setSpanContext;
    }
    TraceAPI2.getInstance = function() {
      if (!this._instance) {
        this._instance = new TraceAPI2();
      }
      return this._instance;
    };
    TraceAPI2.prototype.setGlobalTracerProvider = function(provider) {
      var success = registerGlobal(API_NAME, this._proxyTracerProvider, DiagAPI.instance());
      if (success) {
        this._proxyTracerProvider.setDelegate(provider);
      }
      return success;
    };
    TraceAPI2.prototype.getTracerProvider = function() {
      return getGlobal(API_NAME) || this._proxyTracerProvider;
    };
    TraceAPI2.prototype.getTracer = function(name21, version) {
      return this.getTracerProvider().getTracer(name21, version);
    };
    TraceAPI2.prototype.disable = function() {
      unregisterGlobal(API_NAME, DiagAPI.instance());
      this._proxyTracerProvider = new ProxyTracerProvider();
    };
    return TraceAPI2;
  })()
);
var trace = TraceAPI.getInstance();
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name21 in all)
    __defProp(target, name21, { get: all[name21], enumerable: true });
};
var name = "AI_InvalidArgumentError";
var marker = `vercel.ai.error.${name}`;
var symbol = Symbol.for(marker);
var _a;
var InvalidArgumentError3 = class extends AISDKError$1 {
  constructor({
    parameter,
    value,
    message
  }) {
    super({
      name,
      message: `Invalid argument for parameter ${parameter}: ${message}`
    });
    this[_a] = true;
    this.parameter = parameter;
    this.value = value;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker);
  }
};
_a = symbol;
var name2 = "AI_InvalidStreamPartError";
var marker2 = `vercel.ai.error.${name2}`;
var symbol2 = Symbol.for(marker2);
var _a2;
var InvalidStreamPartError = class extends AISDKError$1 {
  constructor({
    chunk,
    message
  }) {
    super({ name: name2, message });
    this[_a2] = true;
    this.chunk = chunk;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker2);
  }
};
_a2 = symbol2;
var name3 = "AI_InvalidToolApprovalError";
var marker3 = `vercel.ai.error.${name3}`;
var symbol3 = Symbol.for(marker3);
var _a3;
var InvalidToolApprovalError = class extends AISDKError$1 {
  constructor({ approvalId }) {
    super({
      name: name3,
      message: `Tool approval response references unknown approvalId: "${approvalId}". No matching tool-approval-request found in message history.`
    });
    this[_a3] = true;
    this.approvalId = approvalId;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker3);
  }
};
_a3 = symbol3;
var name4 = "AI_InvalidToolInputError";
var marker4 = `vercel.ai.error.${name4}`;
var symbol4 = Symbol.for(marker4);
var _a4;
var InvalidToolInputError = class extends AISDKError$1 {
  constructor({
    toolInput,
    toolName,
    cause,
    message = `Invalid input for tool ${toolName}: ${getErrorMessage$2(cause)}`
  }) {
    super({ name: name4, message, cause });
    this[_a4] = true;
    this.toolInput = toolInput;
    this.toolName = toolName;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker4);
  }
};
_a4 = symbol4;
var name5 = "AI_ToolCallNotFoundForApprovalError";
var marker5 = `vercel.ai.error.${name5}`;
var symbol5 = Symbol.for(marker5);
var _a5;
var ToolCallNotFoundForApprovalError = class extends AISDKError$1 {
  constructor({
    toolCallId,
    approvalId
  }) {
    super({
      name: name5,
      message: `Tool call "${toolCallId}" not found for approval request "${approvalId}".`
    });
    this[_a5] = true;
    this.toolCallId = toolCallId;
    this.approvalId = approvalId;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker5);
  }
};
_a5 = symbol5;
var name6 = "AI_MissingToolResultsError";
var marker6 = `vercel.ai.error.${name6}`;
var symbol6 = Symbol.for(marker6);
var _a6;
var MissingToolResultsError = class extends AISDKError$1 {
  constructor({ toolCallIds }) {
    super({
      name: name6,
      message: `Tool result${toolCallIds.length > 1 ? "s are" : " is"} missing for tool call${toolCallIds.length > 1 ? "s" : ""} ${toolCallIds.join(
        ", "
      )}.`
    });
    this[_a6] = true;
    this.toolCallIds = toolCallIds;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker6);
  }
};
_a6 = symbol6;
var name7 = "AI_NoImageGeneratedError";
var marker7 = `vercel.ai.error.${name7}`;
var symbol7 = Symbol.for(marker7);
var _a7;
var NoImageGeneratedError = class extends AISDKError$1 {
  constructor({
    message = "No image generated.",
    cause,
    responses
  }) {
    super({ name: name7, message, cause });
    this[_a7] = true;
    this.responses = responses;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker7);
  }
};
_a7 = symbol7;
var name8 = "AI_NoObjectGeneratedError";
var marker8 = `vercel.ai.error.${name8}`;
var symbol8 = Symbol.for(marker8);
var _a8;
var NoObjectGeneratedError = class extends AISDKError$1 {
  constructor({
    message = "No object generated.",
    cause,
    text: text2,
    response,
    usage,
    finishReason
  }) {
    super({ name: name8, message, cause });
    this[_a8] = true;
    this.text = text2;
    this.response = response;
    this.usage = usage;
    this.finishReason = finishReason;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker8);
  }
};
_a8 = symbol8;
var name9 = "AI_NoOutputGeneratedError";
var marker9 = `vercel.ai.error.${name9}`;
var symbol9 = Symbol.for(marker9);
var _a9;
var NoOutputGeneratedError = class extends AISDKError$1 {
  // used in isInstance
  constructor({
    message = "No output generated.",
    cause
  } = {}) {
    super({ name: name9, message, cause });
    this[_a9] = true;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker9);
  }
};
_a9 = symbol9;
var name10 = "AI_NoSpeechGeneratedError";
var marker10 = `vercel.ai.error.${name10}`;
var symbol10 = Symbol.for(marker10);
var _a10;
var NoSpeechGeneratedError = class extends AISDKError$1 {
  constructor(options) {
    super({
      name: name10,
      message: "No speech audio generated."
    });
    this[_a10] = true;
    this.responses = options.responses;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker10);
  }
};
_a10 = symbol10;
var name11 = "AI_NoTranscriptGeneratedError";
var marker11 = `vercel.ai.error.${name11}`;
var symbol11 = Symbol.for(marker11);
var _a11;
var NoTranscriptGeneratedError = class extends AISDKError$1 {
  constructor(options) {
    super({
      name: name11,
      message: "No transcript generated."
    });
    this[_a11] = true;
    this.responses = options.responses;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker11);
  }
};
_a11 = symbol11;
var name12 = "AI_NoVideoGeneratedError";
var marker12 = `vercel.ai.error.${name12}`;
var symbol12 = Symbol.for(marker12);
var _a12;
var NoVideoGeneratedError = class extends AISDKError$1 {
  constructor({
    message = "No video generated.",
    cause,
    responses
  }) {
    super({ name: name12, message, cause });
    this[_a12] = true;
    this.responses = responses;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker12);
  }
  /**
   * @deprecated use `isInstance` instead
   */
  static isNoVideoGeneratedError(error) {
    return error instanceof Error && error.name === name12 && typeof error.responses !== "undefined" ? true : false;
  }
  /**
   * @deprecated Do not use this method. It will be removed in the next major version.
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      cause: this.cause,
      responses: this.responses
    };
  }
};
_a12 = symbol12;
var name13 = "AI_NoSuchToolError";
var marker13 = `vercel.ai.error.${name13}`;
var symbol13 = Symbol.for(marker13);
var _a13;
var NoSuchToolError = class extends AISDKError$1 {
  constructor({
    toolName,
    availableTools = void 0,
    message = `Model tried to call unavailable tool '${toolName}'. ${availableTools === void 0 ? "No tools are available." : `Available tools: ${availableTools.join(", ")}.`}`
  }) {
    super({ name: name13, message });
    this[_a13] = true;
    this.toolName = toolName;
    this.availableTools = availableTools;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker13);
  }
};
_a13 = symbol13;
var name14 = "AI_ToolCallRepairError";
var marker14 = `vercel.ai.error.${name14}`;
var symbol14 = Symbol.for(marker14);
var _a14;
var ToolCallRepairError = class extends AISDKError$1 {
  constructor({
    cause,
    originalError,
    message = `Error repairing tool call: ${getErrorMessage$2(cause)}`
  }) {
    super({ name: name14, message, cause });
    this[_a14] = true;
    this.originalError = originalError;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker14);
  }
};
_a14 = symbol14;
var UnsupportedModelVersionError = class extends AISDKError$1 {
  constructor(options) {
    super({
      name: "AI_UnsupportedModelVersionError",
      message: `Unsupported model version ${options.version} for provider "${options.provider}" and model "${options.modelId}". AI SDK 5 only supports models that implement specification version "v2".`
    });
    this.version = options.version;
    this.provider = options.provider;
    this.modelId = options.modelId;
  }
};
var name15 = "AI_UIMessageStreamError";
var marker15 = `vercel.ai.error.${name15}`;
var symbol15 = Symbol.for(marker15);
var _a15;
var UIMessageStreamError = class extends AISDKError$1 {
  constructor({
    chunkType,
    chunkId,
    message
  }) {
    super({ name: name15, message });
    this[_a15] = true;
    this.chunkType = chunkType;
    this.chunkId = chunkId;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker15);
  }
};
_a15 = symbol15;
var name16 = "AI_InvalidDataContentError";
var marker16 = `vercel.ai.error.${name16}`;
var symbol16 = Symbol.for(marker16);
var _a16;
var InvalidDataContentError = class extends AISDKError$1 {
  constructor({
    content,
    cause,
    message = `Invalid data content. Expected a base64 string, Uint8Array, ArrayBuffer, or Buffer, but got ${typeof content}.`
  }) {
    super({ name: name16, message, cause });
    this[_a16] = true;
    this.content = content;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker16);
  }
};
_a16 = symbol16;
var name17 = "AI_InvalidMessageRoleError";
var marker17 = `vercel.ai.error.${name17}`;
var symbol17 = Symbol.for(marker17);
var _a17;
var InvalidMessageRoleError = class extends AISDKError$1 {
  constructor({
    role,
    message = `Invalid message role: '${role}'. Must be one of: "system", "user", "assistant", "tool".`
  }) {
    super({ name: name17, message });
    this[_a17] = true;
    this.role = role;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker17);
  }
};
_a17 = symbol17;
var name18 = "AI_MessageConversionError";
var marker18 = `vercel.ai.error.${name18}`;
var symbol18 = Symbol.for(marker18);
var _a18;
var MessageConversionError = class extends AISDKError$1 {
  constructor({
    originalMessage,
    message
  }) {
    super({ name: name18, message });
    this[_a18] = true;
    this.originalMessage = originalMessage;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker18);
  }
};
_a18 = symbol18;
var name19 = "AI_RetryError";
var marker19 = `vercel.ai.error.${name19}`;
var symbol19 = Symbol.for(marker19);
var _a19;
var RetryError = class extends AISDKError$1 {
  constructor({
    message,
    reason,
    errors
  }) {
    super({ name: name19, message });
    this[_a19] = true;
    this.reason = reason;
    this.errors = errors;
    this.lastError = errors[errors.length - 1];
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker19);
  }
};
_a19 = symbol19;
function asArray(value) {
  return value === void 0 ? [] : Array.isArray(value) ? value : [value];
}
async function notify(options) {
  for (const callback of asArray(options.callbacks)) {
    if (callback == null)
      continue;
    try {
      await callback(options.event);
    } catch (_ignored) {
    }
  }
}
function formatWarning({
  warning,
  provider,
  model
}) {
  const prefix = `AI SDK Warning (${provider} / ${model}):`;
  switch (warning.type) {
    case "unsupported": {
      let message = `${prefix} The feature "${warning.feature}" is not supported.`;
      if (warning.details) {
        message += ` ${warning.details}`;
      }
      return message;
    }
    case "compatibility": {
      let message = `${prefix} The feature "${warning.feature}" is used in a compatibility mode.`;
      if (warning.details) {
        message += ` ${warning.details}`;
      }
      return message;
    }
    case "other": {
      return `${prefix} ${warning.message}`;
    }
    default: {
      return `${prefix} ${JSON.stringify(warning, null, 2)}`;
    }
  }
}
var FIRST_WARNING_INFO_MESSAGE = "AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.";
var hasLoggedBefore = false;
var logWarnings = (options) => {
  if (options.warnings.length === 0) {
    return;
  }
  const logger = globalThis.AI_SDK_LOG_WARNINGS;
  if (logger === false) {
    return;
  }
  if (typeof logger === "function") {
    logger(options);
    return;
  }
  if (!hasLoggedBefore) {
    hasLoggedBefore = true;
    console.info(FIRST_WARNING_INFO_MESSAGE);
  }
  for (const warning of options.warnings) {
    console.warn(
      formatWarning({
        warning,
        provider: options.provider,
        model: options.model
      })
    );
  }
};
function logV2CompatibilityWarning({
  provider,
  modelId
}) {
  logWarnings({
    warnings: [
      {
        type: "compatibility",
        feature: "specificationVersion",
        details: `Using v2 specification compatibility mode. Some features may not be available.`
      }
    ],
    provider,
    model: modelId
  });
}
function asEmbeddingModelV3(model) {
  if (model.specificationVersion === "v3") {
    return model;
  }
  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId
  });
  return new Proxy(model, {
    get(target, prop) {
      if (prop === "specificationVersion")
        return "v3";
      return target[prop];
    }
  });
}
function asImageModelV3(model) {
  if (model.specificationVersion === "v3") {
    return model;
  }
  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId
  });
  return new Proxy(model, {
    get(target, prop) {
      if (prop === "specificationVersion")
        return "v3";
      return target[prop];
    }
  });
}
function asLanguageModelV3(model) {
  if (model.specificationVersion === "v3") {
    return model;
  }
  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId
  });
  return new Proxy(model, {
    get(target, prop) {
      switch (prop) {
        case "specificationVersion":
          return "v3";
        case "doGenerate":
          return async (...args) => {
            const result = await target.doGenerate(...args);
            return {
              ...result,
              finishReason: convertV2FinishReasonToV3(result.finishReason),
              usage: convertV2UsageToV3(result.usage)
            };
          };
        case "doStream":
          return async (...args) => {
            const result = await target.doStream(...args);
            return {
              ...result,
              stream: convertV2StreamToV3(result.stream)
            };
          };
        default:
          return target[prop];
      }
    }
  });
}
function convertV2StreamToV3(stream) {
  return stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        switch (chunk.type) {
          case "finish":
            controller.enqueue({
              ...chunk,
              finishReason: convertV2FinishReasonToV3(chunk.finishReason),
              usage: convertV2UsageToV3(chunk.usage)
            });
            break;
          default:
            controller.enqueue(chunk);
            break;
        }
      }
    })
  );
}
function convertV2FinishReasonToV3(finishReason) {
  return {
    unified: finishReason === "unknown" ? "other" : finishReason,
    raw: void 0
  };
}
function convertV2UsageToV3(usage) {
  return {
    inputTokens: {
      total: usage.inputTokens,
      noCache: void 0,
      cacheRead: usage.cachedInputTokens,
      cacheWrite: void 0
    },
    outputTokens: {
      total: usage.outputTokens,
      text: void 0,
      reasoning: usage.reasoningTokens
    }
  };
}
function asSpeechModelV3(model) {
  if (model.specificationVersion === "v3") {
    return model;
  }
  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId
  });
  return new Proxy(model, {
    get(target, prop) {
      if (prop === "specificationVersion")
        return "v3";
      return target[prop];
    }
  });
}
function asTranscriptionModelV3(model) {
  if (model.specificationVersion === "v3") {
    return model;
  }
  logV2CompatibilityWarning({
    provider: model.provider,
    modelId: model.modelId
  });
  return new Proxy(model, {
    get(target, prop) {
      if (prop === "specificationVersion")
        return "v3";
      return target[prop];
    }
  });
}
function resolveLanguageModel(model) {
  if (typeof model !== "string") {
    if (model.specificationVersion !== "v3" && model.specificationVersion !== "v2") {
      const unsupportedModel = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId
      });
    }
    return asLanguageModelV3(model);
  }
  return getGlobalProvider().languageModel(model);
}
function resolveEmbeddingModel(model) {
  if (typeof model !== "string") {
    if (model.specificationVersion !== "v3" && model.specificationVersion !== "v2") {
      const unsupportedModel = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId
      });
    }
    return asEmbeddingModelV3(model);
  }
  return getGlobalProvider().embeddingModel(model);
}
function resolveTranscriptionModel(model) {
  var _a21, _b15;
  if (typeof model !== "string") {
    if (model.specificationVersion !== "v3" && model.specificationVersion !== "v2") {
      const unsupportedModel = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId
      });
    }
    return asTranscriptionModelV3(model);
  }
  return (_b15 = (_a21 = getGlobalProvider()).transcriptionModel) == null ? void 0 : _b15.call(_a21, model);
}
function resolveSpeechModel(model) {
  var _a21, _b15;
  if (typeof model !== "string") {
    if (model.specificationVersion !== "v3" && model.specificationVersion !== "v2") {
      const unsupportedModel = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId
      });
    }
    return asSpeechModelV3(model);
  }
  return (_b15 = (_a21 = getGlobalProvider()).speechModel) == null ? void 0 : _b15.call(_a21, model);
}
function resolveImageModel(model) {
  if (typeof model !== "string") {
    if (model.specificationVersion !== "v3" && model.specificationVersion !== "v2") {
      const unsupportedModel = model;
      throw new UnsupportedModelVersionError({
        version: unsupportedModel.specificationVersion,
        provider: unsupportedModel.provider,
        modelId: unsupportedModel.modelId
      });
    }
    return asImageModelV3(model);
  }
  return getGlobalProvider().imageModel(model);
}
function resolveVideoModel(model) {
  if (typeof model === "string") {
    const provider = getGlobalProvider();
    const videoModel = provider.videoModel;
    if (!videoModel) {
      throw new Error(
        'The default provider does not support video models. Please use a Experimental_VideoModelV3 object from a provider (e.g., vertex.video("model-id")).'
      );
    }
    return videoModel(model);
  }
  if (model.specificationVersion !== "v3") {
    const unsupportedModel = model;
    throw new UnsupportedModelVersionError({
      version: unsupportedModel.specificationVersion,
      provider: unsupportedModel.provider,
      modelId: unsupportedModel.modelId
    });
  }
  return model;
}
function getGlobalProvider() {
  var _a21;
  return (_a21 = globalThis.AI_SDK_DEFAULT_PROVIDER) != null ? _a21 : gateway;
}
function getTotalTimeoutMs(timeout) {
  if (timeout == null) {
    return void 0;
  }
  if (typeof timeout === "number") {
    return timeout;
  }
  return timeout.totalMs;
}
function getStepTimeoutMs(timeout) {
  if (timeout == null || typeof timeout === "number") {
    return void 0;
  }
  return timeout.stepMs;
}
function getChunkTimeoutMs(timeout) {
  if (timeout == null || typeof timeout === "number") {
    return void 0;
  }
  return timeout.chunkMs;
}
var imageMediaTypeSignatures = [
  {
    mediaType: "image/gif",
    bytesPrefix: [71, 73, 70]
    // GIF
  },
  {
    mediaType: "image/png",
    bytesPrefix: [137, 80, 78, 71]
    // PNG
  },
  {
    mediaType: "image/jpeg",
    bytesPrefix: [255, 216]
    // JPEG
  },
  {
    mediaType: "image/webp",
    bytesPrefix: [
      82,
      73,
      70,
      70,
      // "RIFF"
      null,
      null,
      null,
      null,
      // file size (variable)
      87,
      69,
      66,
      80
      // "WEBP"
    ]
  },
  {
    mediaType: "image/bmp",
    bytesPrefix: [66, 77]
  },
  {
    mediaType: "image/tiff",
    bytesPrefix: [73, 73, 42, 0]
  },
  {
    mediaType: "image/tiff",
    bytesPrefix: [77, 77, 0, 42]
  },
  {
    mediaType: "image/avif",
    bytesPrefix: [
      0,
      0,
      0,
      32,
      102,
      116,
      121,
      112,
      97,
      118,
      105,
      102
    ]
  },
  {
    mediaType: "image/heic",
    bytesPrefix: [
      0,
      0,
      0,
      32,
      102,
      116,
      121,
      112,
      104,
      101,
      105,
      99
    ]
  }
];
var audioMediaTypeSignatures = [
  {
    mediaType: "audio/mpeg",
    bytesPrefix: [255, 251]
  },
  {
    mediaType: "audio/mpeg",
    bytesPrefix: [255, 250]
  },
  {
    mediaType: "audio/mpeg",
    bytesPrefix: [255, 243]
  },
  {
    mediaType: "audio/mpeg",
    bytesPrefix: [255, 242]
  },
  {
    mediaType: "audio/mpeg",
    bytesPrefix: [255, 227]
  },
  {
    mediaType: "audio/mpeg",
    bytesPrefix: [255, 226]
  },
  {
    mediaType: "audio/wav",
    bytesPrefix: [
      82,
      // R
      73,
      // I
      70,
      // F
      70,
      // F
      null,
      null,
      null,
      null,
      87,
      // W
      65,
      // A
      86,
      // V
      69
      // E
    ]
  },
  {
    mediaType: "audio/ogg",
    bytesPrefix: [79, 103, 103, 83]
  },
  {
    mediaType: "audio/flac",
    bytesPrefix: [102, 76, 97, 67]
  },
  {
    mediaType: "audio/aac",
    bytesPrefix: [64, 21, 0, 0]
  },
  {
    mediaType: "audio/mp4",
    bytesPrefix: [102, 116, 121, 112]
  },
  {
    mediaType: "audio/webm",
    bytesPrefix: [26, 69, 223, 163]
  }
];
var videoMediaTypeSignatures = [
  {
    mediaType: "video/mp4",
    bytesPrefix: [
      0,
      0,
      0,
      null,
      102,
      116,
      121,
      112
      // ftyp
    ]
  },
  {
    mediaType: "video/webm",
    bytesPrefix: [26, 69, 223, 163]
    // EBML
  },
  {
    mediaType: "video/quicktime",
    bytesPrefix: [
      0,
      0,
      0,
      20,
      102,
      116,
      121,
      112,
      113,
      116
      // ftypqt
    ]
  },
  {
    mediaType: "video/x-msvideo",
    bytesPrefix: [82, 73, 70, 70]
    // RIFF (AVI)
  }
];
var stripID3 = (data) => {
  const bytes = typeof data === "string" ? convertBase64ToUint8Array$1(data) : data;
  const id3Size = (bytes[6] & 127) << 21 | (bytes[7] & 127) << 14 | (bytes[8] & 127) << 7 | bytes[9] & 127;
  return bytes.slice(id3Size + 10);
};
function stripID3TagsIfPresent(data) {
  const hasId3 = typeof data === "string" && data.startsWith("SUQz") || typeof data !== "string" && data.length > 10 && data[0] === 73 && // 'I'
  data[1] === 68 && // 'D'
  data[2] === 51;
  return hasId3 ? stripID3(data) : data;
}
function detectMediaType({
  data,
  signatures
}) {
  const processedData = stripID3TagsIfPresent(data);
  const bytes = typeof processedData === "string" ? convertBase64ToUint8Array$1(
    processedData.substring(0, Math.min(processedData.length, 24))
  ) : processedData;
  for (const signature of signatures) {
    if (bytes.length >= signature.bytesPrefix.length && signature.bytesPrefix.every(
      (byte, index2) => byte === null || bytes[index2] === byte
    )) {
      return signature.mediaType;
    }
  }
  return void 0;
}
var VERSION = "6.0.116";
var download = async ({
  url,
  maxBytes,
  abortSignal
}) => {
  var _a21;
  const urlText = url.toString();
  validateDownloadUrl(urlText);
  try {
    const response = await fetch(urlText, {
      headers: withUserAgentSuffix$1(
        {},
        `ai-sdk/${VERSION}`,
        getRuntimeEnvironmentUserAgent$1()
      ),
      signal: abortSignal
    });
    if (!response.ok) {
      throw new DownloadError$1({
        url: urlText,
        statusCode: response.status,
        statusText: response.statusText
      });
    }
    const data = await readResponseWithSizeLimit$1({
      response,
      url: urlText,
      maxBytes: maxBytes != null ? maxBytes : DEFAULT_MAX_DOWNLOAD_SIZE$1
    });
    return {
      data,
      mediaType: (_a21 = response.headers.get("content-type")) != null ? _a21 : void 0
    };
  } catch (error) {
    if (DownloadError$1.isInstance(error)) {
      throw error;
    }
    throw new DownloadError$1({ url: urlText, cause: error });
  }
};
var createDefaultDownloadFunction = (download2 = download) => (requestedDownloads) => Promise.all(
  requestedDownloads.map(
    async (requestedDownload) => requestedDownload.isUrlSupportedByModel ? null : download2(requestedDownload)
  )
);
function splitDataUrl(dataUrl) {
  try {
    const [header, base64Content] = dataUrl.split(",");
    return {
      mediaType: header.split(";")[0].split(":")[1],
      base64Content
    };
  } catch (error) {
    return {
      mediaType: void 0,
      base64Content: void 0
    };
  }
}
var dataContentSchema = union([
  string(),
  _instanceof(Uint8Array),
  _instanceof(ArrayBuffer),
  custom(
    // Buffer might not be available in some environments such as CloudFlare:
    (value) => {
      var _a21, _b15;
      return (_b15 = (_a21 = globalThis.Buffer) == null ? void 0 : _a21.isBuffer(value)) != null ? _b15 : false;
    },
    { message: "Must be a Buffer" }
  )
]);
function convertToLanguageModelV3DataContent(content) {
  if (content instanceof Uint8Array) {
    return { data: content, mediaType: void 0 };
  }
  if (content instanceof ArrayBuffer) {
    return { data: new Uint8Array(content), mediaType: void 0 };
  }
  if (typeof content === "string") {
    try {
      content = new URL(content);
    } catch (error) {
    }
  }
  if (content instanceof URL && content.protocol === "data:") {
    const { mediaType: dataUrlMediaType, base64Content } = splitDataUrl(
      content.toString()
    );
    if (dataUrlMediaType == null || base64Content == null) {
      throw new AISDKError$1({
        name: "InvalidDataContentError",
        message: `Invalid data URL format in content ${content.toString()}`
      });
    }
    return { data: base64Content, mediaType: dataUrlMediaType };
  }
  return { data: content, mediaType: void 0 };
}
function convertDataContentToBase64String(content) {
  if (typeof content === "string") {
    return content;
  }
  if (content instanceof ArrayBuffer) {
    return convertUint8ArrayToBase64$1(new Uint8Array(content));
  }
  return convertUint8ArrayToBase64$1(content);
}
function convertDataContentToUint8Array(content) {
  if (content instanceof Uint8Array) {
    return content;
  }
  if (typeof content === "string") {
    try {
      return convertBase64ToUint8Array$1(content);
    } catch (error) {
      throw new InvalidDataContentError({
        message: "Invalid data content. Content string is not a base64-encoded media.",
        content,
        cause: error
      });
    }
  }
  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }
  throw new InvalidDataContentError({ content });
}
async function convertToLanguageModelPrompt({
  prompt,
  supportedUrls,
  download: download2 = createDefaultDownloadFunction()
}) {
  const downloadedAssets = await downloadAssets(
    prompt.messages,
    download2,
    supportedUrls
  );
  const approvalIdToToolCallId = /* @__PURE__ */ new Map();
  for (const message of prompt.messages) {
    if (message.role === "assistant" && Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "tool-approval-request" && "approvalId" in part && "toolCallId" in part) {
          approvalIdToToolCallId.set(
            part.approvalId,
            part.toolCallId
          );
        }
      }
    }
  }
  const approvedToolCallIds = /* @__PURE__ */ new Set();
  for (const message of prompt.messages) {
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type === "tool-approval-response") {
          const toolCallId = approvalIdToToolCallId.get(part.approvalId);
          if (toolCallId) {
            approvedToolCallIds.add(toolCallId);
          }
        }
      }
    }
  }
  const messages = [
    ...prompt.system != null ? typeof prompt.system === "string" ? [{ role: "system", content: prompt.system }] : asArray(prompt.system).map((message) => ({
      role: "system",
      content: message.content,
      providerOptions: message.providerOptions
    })) : [],
    ...prompt.messages.map(
      (message) => convertToLanguageModelMessage({ message, downloadedAssets })
    )
  ];
  const combinedMessages = [];
  for (const message of messages) {
    if (message.role !== "tool") {
      combinedMessages.push(message);
      continue;
    }
    const lastCombinedMessage = combinedMessages.at(-1);
    if ((lastCombinedMessage == null ? void 0 : lastCombinedMessage.role) === "tool") {
      lastCombinedMessage.content.push(...message.content);
    } else {
      combinedMessages.push(message);
    }
  }
  const toolCallIds = /* @__PURE__ */ new Set();
  for (const message of combinedMessages) {
    switch (message.role) {
      case "assistant": {
        for (const content of message.content) {
          if (content.type === "tool-call" && !content.providerExecuted) {
            toolCallIds.add(content.toolCallId);
          }
        }
        break;
      }
      case "tool": {
        for (const content of message.content) {
          if (content.type === "tool-result") {
            toolCallIds.delete(content.toolCallId);
          }
        }
        break;
      }
      case "user":
      case "system":
        for (const id of approvedToolCallIds) {
          toolCallIds.delete(id);
        }
        if (toolCallIds.size > 0) {
          throw new MissingToolResultsError({
            toolCallIds: Array.from(toolCallIds)
          });
        }
        break;
    }
  }
  for (const id of approvedToolCallIds) {
    toolCallIds.delete(id);
  }
  if (toolCallIds.size > 0) {
    throw new MissingToolResultsError({ toolCallIds: Array.from(toolCallIds) });
  }
  return combinedMessages.filter(
    // Filter out empty tool messages (e.g. if they only contained
    // tool-approval-response parts that were removed).
    // This prevents sending invalid empty messages to the provider.
    // Note: provider-executed tool-approval-response parts are preserved.
    (message) => message.role !== "tool" || message.content.length > 0
  );
}
function convertToLanguageModelMessage({
  message,
  downloadedAssets
}) {
  const role = message.role;
  switch (role) {
    case "system": {
      return {
        role: "system",
        content: message.content,
        providerOptions: message.providerOptions
      };
    }
    case "user": {
      if (typeof message.content === "string") {
        return {
          role: "user",
          content: [{ type: "text", text: message.content }],
          providerOptions: message.providerOptions
        };
      }
      return {
        role: "user",
        content: message.content.map((part) => convertPartToLanguageModelPart(part, downloadedAssets)).filter((part) => part.type !== "text" || part.text !== ""),
        providerOptions: message.providerOptions
      };
    }
    case "assistant": {
      if (typeof message.content === "string") {
        return {
          role: "assistant",
          content: [{ type: "text", text: message.content }],
          providerOptions: message.providerOptions
        };
      }
      return {
        role: "assistant",
        content: message.content.filter(
          // remove empty text parts (no text, and no provider options):
          (part) => part.type !== "text" || part.text !== "" || part.providerOptions != null
        ).filter(
          (part) => part.type !== "tool-approval-request"
        ).map((part) => {
          const providerOptions = part.providerOptions;
          switch (part.type) {
            case "file": {
              const { data, mediaType } = convertToLanguageModelV3DataContent(
                part.data
              );
              return {
                type: "file",
                data,
                filename: part.filename,
                mediaType: mediaType != null ? mediaType : part.mediaType,
                providerOptions
              };
            }
            case "reasoning": {
              return {
                type: "reasoning",
                text: part.text,
                providerOptions
              };
            }
            case "text": {
              return {
                type: "text",
                text: part.text,
                providerOptions
              };
            }
            case "tool-call": {
              return {
                type: "tool-call",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
                providerExecuted: part.providerExecuted,
                providerOptions
              };
            }
            case "tool-result": {
              return {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: mapToolResultOutput(part.output),
                providerOptions
              };
            }
          }
        }),
        providerOptions: message.providerOptions
      };
    }
    case "tool": {
      return {
        role: "tool",
        content: message.content.filter(
          // Only include tool-approval-response for provider-executed tools
          (part) => part.type !== "tool-approval-response" || part.providerExecuted
        ).map((part) => {
          switch (part.type) {
            case "tool-result": {
              return {
                type: "tool-result",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: mapToolResultOutput(part.output),
                providerOptions: part.providerOptions
              };
            }
            case "tool-approval-response": {
              return {
                type: "tool-approval-response",
                approvalId: part.approvalId,
                approved: part.approved,
                reason: part.reason
              };
            }
          }
        }),
        providerOptions: message.providerOptions
      };
    }
    default: {
      const _exhaustiveCheck = role;
      throw new InvalidMessageRoleError({ role: _exhaustiveCheck });
    }
  }
}
async function downloadAssets(messages, download2, supportedUrls) {
  const plannedDownloads = messages.filter((message) => message.role === "user").map((message) => message.content).filter(
    (content) => Array.isArray(content)
  ).flat().filter(
    (part) => part.type === "image" || part.type === "file"
  ).map((part) => {
    var _a21;
    const mediaType = (_a21 = part.mediaType) != null ? _a21 : part.type === "image" ? "image/*" : void 0;
    let data = part.type === "image" ? part.image : part.data;
    if (typeof data === "string") {
      try {
        data = new URL(data);
      } catch (ignored) {
      }
    }
    return { mediaType, data };
  }).filter(
    (part) => part.data instanceof URL
  ).map((part) => ({
    url: part.data,
    isUrlSupportedByModel: part.mediaType != null && isUrlSupported({
      url: part.data.toString(),
      mediaType: part.mediaType,
      supportedUrls
    })
  }));
  const downloadedFiles = await download2(plannedDownloads);
  return Object.fromEntries(
    downloadedFiles.map(
      (file, index2) => file == null ? null : [
        plannedDownloads[index2].url.toString(),
        { data: file.data, mediaType: file.mediaType }
      ]
    ).filter((file) => file != null)
  );
}
function convertPartToLanguageModelPart(part, downloadedAssets) {
  var _a21;
  if (part.type === "text") {
    return {
      type: "text",
      text: part.text,
      providerOptions: part.providerOptions
    };
  }
  let originalData;
  const type = part.type;
  switch (type) {
    case "image":
      originalData = part.image;
      break;
    case "file":
      originalData = part.data;
      break;
    default:
      throw new Error(`Unsupported part type: ${type}`);
  }
  const { data: convertedData, mediaType: convertedMediaType } = convertToLanguageModelV3DataContent(originalData);
  let mediaType = convertedMediaType != null ? convertedMediaType : part.mediaType;
  let data = convertedData;
  if (data instanceof URL) {
    const downloadedFile = downloadedAssets[data.toString()];
    if (downloadedFile) {
      data = downloadedFile.data;
      mediaType != null ? mediaType : mediaType = downloadedFile.mediaType;
    }
  }
  switch (type) {
    case "image": {
      if (data instanceof Uint8Array || typeof data === "string") {
        mediaType = (_a21 = detectMediaType({ data, signatures: imageMediaTypeSignatures })) != null ? _a21 : mediaType;
      }
      return {
        type: "file",
        mediaType: mediaType != null ? mediaType : "image/*",
        // any image
        filename: void 0,
        data,
        providerOptions: part.providerOptions
      };
    }
    case "file": {
      if (mediaType == null) {
        throw new Error(`Media type is missing for file part`);
      }
      return {
        type: "file",
        mediaType,
        filename: part.filename,
        data,
        providerOptions: part.providerOptions
      };
    }
  }
}
function mapToolResultOutput(output) {
  if (output.type !== "content") {
    return output;
  }
  return {
    type: "content",
    value: output.value.map((item) => {
      if (item.type !== "media") {
        return item;
      }
      if (item.mediaType.startsWith("image/")) {
        return {
          type: "image-data",
          data: item.data,
          mediaType: item.mediaType
        };
      }
      return {
        type: "file-data",
        data: item.data,
        mediaType: item.mediaType
      };
    })
  };
}
async function createToolModelOutput({
  toolCallId,
  input,
  output,
  tool: tool2,
  errorMode
}) {
  if (errorMode === "text") {
    return { type: "error-text", value: getErrorMessage$2(output) };
  } else if (errorMode === "json") {
    return { type: "error-json", value: toJSONValue(output) };
  }
  if (tool2 == null ? void 0 : tool2.toModelOutput) {
    return await tool2.toModelOutput({ toolCallId, input, output });
  }
  return typeof output === "string" ? { type: "text", value: output } : { type: "json", value: toJSONValue(output) };
}
function toJSONValue(value) {
  return value === void 0 ? null : value;
}
function prepareCallSettings({
  maxOutputTokens,
  temperature,
  topP,
  topK,
  presencePenalty,
  frequencyPenalty,
  seed,
  stopSequences
}) {
  if (maxOutputTokens != null) {
    if (!Number.isInteger(maxOutputTokens)) {
      throw new InvalidArgumentError3({
        parameter: "maxOutputTokens",
        value: maxOutputTokens,
        message: "maxOutputTokens must be an integer"
      });
    }
    if (maxOutputTokens < 1) {
      throw new InvalidArgumentError3({
        parameter: "maxOutputTokens",
        value: maxOutputTokens,
        message: "maxOutputTokens must be >= 1"
      });
    }
  }
  if (temperature != null) {
    if (typeof temperature !== "number") {
      throw new InvalidArgumentError3({
        parameter: "temperature",
        value: temperature,
        message: "temperature must be a number"
      });
    }
  }
  if (topP != null) {
    if (typeof topP !== "number") {
      throw new InvalidArgumentError3({
        parameter: "topP",
        value: topP,
        message: "topP must be a number"
      });
    }
  }
  if (topK != null) {
    if (typeof topK !== "number") {
      throw new InvalidArgumentError3({
        parameter: "topK",
        value: topK,
        message: "topK must be a number"
      });
    }
  }
  if (presencePenalty != null) {
    if (typeof presencePenalty !== "number") {
      throw new InvalidArgumentError3({
        parameter: "presencePenalty",
        value: presencePenalty,
        message: "presencePenalty must be a number"
      });
    }
  }
  if (frequencyPenalty != null) {
    if (typeof frequencyPenalty !== "number") {
      throw new InvalidArgumentError3({
        parameter: "frequencyPenalty",
        value: frequencyPenalty,
        message: "frequencyPenalty must be a number"
      });
    }
  }
  if (seed != null) {
    if (!Number.isInteger(seed)) {
      throw new InvalidArgumentError3({
        parameter: "seed",
        value: seed,
        message: "seed must be an integer"
      });
    }
  }
  return {
    maxOutputTokens,
    temperature,
    topP,
    topK,
    presencePenalty,
    frequencyPenalty,
    stopSequences,
    seed
  };
}
function isNonEmptyObject(object2) {
  return object2 != null && Object.keys(object2).length > 0;
}
async function prepareToolsAndToolChoice({
  tools,
  toolChoice,
  activeTools
}) {
  if (!isNonEmptyObject(tools)) {
    return {
      tools: void 0,
      toolChoice: void 0
    };
  }
  const filteredTools = activeTools != null ? Object.entries(tools).filter(
    ([name21]) => activeTools.includes(name21)
  ) : Object.entries(tools);
  const languageModelTools = [];
  for (const [name21, tool2] of filteredTools) {
    const toolType = tool2.type;
    switch (toolType) {
      case void 0:
      case "dynamic":
      case "function":
        languageModelTools.push({
          type: "function",
          name: name21,
          description: tool2.description,
          inputSchema: await asSchema$1(tool2.inputSchema).jsonSchema,
          ...tool2.inputExamples != null ? { inputExamples: tool2.inputExamples } : {},
          providerOptions: tool2.providerOptions,
          ...tool2.strict != null ? { strict: tool2.strict } : {}
        });
        break;
      case "provider":
        languageModelTools.push({
          type: "provider",
          name: name21,
          id: tool2.id,
          args: tool2.args
        });
        break;
      default: {
        const exhaustiveCheck = toolType;
        throw new Error(`Unsupported tool type: ${exhaustiveCheck}`);
      }
    }
  }
  return {
    tools: languageModelTools,
    toolChoice: toolChoice == null ? { type: "auto" } : typeof toolChoice === "string" ? { type: toolChoice } : { type: "tool", toolName: toolChoice.toolName }
  };
}
var jsonValueSchema = lazy(
  () => union([
    _null(),
    string(),
    number(),
    boolean(),
    record(string(), jsonValueSchema.optional()),
    array$1(jsonValueSchema)
  ])
);
var providerMetadataSchema = record(
  string(),
  record(string(), jsonValueSchema.optional())
);
var textPartSchema = object$1({
  type: literal("text"),
  text: string(),
  providerOptions: providerMetadataSchema.optional()
});
var imagePartSchema = object$1({
  type: literal("image"),
  image: union([dataContentSchema, _instanceof(URL)]),
  mediaType: string().optional(),
  providerOptions: providerMetadataSchema.optional()
});
var filePartSchema = object$1({
  type: literal("file"),
  data: union([dataContentSchema, _instanceof(URL)]),
  filename: string().optional(),
  mediaType: string(),
  providerOptions: providerMetadataSchema.optional()
});
var reasoningPartSchema = object$1({
  type: literal("reasoning"),
  text: string(),
  providerOptions: providerMetadataSchema.optional()
});
var toolCallPartSchema = object$1({
  type: literal("tool-call"),
  toolCallId: string(),
  toolName: string(),
  input: unknown(),
  providerOptions: providerMetadataSchema.optional(),
  providerExecuted: boolean().optional()
});
var outputSchema = discriminatedUnion(
  "type",
  [
    object$1({
      type: literal("text"),
      value: string(),
      providerOptions: providerMetadataSchema.optional()
    }),
    object$1({
      type: literal("json"),
      value: jsonValueSchema,
      providerOptions: providerMetadataSchema.optional()
    }),
    object$1({
      type: literal("execution-denied"),
      reason: string().optional(),
      providerOptions: providerMetadataSchema.optional()
    }),
    object$1({
      type: literal("error-text"),
      value: string(),
      providerOptions: providerMetadataSchema.optional()
    }),
    object$1({
      type: literal("error-json"),
      value: jsonValueSchema,
      providerOptions: providerMetadataSchema.optional()
    }),
    object$1({
      type: literal("content"),
      value: array$1(
        union([
          object$1({
            type: literal("text"),
            text: string(),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("media"),
            data: string(),
            mediaType: string()
          }),
          object$1({
            type: literal("file-data"),
            data: string(),
            mediaType: string(),
            filename: string().optional(),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("file-url"),
            url: string(),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("file-id"),
            fileId: union([string(), record(string(), string())]),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("image-data"),
            data: string(),
            mediaType: string(),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("image-url"),
            url: string(),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("image-file-id"),
            fileId: union([string(), record(string(), string())]),
            providerOptions: providerMetadataSchema.optional()
          }),
          object$1({
            type: literal("custom"),
            providerOptions: providerMetadataSchema.optional()
          })
        ])
      )
    })
  ]
);
var toolResultPartSchema = object$1({
  type: literal("tool-result"),
  toolCallId: string(),
  toolName: string(),
  output: outputSchema,
  providerOptions: providerMetadataSchema.optional()
});
var toolApprovalRequestSchema = object$1({
  type: literal("tool-approval-request"),
  approvalId: string(),
  toolCallId: string()
});
var toolApprovalResponseSchema = object$1({
  type: literal("tool-approval-response"),
  approvalId: string(),
  approved: boolean(),
  reason: string().optional()
});
var systemModelMessageSchema = object$1(
  {
    role: literal("system"),
    content: string(),
    providerOptions: providerMetadataSchema.optional()
  }
);
var userModelMessageSchema = object$1({
  role: literal("user"),
  content: union([
    string(),
    array$1(union([textPartSchema, imagePartSchema, filePartSchema]))
  ]),
  providerOptions: providerMetadataSchema.optional()
});
var assistantModelMessageSchema = object$1({
  role: literal("assistant"),
  content: union([
    string(),
    array$1(
      union([
        textPartSchema,
        filePartSchema,
        reasoningPartSchema,
        toolCallPartSchema,
        toolResultPartSchema,
        toolApprovalRequestSchema
      ])
    )
  ]),
  providerOptions: providerMetadataSchema.optional()
});
var toolModelMessageSchema = object$1({
  role: literal("tool"),
  content: array$1(union([toolResultPartSchema, toolApprovalResponseSchema])),
  providerOptions: providerMetadataSchema.optional()
});
var modelMessageSchema = union([
  systemModelMessageSchema,
  userModelMessageSchema,
  assistantModelMessageSchema,
  toolModelMessageSchema
]);
async function standardizePrompt(prompt) {
  if (prompt.prompt == null && prompt.messages == null) {
    throw new InvalidPromptError({
      prompt,
      message: "prompt or messages must be defined"
    });
  }
  if (prompt.prompt != null && prompt.messages != null) {
    throw new InvalidPromptError({
      prompt,
      message: "prompt and messages cannot be defined at the same time"
    });
  }
  if (prompt.system != null && typeof prompt.system !== "string" && !asArray(prompt.system).every(
    (message) => typeof message === "object" && message !== null && "role" in message && message.role === "system"
  )) {
    throw new InvalidPromptError({
      prompt,
      message: "system must be a string, SystemModelMessage, or array of SystemModelMessage"
    });
  }
  let messages;
  if (prompt.prompt != null && typeof prompt.prompt === "string") {
    messages = [{ role: "user", content: prompt.prompt }];
  } else if (prompt.prompt != null && Array.isArray(prompt.prompt)) {
    messages = prompt.prompt;
  } else if (prompt.messages != null) {
    messages = prompt.messages;
  } else {
    throw new InvalidPromptError({
      prompt,
      message: "prompt or messages must be defined"
    });
  }
  if (messages.length === 0) {
    throw new InvalidPromptError({
      prompt,
      message: "messages must not be empty"
    });
  }
  const validationResult = await safeValidateTypes$1({
    value: messages,
    schema: array$1(modelMessageSchema)
  });
  if (!validationResult.success) {
    throw new InvalidPromptError({
      prompt,
      message: "The messages do not match the ModelMessage[] schema.",
      cause: validationResult.error
    });
  }
  return {
    messages,
    system: prompt.system
  };
}
function wrapGatewayError(error) {
  if (!GatewayAuthenticationError.isInstance(error))
    return error;
  const isProductionEnv = (process == null ? void 0 : "production") === "production";
  const moreInfoURL = "https://ai-sdk.dev/unauthenticated-ai-gateway";
  if (isProductionEnv) {
    return new AISDKError$1({
      name: "GatewayError",
      message: `Unauthenticated. Configure AI_GATEWAY_API_KEY or use a provider module. Learn more: ${moreInfoURL}`
    });
  }
  return Object.assign(
    new Error(`\x1B[1m\x1B[31mUnauthenticated request to AI Gateway.\x1B[0m

To authenticate, set the \x1B[33mAI_GATEWAY_API_KEY\x1B[0m environment variable with your API key.

Alternatively, you can use a provider module instead of the AI Gateway.

Learn more: \x1B[34m${moreInfoURL}\x1B[0m

`),
    { name: "GatewayAuthenticationError" }
  );
}
function assembleOperationName({
  operationId,
  telemetry
}) {
  return {
    // standardized operation and resource name:
    "operation.name": `${operationId}${(telemetry == null ? void 0 : telemetry.functionId) != null ? ` ${telemetry.functionId}` : ""}`,
    "resource.name": telemetry == null ? void 0 : telemetry.functionId,
    // detailed, AI SDK specific data:
    "ai.operationId": operationId,
    "ai.telemetry.functionId": telemetry == null ? void 0 : telemetry.functionId
  };
}
function getBaseTelemetryAttributes({
  model,
  settings,
  telemetry,
  headers
}) {
  var _a21;
  return {
    "ai.model.provider": model.provider,
    "ai.model.id": model.modelId,
    // settings:
    ...Object.entries(settings).reduce((attributes, [key, value]) => {
      if (key === "timeout") {
        const totalTimeoutMs = getTotalTimeoutMs(
          value
        );
        if (totalTimeoutMs != null) {
          attributes[`ai.settings.${key}`] = totalTimeoutMs;
        }
      } else {
        attributes[`ai.settings.${key}`] = value;
      }
      return attributes;
    }, {}),
    // add metadata as attributes:
    ...Object.entries((_a21 = telemetry == null ? void 0 : telemetry.metadata) != null ? _a21 : {}).reduce(
      (attributes, [key, value]) => {
        attributes[`ai.telemetry.metadata.${key}`] = value;
        return attributes;
      },
      {}
    ),
    // request headers
    ...Object.entries(headers != null ? headers : {}).reduce((attributes, [key, value]) => {
      if (value !== void 0) {
        attributes[`ai.request.headers.${key}`] = value;
      }
      return attributes;
    }, {})
  };
}
var noopTracer = {
  startSpan() {
    return noopSpan;
  },
  startActiveSpan(name21, arg1, arg2, arg3) {
    if (typeof arg1 === "function") {
      return arg1(noopSpan);
    }
    if (typeof arg2 === "function") {
      return arg2(noopSpan);
    }
    if (typeof arg3 === "function") {
      return arg3(noopSpan);
    }
  }
};
var noopSpan = {
  spanContext() {
    return noopSpanContext;
  },
  setAttribute() {
    return this;
  },
  setAttributes() {
    return this;
  },
  addEvent() {
    return this;
  },
  addLink() {
    return this;
  },
  addLinks() {
    return this;
  },
  setStatus() {
    return this;
  },
  updateName() {
    return this;
  },
  end() {
    return this;
  },
  isRecording() {
    return false;
  },
  recordException() {
    return this;
  }
};
var noopSpanContext = {
  traceId: "",
  spanId: "",
  traceFlags: 0
};
function getTracer({
  isEnabled = false,
  tracer
} = {}) {
  if (!isEnabled) {
    return noopTracer;
  }
  if (tracer) {
    return tracer;
  }
  return trace.getTracer("ai");
}
async function recordSpan({
  name: name21,
  tracer,
  attributes,
  fn,
  endWhenDone = true
}) {
  return tracer.startActiveSpan(
    name21,
    { attributes: await attributes },
    async (span) => {
      const ctx = context.active();
      try {
        const result = await context.with(ctx, () => fn(span));
        if (endWhenDone) {
          span.end();
        }
        return result;
      } catch (error) {
        try {
          recordErrorOnSpan(span, error);
        } finally {
          span.end();
        }
        throw error;
      }
    }
  );
}
function recordErrorOnSpan(span, error) {
  if (error instanceof Error) {
    span.recordException({
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
  } else {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
}
async function selectTelemetryAttributes({
  telemetry,
  attributes
}) {
  if ((telemetry == null ? void 0 : telemetry.isEnabled) !== true) {
    return {};
  }
  const resultAttributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (value == null) {
      continue;
    }
    if (typeof value === "object" && "input" in value && typeof value.input === "function") {
      if ((telemetry == null ? void 0 : telemetry.recordInputs) === false) {
        continue;
      }
      const result = await value.input();
      if (result != null) {
        resultAttributes[key] = result;
      }
      continue;
    }
    if (typeof value === "object" && "output" in value && typeof value.output === "function") {
      if ((telemetry == null ? void 0 : telemetry.recordOutputs) === false) {
        continue;
      }
      const result = await value.output();
      if (result != null) {
        resultAttributes[key] = result;
      }
      continue;
    }
    resultAttributes[key] = value;
  }
  return resultAttributes;
}
function stringifyForTelemetry(prompt) {
  return JSON.stringify(
    prompt.map((message) => ({
      ...message,
      content: typeof message.content === "string" ? message.content : message.content.map(
        (part) => part.type === "file" ? {
          ...part,
          data: part.data instanceof Uint8Array ? convertDataContentToBase64String(part.data) : part.data
        } : part
      )
    }))
  );
}
function registerTelemetryIntegration(integration) {
  if (!globalThis.AI_SDK_TELEMETRY_INTEGRATIONS) {
    globalThis.AI_SDK_TELEMETRY_INTEGRATIONS = [];
  }
  globalThis.AI_SDK_TELEMETRY_INTEGRATIONS.push(integration);
}
function getGlobalTelemetryIntegrations() {
  var _a21;
  return (_a21 = globalThis.AI_SDK_TELEMETRY_INTEGRATIONS) != null ? _a21 : [];
}
function bindTelemetryIntegration(integration) {
  var _a21, _b15, _c, _d, _e, _f;
  return {
    onStart: (_a21 = integration.onStart) == null ? void 0 : _a21.bind(integration),
    onStepStart: (_b15 = integration.onStepStart) == null ? void 0 : _b15.bind(integration),
    onToolCallStart: (_c = integration.onToolCallStart) == null ? void 0 : _c.bind(integration),
    onToolCallFinish: (_d = integration.onToolCallFinish) == null ? void 0 : _d.bind(integration),
    onStepFinish: (_e = integration.onStepFinish) == null ? void 0 : _e.bind(integration),
    onFinish: (_f = integration.onFinish) == null ? void 0 : _f.bind(integration)
  };
}
function getGlobalTelemetryIntegration() {
  const globalIntegrations = getGlobalTelemetryIntegrations();
  return (integrations) => {
    const localIntegrations = asArray(integrations);
    const allIntegrations = [...globalIntegrations, ...localIntegrations];
    function createTelemetryComposite(getListenerFromIntegration) {
      const listeners = allIntegrations.map(getListenerFromIntegration).filter(Boolean);
      return async (event) => {
        for (const listener of listeners) {
          try {
            await listener(event);
          } catch (_ignored) {
          }
        }
      };
    }
    return {
      onStart: createTelemetryComposite((integration) => integration.onStart),
      onStepStart: createTelemetryComposite(
        (integration) => integration.onStepStart
      ),
      onToolCallStart: createTelemetryComposite(
        (integration) => integration.onToolCallStart
      ),
      onToolCallFinish: createTelemetryComposite(
        (integration) => integration.onToolCallFinish
      ),
      onStepFinish: createTelemetryComposite(
        (integration) => integration.onStepFinish
      ),
      onFinish: createTelemetryComposite((integration) => integration.onFinish)
    };
  };
}
function asLanguageModelUsage(usage) {
  return {
    inputTokens: usage.inputTokens.total,
    inputTokenDetails: {
      noCacheTokens: usage.inputTokens.noCache,
      cacheReadTokens: usage.inputTokens.cacheRead,
      cacheWriteTokens: usage.inputTokens.cacheWrite
    },
    outputTokens: usage.outputTokens.total,
    outputTokenDetails: {
      textTokens: usage.outputTokens.text,
      reasoningTokens: usage.outputTokens.reasoning
    },
    totalTokens: addTokenCounts(
      usage.inputTokens.total,
      usage.outputTokens.total
    ),
    raw: usage.raw,
    reasoningTokens: usage.outputTokens.reasoning,
    cachedInputTokens: usage.inputTokens.cacheRead
  };
}
function createNullLanguageModelUsage() {
  return {
    inputTokens: void 0,
    inputTokenDetails: {
      noCacheTokens: void 0,
      cacheReadTokens: void 0,
      cacheWriteTokens: void 0
    },
    outputTokens: void 0,
    outputTokenDetails: {
      textTokens: void 0,
      reasoningTokens: void 0
    },
    totalTokens: void 0,
    raw: void 0
  };
}
function addLanguageModelUsage(usage1, usage2) {
  var _a21, _b15, _c, _d, _e, _f, _g, _h, _i, _j;
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    inputTokenDetails: {
      noCacheTokens: addTokenCounts(
        (_a21 = usage1.inputTokenDetails) == null ? void 0 : _a21.noCacheTokens,
        (_b15 = usage2.inputTokenDetails) == null ? void 0 : _b15.noCacheTokens
      ),
      cacheReadTokens: addTokenCounts(
        (_c = usage1.inputTokenDetails) == null ? void 0 : _c.cacheReadTokens,
        (_d = usage2.inputTokenDetails) == null ? void 0 : _d.cacheReadTokens
      ),
      cacheWriteTokens: addTokenCounts(
        (_e = usage1.inputTokenDetails) == null ? void 0 : _e.cacheWriteTokens,
        (_f = usage2.inputTokenDetails) == null ? void 0 : _f.cacheWriteTokens
      )
    },
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    outputTokenDetails: {
      textTokens: addTokenCounts(
        (_g = usage1.outputTokenDetails) == null ? void 0 : _g.textTokens,
        (_h = usage2.outputTokenDetails) == null ? void 0 : _h.textTokens
      ),
      reasoningTokens: addTokenCounts(
        (_i = usage1.outputTokenDetails) == null ? void 0 : _i.reasoningTokens,
        (_j = usage2.outputTokenDetails) == null ? void 0 : _j.reasoningTokens
      )
    },
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens),
    reasoningTokens: addTokenCounts(
      usage1.reasoningTokens,
      usage2.reasoningTokens
    ),
    cachedInputTokens: addTokenCounts(
      usage1.cachedInputTokens,
      usage2.cachedInputTokens
    )
  };
}
function addTokenCounts(tokenCount1, tokenCount2) {
  return tokenCount1 == null && tokenCount2 == null ? void 0 : (tokenCount1 != null ? tokenCount1 : 0) + (tokenCount2 != null ? tokenCount2 : 0);
}
function addImageModelUsage(usage1, usage2) {
  return {
    inputTokens: addTokenCounts(usage1.inputTokens, usage2.inputTokens),
    outputTokens: addTokenCounts(usage1.outputTokens, usage2.outputTokens),
    totalTokens: addTokenCounts(usage1.totalTokens, usage2.totalTokens)
  };
}
function mergeObjects(base, overrides) {
  if (base === void 0 && overrides === void 0) {
    return void 0;
  }
  if (base === void 0) {
    return overrides;
  }
  if (overrides === void 0) {
    return base;
  }
  const result = { ...base };
  for (const key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      const overridesValue = overrides[key];
      if (overridesValue === void 0)
        continue;
      const baseValue = key in base ? base[key] : void 0;
      const isSourceObject = overridesValue !== null && typeof overridesValue === "object" && !Array.isArray(overridesValue) && !(overridesValue instanceof Date) && !(overridesValue instanceof RegExp);
      const isTargetObject = baseValue !== null && baseValue !== void 0 && typeof baseValue === "object" && !Array.isArray(baseValue) && !(baseValue instanceof Date) && !(baseValue instanceof RegExp);
      if (isSourceObject && isTargetObject) {
        result[key] = mergeObjects(
          baseValue,
          overridesValue
        );
      } else {
        result[key] = overridesValue;
      }
    }
  }
  return result;
}
function getRetryDelayInMs({
  error,
  exponentialBackoffDelay
}) {
  const headers = error.responseHeaders;
  if (!headers)
    return exponentialBackoffDelay;
  let ms;
  const retryAfterMs = headers["retry-after-ms"];
  if (retryAfterMs) {
    const timeoutMs = parseFloat(retryAfterMs);
    if (!Number.isNaN(timeoutMs)) {
      ms = timeoutMs;
    }
  }
  const retryAfter = headers["retry-after"];
  if (retryAfter && ms === void 0) {
    const timeoutSeconds = parseFloat(retryAfter);
    if (!Number.isNaN(timeoutSeconds)) {
      ms = timeoutSeconds * 1e3;
    } else {
      ms = Date.parse(retryAfter) - Date.now();
    }
  }
  if (ms != null && !Number.isNaN(ms) && 0 <= ms && (ms < 60 * 1e3 || ms < exponentialBackoffDelay)) {
    return ms;
  }
  return exponentialBackoffDelay;
}
var retryWithExponentialBackoffRespectingRetryHeaders = ({
  maxRetries = 2,
  initialDelayInMs = 2e3,
  backoffFactor = 2,
  abortSignal
} = {}) => async (f) => _retryWithExponentialBackoff(f, {
  maxRetries,
  delayInMs: initialDelayInMs,
  backoffFactor,
  abortSignal
});
async function _retryWithExponentialBackoff(f, {
  maxRetries,
  delayInMs,
  backoffFactor,
  abortSignal
}, errors = []) {
  try {
    return await f();
  } catch (error) {
    if (isAbortError$1(error)) {
      throw error;
    }
    if (maxRetries === 0) {
      throw error;
    }
    const errorMessage = getErrorMessage$1(error);
    const newErrors = [...errors, error];
    const tryNumber = newErrors.length;
    if (tryNumber > maxRetries) {
      throw new RetryError({
        message: `Failed after ${tryNumber} attempts. Last error: ${errorMessage}`,
        reason: "maxRetriesExceeded",
        errors: newErrors
      });
    }
    if (error instanceof Error && APICallError$1.isInstance(error) && error.isRetryable === true && tryNumber <= maxRetries) {
      await delay(
        getRetryDelayInMs({
          error,
          exponentialBackoffDelay: delayInMs
        }),
        { abortSignal }
      );
      return _retryWithExponentialBackoff(
        f,
        {
          maxRetries,
          delayInMs: backoffFactor * delayInMs,
          backoffFactor,
          abortSignal
        },
        newErrors
      );
    }
    if (tryNumber === 1) {
      throw error;
    }
    throw new RetryError({
      message: `Failed after ${tryNumber} attempts with non-retryable error: '${errorMessage}'`,
      reason: "errorNotRetryable",
      errors: newErrors
    });
  }
}
function prepareRetries({
  maxRetries,
  abortSignal
}) {
  if (maxRetries != null) {
    if (!Number.isInteger(maxRetries)) {
      throw new InvalidArgumentError3({
        parameter: "maxRetries",
        value: maxRetries,
        message: "maxRetries must be an integer"
      });
    }
    if (maxRetries < 0) {
      throw new InvalidArgumentError3({
        parameter: "maxRetries",
        value: maxRetries,
        message: "maxRetries must be >= 0"
      });
    }
  }
  const maxRetriesResult = maxRetries != null ? maxRetries : 2;
  return {
    maxRetries: maxRetriesResult,
    retry: retryWithExponentialBackoffRespectingRetryHeaders({
      maxRetries: maxRetriesResult,
      abortSignal
    })
  };
}
function collectToolApprovals({
  messages
}) {
  const lastMessage = messages.at(-1);
  if ((lastMessage == null ? void 0 : lastMessage.role) != "tool") {
    return {
      approvedToolApprovals: [],
      deniedToolApprovals: []
    };
  }
  const toolCallsByToolCallId = {};
  for (const message of messages) {
    if (message.role === "assistant" && typeof message.content !== "string") {
      const content = message.content;
      for (const part of content) {
        if (part.type === "tool-call") {
          toolCallsByToolCallId[part.toolCallId] = part;
        }
      }
    }
  }
  const toolApprovalRequestsByApprovalId = {};
  for (const message of messages) {
    if (message.role === "assistant" && typeof message.content !== "string") {
      const content = message.content;
      for (const part of content) {
        if (part.type === "tool-approval-request") {
          toolApprovalRequestsByApprovalId[part.approvalId] = part;
        }
      }
    }
  }
  const toolResults = {};
  for (const part of lastMessage.content) {
    if (part.type === "tool-result") {
      toolResults[part.toolCallId] = part;
    }
  }
  const approvedToolApprovals = [];
  const deniedToolApprovals = [];
  const approvalResponses = lastMessage.content.filter(
    (part) => part.type === "tool-approval-response"
  );
  for (const approvalResponse of approvalResponses) {
    const approvalRequest = toolApprovalRequestsByApprovalId[approvalResponse.approvalId];
    if (approvalRequest == null) {
      throw new InvalidToolApprovalError({
        approvalId: approvalResponse.approvalId
      });
    }
    if (toolResults[approvalRequest.toolCallId] != null) {
      continue;
    }
    const toolCall = toolCallsByToolCallId[approvalRequest.toolCallId];
    if (toolCall == null) {
      throw new ToolCallNotFoundForApprovalError({
        toolCallId: approvalRequest.toolCallId,
        approvalId: approvalRequest.approvalId
      });
    }
    const approval = {
      approvalRequest,
      approvalResponse,
      toolCall
    };
    if (approvalResponse.approved) {
      approvedToolApprovals.push(approval);
    } else {
      deniedToolApprovals.push(approval);
    }
  }
  return { approvedToolApprovals, deniedToolApprovals };
}
function now() {
  var _a21, _b15;
  return (_b15 = (_a21 = globalThis == null ? void 0 : globalThis.performance) == null ? void 0 : _a21.now()) != null ? _b15 : Date.now();
}
async function executeToolCall({
  toolCall,
  tools,
  tracer,
  telemetry,
  messages,
  abortSignal,
  experimental_context,
  stepNumber,
  model,
  onPreliminaryToolResult,
  onToolCallStart,
  onToolCallFinish
}) {
  const { toolName, toolCallId, input } = toolCall;
  const tool2 = tools == null ? void 0 : tools[toolName];
  if ((tool2 == null ? void 0 : tool2.execute) == null) {
    return void 0;
  }
  const baseCallbackEvent = {
    stepNumber,
    model,
    toolCall,
    messages,
    abortSignal,
    functionId: telemetry == null ? void 0 : telemetry.functionId,
    metadata: telemetry == null ? void 0 : telemetry.metadata,
    experimental_context
  };
  return recordSpan({
    name: "ai.toolCall",
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({
          operationId: "ai.toolCall",
          telemetry
        }),
        "ai.toolCall.name": toolName,
        "ai.toolCall.id": toolCallId,
        "ai.toolCall.args": {
          output: () => JSON.stringify(input)
        }
      }
    }),
    tracer,
    fn: async (span) => {
      let output;
      await notify({ event: baseCallbackEvent, callbacks: onToolCallStart });
      const startTime = now();
      try {
        const stream = executeTool({
          execute: tool2.execute.bind(tool2),
          input,
          options: {
            toolCallId,
            messages,
            abortSignal,
            experimental_context
          }
        });
        for await (const part of stream) {
          if (part.type === "preliminary") {
            onPreliminaryToolResult == null ? void 0 : onPreliminaryToolResult({
              ...toolCall,
              type: "tool-result",
              output: part.output,
              preliminary: true
            });
          } else {
            output = part.output;
          }
        }
      } catch (error) {
        const durationMs2 = now() - startTime;
        await notify({
          event: {
            ...baseCallbackEvent,
            success: false,
            error,
            durationMs: durationMs2
          },
          callbacks: onToolCallFinish
        });
        recordErrorOnSpan(span, error);
        return {
          type: "tool-error",
          toolCallId,
          toolName,
          input,
          error,
          dynamic: tool2.type === "dynamic",
          ...toolCall.providerMetadata != null ? { providerMetadata: toolCall.providerMetadata } : {}
        };
      }
      const durationMs = now() - startTime;
      await notify({
        event: {
          ...baseCallbackEvent,
          success: true,
          output,
          durationMs
        },
        callbacks: onToolCallFinish
      });
      try {
        span.setAttributes(
          await selectTelemetryAttributes({
            telemetry,
            attributes: {
              "ai.toolCall.result": {
                output: () => JSON.stringify(output)
              }
            }
          })
        );
      } catch (ignored) {
      }
      return {
        type: "tool-result",
        toolCallId,
        toolName,
        input,
        output,
        dynamic: tool2.type === "dynamic",
        ...toolCall.providerMetadata != null ? { providerMetadata: toolCall.providerMetadata } : {}
      };
    }
  });
}
function extractReasoningContent(content) {
  const parts = content.filter(
    (content2) => content2.type === "reasoning"
  );
  return parts.length === 0 ? void 0 : parts.map((content2) => content2.text).join("\n");
}
function extractTextContent(content) {
  const parts = content.filter(
    (content2) => content2.type === "text"
  );
  if (parts.length === 0) {
    return void 0;
  }
  return parts.map((content2) => content2.text).join("");
}
var DefaultGeneratedFile = class {
  constructor({
    data,
    mediaType
  }) {
    const isUint8Array2 = data instanceof Uint8Array;
    this.base64Data = isUint8Array2 ? void 0 : data;
    this.uint8ArrayData = isUint8Array2 ? data : void 0;
    this.mediaType = mediaType;
  }
  // lazy conversion with caching to avoid unnecessary conversion overhead:
  get base64() {
    if (this.base64Data == null) {
      this.base64Data = convertUint8ArrayToBase64$1(this.uint8ArrayData);
    }
    return this.base64Data;
  }
  // lazy conversion with caching to avoid unnecessary conversion overhead:
  get uint8Array() {
    if (this.uint8ArrayData == null) {
      this.uint8ArrayData = convertBase64ToUint8Array$1(this.base64Data);
    }
    return this.uint8ArrayData;
  }
};
var DefaultGeneratedFileWithType = class extends DefaultGeneratedFile {
  constructor(options) {
    super(options);
    this.type = "file";
  }
};
async function isApprovalNeeded({
  tool: tool2,
  toolCall,
  messages,
  experimental_context
}) {
  if (tool2.needsApproval == null) {
    return false;
  }
  if (typeof tool2.needsApproval === "boolean") {
    return tool2.needsApproval;
  }
  return await tool2.needsApproval(toolCall.input, {
    toolCallId: toolCall.toolCallId,
    messages,
    experimental_context
  });
}
var output_exports = {};
__export(output_exports, {
  array: () => array,
  choice: () => choice,
  json: () => json,
  object: () => object,
  text: () => text
});
function fixJson(input) {
  const stack = ["ROOT"];
  let lastValidIndex = -1;
  let literalStart = null;
  function processValueStart(char, i, swapState) {
    {
      switch (char) {
        case '"': {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_STRING");
          break;
        }
        case "f":
        case "t":
        case "n": {
          lastValidIndex = i;
          literalStart = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_LITERAL");
          break;
        }
        case "-": {
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_NUMBER");
          break;
        }
        case "0":
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9": {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_NUMBER");
          break;
        }
        case "{": {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_OBJECT_START");
          break;
        }
        case "[": {
          lastValidIndex = i;
          stack.pop();
          stack.push(swapState);
          stack.push("INSIDE_ARRAY_START");
          break;
        }
      }
    }
  }
  function processAfterObjectValue(char, i) {
    switch (char) {
      case ",": {
        stack.pop();
        stack.push("INSIDE_OBJECT_AFTER_COMMA");
        break;
      }
      case "}": {
        lastValidIndex = i;
        stack.pop();
        break;
      }
    }
  }
  function processAfterArrayValue(char, i) {
    switch (char) {
      case ",": {
        stack.pop();
        stack.push("INSIDE_ARRAY_AFTER_COMMA");
        break;
      }
      case "]": {
        lastValidIndex = i;
        stack.pop();
        break;
      }
    }
  }
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const currentState = stack[stack.length - 1];
    switch (currentState) {
      case "ROOT":
        processValueStart(char, i, "FINISH");
        break;
      case "INSIDE_OBJECT_START": {
        switch (char) {
          case '"': {
            stack.pop();
            stack.push("INSIDE_OBJECT_KEY");
            break;
          }
          case "}": {
            lastValidIndex = i;
            stack.pop();
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_AFTER_COMMA": {
        switch (char) {
          case '"': {
            stack.pop();
            stack.push("INSIDE_OBJECT_KEY");
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_KEY": {
        switch (char) {
          case '"': {
            stack.pop();
            stack.push("INSIDE_OBJECT_AFTER_KEY");
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_AFTER_KEY": {
        switch (char) {
          case ":": {
            stack.pop();
            stack.push("INSIDE_OBJECT_BEFORE_VALUE");
            break;
          }
        }
        break;
      }
      case "INSIDE_OBJECT_BEFORE_VALUE": {
        processValueStart(char, i, "INSIDE_OBJECT_AFTER_VALUE");
        break;
      }
      case "INSIDE_OBJECT_AFTER_VALUE": {
        processAfterObjectValue(char, i);
        break;
      }
      case "INSIDE_STRING": {
        switch (char) {
          case '"': {
            stack.pop();
            lastValidIndex = i;
            break;
          }
          case "\\": {
            stack.push("INSIDE_STRING_ESCAPE");
            break;
          }
          default: {
            lastValidIndex = i;
          }
        }
        break;
      }
      case "INSIDE_ARRAY_START": {
        switch (char) {
          case "]": {
            lastValidIndex = i;
            stack.pop();
            break;
          }
          default: {
            lastValidIndex = i;
            processValueStart(char, i, "INSIDE_ARRAY_AFTER_VALUE");
            break;
          }
        }
        break;
      }
      case "INSIDE_ARRAY_AFTER_VALUE": {
        switch (char) {
          case ",": {
            stack.pop();
            stack.push("INSIDE_ARRAY_AFTER_COMMA");
            break;
          }
          case "]": {
            lastValidIndex = i;
            stack.pop();
            break;
          }
          default: {
            lastValidIndex = i;
            break;
          }
        }
        break;
      }
      case "INSIDE_ARRAY_AFTER_COMMA": {
        processValueStart(char, i, "INSIDE_ARRAY_AFTER_VALUE");
        break;
      }
      case "INSIDE_STRING_ESCAPE": {
        stack.pop();
        lastValidIndex = i;
        break;
      }
      case "INSIDE_NUMBER": {
        switch (char) {
          case "0":
          case "1":
          case "2":
          case "3":
          case "4":
          case "5":
          case "6":
          case "7":
          case "8":
          case "9": {
            lastValidIndex = i;
            break;
          }
          case "e":
          case "E":
          case "-":
          case ".": {
            break;
          }
          case ",": {
            stack.pop();
            if (stack[stack.length - 1] === "INSIDE_ARRAY_AFTER_VALUE") {
              processAfterArrayValue(char, i);
            }
            if (stack[stack.length - 1] === "INSIDE_OBJECT_AFTER_VALUE") {
              processAfterObjectValue(char, i);
            }
            break;
          }
          case "}": {
            stack.pop();
            if (stack[stack.length - 1] === "INSIDE_OBJECT_AFTER_VALUE") {
              processAfterObjectValue(char, i);
            }
            break;
          }
          case "]": {
            stack.pop();
            if (stack[stack.length - 1] === "INSIDE_ARRAY_AFTER_VALUE") {
              processAfterArrayValue(char, i);
            }
            break;
          }
          default: {
            stack.pop();
            break;
          }
        }
        break;
      }
      case "INSIDE_LITERAL": {
        const partialLiteral = input.substring(literalStart, i + 1);
        if (!"false".startsWith(partialLiteral) && !"true".startsWith(partialLiteral) && !"null".startsWith(partialLiteral)) {
          stack.pop();
          if (stack[stack.length - 1] === "INSIDE_OBJECT_AFTER_VALUE") {
            processAfterObjectValue(char, i);
          } else if (stack[stack.length - 1] === "INSIDE_ARRAY_AFTER_VALUE") {
            processAfterArrayValue(char, i);
          }
        } else {
          lastValidIndex = i;
        }
        break;
      }
    }
  }
  let result = input.slice(0, lastValidIndex + 1);
  for (let i = stack.length - 1; i >= 0; i--) {
    const state = stack[i];
    switch (state) {
      case "INSIDE_STRING": {
        result += '"';
        break;
      }
      case "INSIDE_OBJECT_KEY":
      case "INSIDE_OBJECT_AFTER_KEY":
      case "INSIDE_OBJECT_AFTER_COMMA":
      case "INSIDE_OBJECT_START":
      case "INSIDE_OBJECT_BEFORE_VALUE":
      case "INSIDE_OBJECT_AFTER_VALUE": {
        result += "}";
        break;
      }
      case "INSIDE_ARRAY_START":
      case "INSIDE_ARRAY_AFTER_COMMA":
      case "INSIDE_ARRAY_AFTER_VALUE": {
        result += "]";
        break;
      }
      case "INSIDE_LITERAL": {
        const partialLiteral = input.substring(literalStart, input.length);
        if ("true".startsWith(partialLiteral)) {
          result += "true".slice(partialLiteral.length);
        } else if ("false".startsWith(partialLiteral)) {
          result += "false".slice(partialLiteral.length);
        } else if ("null".startsWith(partialLiteral)) {
          result += "null".slice(partialLiteral.length);
        }
      }
    }
  }
  return result;
}
async function parsePartialJson(jsonText) {
  if (jsonText === void 0) {
    return { value: void 0, state: "undefined-input" };
  }
  let result = await safeParseJSON$1({ text: jsonText });
  if (result.success) {
    return { value: result.value, state: "successful-parse" };
  }
  result = await safeParseJSON$1({ text: fixJson(jsonText) });
  if (result.success) {
    return { value: result.value, state: "repaired-parse" };
  }
  return { value: void 0, state: "failed-parse" };
}
var text = () => ({
  name: "text",
  responseFormat: Promise.resolve({ type: "text" }),
  async parseCompleteOutput({ text: text2 }) {
    return text2;
  },
  async parsePartialOutput({ text: text2 }) {
    return { partial: text2 };
  },
  createElementStreamTransform() {
    return void 0;
  }
});
var object = ({
  schema: inputSchema,
  name: name21,
  description
}) => {
  const schema = asSchema$1(inputSchema);
  return {
    name: "object",
    responseFormat: resolve$1(schema.jsonSchema).then((jsonSchema2) => ({
      type: "json",
      schema: jsonSchema2,
      ...name21 != null && { name: name21 },
      ...description != null && { description }
    })),
    async parseCompleteOutput({ text: text2 }, context2) {
      const parseResult = await safeParseJSON$1({ text: text2 });
      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: could not parse the response.",
          cause: parseResult.error,
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      const validationResult = await safeValidateTypes$1({
        value: parseResult.value,
        schema
      });
      if (!validationResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: response did not match schema.",
          cause: validationResult.error,
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      return validationResult.value;
    },
    async parsePartialOutput({ text: text2 }) {
      const result = await parsePartialJson(text2);
      switch (result.state) {
        case "failed-parse":
        case "undefined-input": {
          return void 0;
        }
        case "repaired-parse":
        case "successful-parse": {
          return {
            // Note: currently no validation of partial results:
            partial: result.value
          };
        }
      }
    },
    createElementStreamTransform() {
      return void 0;
    }
  };
};
var array = ({
  element: inputElementSchema,
  name: name21,
  description
}) => {
  const elementSchema = asSchema$1(inputElementSchema);
  return {
    name: "array",
    // JSON schema that describes an array of elements:
    responseFormat: resolve$1(elementSchema.jsonSchema).then((jsonSchema2) => {
      const { $schema, ...itemSchema } = jsonSchema2;
      return {
        type: "json",
        schema: {
          $schema: "http://json-schema.org/draft-07/schema#",
          type: "object",
          properties: {
            elements: { type: "array", items: itemSchema }
          },
          required: ["elements"],
          additionalProperties: false
        },
        ...name21 != null && { name: name21 },
        ...description != null && { description }
      };
    }),
    async parseCompleteOutput({ text: text2 }, context2) {
      const parseResult = await safeParseJSON$1({ text: text2 });
      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: could not parse the response.",
          cause: parseResult.error,
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      const outerValue = parseResult.value;
      if (outerValue == null || typeof outerValue !== "object" || !("elements" in outerValue) || !Array.isArray(outerValue.elements)) {
        throw new NoObjectGeneratedError({
          message: "No object generated: response did not match schema.",
          cause: new TypeValidationError$1({
            value: outerValue,
            cause: "response must be an object with an elements array"
          }),
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      for (const element of outerValue.elements) {
        const validationResult = await safeValidateTypes$1({
          value: element,
          schema: elementSchema
        });
        if (!validationResult.success) {
          throw new NoObjectGeneratedError({
            message: "No object generated: response did not match schema.",
            cause: validationResult.error,
            text: text2,
            response: context2.response,
            usage: context2.usage,
            finishReason: context2.finishReason
          });
        }
      }
      return outerValue.elements;
    },
    async parsePartialOutput({ text: text2 }) {
      const result = await parsePartialJson(text2);
      switch (result.state) {
        case "failed-parse":
        case "undefined-input": {
          return void 0;
        }
        case "repaired-parse":
        case "successful-parse": {
          const outerValue = result.value;
          if (outerValue == null || typeof outerValue !== "object" || !("elements" in outerValue) || !Array.isArray(outerValue.elements)) {
            return void 0;
          }
          const rawElements = result.state === "repaired-parse" && outerValue.elements.length > 0 ? outerValue.elements.slice(0, -1) : outerValue.elements;
          const parsedElements = [];
          for (const rawElement of rawElements) {
            const validationResult = await safeValidateTypes$1({
              value: rawElement,
              schema: elementSchema
            });
            if (validationResult.success) {
              parsedElements.push(validationResult.value);
            }
          }
          return { partial: parsedElements };
        }
      }
    },
    createElementStreamTransform() {
      let publishedElements = 0;
      return new TransformStream({
        transform({ partialOutput }, controller) {
          if (partialOutput != null) {
            for (; publishedElements < partialOutput.length; publishedElements++) {
              controller.enqueue(partialOutput[publishedElements]);
            }
          }
        }
      });
    }
  };
};
var choice = ({
  options: choiceOptions,
  name: name21,
  description
}) => {
  return {
    name: "choice",
    // JSON schema that describes an enumeration:
    responseFormat: Promise.resolve({
      type: "json",
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          result: { type: "string", enum: choiceOptions }
        },
        required: ["result"],
        additionalProperties: false
      },
      ...name21 != null && { name: name21 },
      ...description != null && { description }
    }),
    async parseCompleteOutput({ text: text2 }, context2) {
      const parseResult = await safeParseJSON$1({ text: text2 });
      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: could not parse the response.",
          cause: parseResult.error,
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      const outerValue = parseResult.value;
      if (outerValue == null || typeof outerValue !== "object" || !("result" in outerValue) || typeof outerValue.result !== "string" || !choiceOptions.includes(outerValue.result)) {
        throw new NoObjectGeneratedError({
          message: "No object generated: response did not match schema.",
          cause: new TypeValidationError$1({
            value: outerValue,
            cause: "response must be an object that contains a choice value."
          }),
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      return outerValue.result;
    },
    async parsePartialOutput({ text: text2 }) {
      const result = await parsePartialJson(text2);
      switch (result.state) {
        case "failed-parse":
        case "undefined-input": {
          return void 0;
        }
        case "repaired-parse":
        case "successful-parse": {
          const outerValue = result.value;
          if (outerValue == null || typeof outerValue !== "object" || !("result" in outerValue) || typeof outerValue.result !== "string") {
            return void 0;
          }
          const potentialMatches = choiceOptions.filter(
            (choiceOption) => choiceOption.startsWith(outerValue.result)
          );
          if (result.state === "successful-parse") {
            return potentialMatches.includes(outerValue.result) ? { partial: outerValue.result } : void 0;
          } else {
            return potentialMatches.length === 1 ? { partial: potentialMatches[0] } : void 0;
          }
        }
      }
    },
    createElementStreamTransform() {
      return void 0;
    }
  };
};
var json = ({
  name: name21,
  description
} = {}) => {
  return {
    name: "json",
    responseFormat: Promise.resolve({
      type: "json",
      ...name21 != null && { name: name21 },
      ...description != null && { description }
    }),
    async parseCompleteOutput({ text: text2 }, context2) {
      const parseResult = await safeParseJSON$1({ text: text2 });
      if (!parseResult.success) {
        throw new NoObjectGeneratedError({
          message: "No object generated: could not parse the response.",
          cause: parseResult.error,
          text: text2,
          response: context2.response,
          usage: context2.usage,
          finishReason: context2.finishReason
        });
      }
      return parseResult.value;
    },
    async parsePartialOutput({ text: text2 }) {
      const result = await parsePartialJson(text2);
      switch (result.state) {
        case "failed-parse":
        case "undefined-input": {
          return void 0;
        }
        case "repaired-parse":
        case "successful-parse": {
          return result.value === void 0 ? void 0 : { partial: result.value };
        }
      }
    },
    createElementStreamTransform() {
      return void 0;
    }
  };
};
async function parseToolCall({
  toolCall,
  tools,
  repairToolCall,
  system,
  messages
}) {
  var _a21;
  try {
    if (tools == null) {
      if (toolCall.providerExecuted && toolCall.dynamic) {
        return await parseProviderExecutedDynamicToolCall(toolCall);
      }
      throw new NoSuchToolError({ toolName: toolCall.toolName });
    }
    try {
      return await doParseToolCall({ toolCall, tools });
    } catch (error) {
      if (repairToolCall == null || !(NoSuchToolError.isInstance(error) || InvalidToolInputError.isInstance(error))) {
        throw error;
      }
      let repairedToolCall = null;
      try {
        repairedToolCall = await repairToolCall({
          toolCall,
          tools,
          inputSchema: async ({ toolName }) => {
            const { inputSchema } = tools[toolName];
            return await asSchema$1(inputSchema).jsonSchema;
          },
          system,
          messages,
          error
        });
      } catch (repairError) {
        throw new ToolCallRepairError({
          cause: repairError,
          originalError: error
        });
      }
      if (repairedToolCall == null) {
        throw error;
      }
      return await doParseToolCall({ toolCall: repairedToolCall, tools });
    }
  } catch (error) {
    const parsedInput = await safeParseJSON$1({ text: toolCall.input });
    const input = parsedInput.success ? parsedInput.value : toolCall.input;
    return {
      type: "tool-call",
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input,
      dynamic: true,
      invalid: true,
      error,
      title: (_a21 = tools == null ? void 0 : tools[toolCall.toolName]) == null ? void 0 : _a21.title,
      providerExecuted: toolCall.providerExecuted,
      providerMetadata: toolCall.providerMetadata
    };
  }
}
async function parseProviderExecutedDynamicToolCall(toolCall) {
  const parseResult = toolCall.input.trim() === "" ? { success: true, value: {} } : await safeParseJSON$1({ text: toolCall.input });
  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName: toolCall.toolName,
      toolInput: toolCall.input,
      cause: parseResult.error
    });
  }
  return {
    type: "tool-call",
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: parseResult.value,
    providerExecuted: true,
    dynamic: true,
    providerMetadata: toolCall.providerMetadata
  };
}
async function doParseToolCall({
  toolCall,
  tools
}) {
  const toolName = toolCall.toolName;
  const tool2 = tools[toolName];
  if (tool2 == null) {
    if (toolCall.providerExecuted && toolCall.dynamic) {
      return await parseProviderExecutedDynamicToolCall(toolCall);
    }
    throw new NoSuchToolError({
      toolName: toolCall.toolName,
      availableTools: Object.keys(tools)
    });
  }
  const schema = asSchema$1(tool2.inputSchema);
  const parseResult = toolCall.input.trim() === "" ? await safeValidateTypes$1({ value: {}, schema }) : await safeParseJSON$1({ text: toolCall.input, schema });
  if (parseResult.success === false) {
    throw new InvalidToolInputError({
      toolName,
      toolInput: toolCall.input,
      cause: parseResult.error
    });
  }
  return tool2.type === "dynamic" ? {
    type: "tool-call",
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: parseResult.value,
    providerExecuted: toolCall.providerExecuted,
    providerMetadata: toolCall.providerMetadata,
    dynamic: true,
    title: tool2.title
  } : {
    type: "tool-call",
    toolCallId: toolCall.toolCallId,
    toolName,
    input: parseResult.value,
    providerExecuted: toolCall.providerExecuted,
    providerMetadata: toolCall.providerMetadata,
    title: tool2.title
  };
}
var DefaultStepResult = class {
  constructor({
    stepNumber,
    model,
    functionId,
    metadata,
    experimental_context,
    content,
    finishReason,
    rawFinishReason,
    usage,
    warnings,
    request,
    response,
    providerMetadata
  }) {
    this.stepNumber = stepNumber;
    this.model = model;
    this.functionId = functionId;
    this.metadata = metadata;
    this.experimental_context = experimental_context;
    this.content = content;
    this.finishReason = finishReason;
    this.rawFinishReason = rawFinishReason;
    this.usage = usage;
    this.warnings = warnings;
    this.request = request;
    this.response = response;
    this.providerMetadata = providerMetadata;
  }
  get text() {
    return this.content.filter((part) => part.type === "text").map((part) => part.text).join("");
  }
  get reasoning() {
    return this.content.filter((part) => part.type === "reasoning");
  }
  get reasoningText() {
    return this.reasoning.length === 0 ? void 0 : this.reasoning.map((part) => part.text).join("");
  }
  get files() {
    return this.content.filter((part) => part.type === "file").map((part) => part.file);
  }
  get sources() {
    return this.content.filter((part) => part.type === "source");
  }
  get toolCalls() {
    return this.content.filter((part) => part.type === "tool-call");
  }
  get staticToolCalls() {
    return this.toolCalls.filter(
      (toolCall) => toolCall.dynamic !== true
    );
  }
  get dynamicToolCalls() {
    return this.toolCalls.filter(
      (toolCall) => toolCall.dynamic === true
    );
  }
  get toolResults() {
    return this.content.filter((part) => part.type === "tool-result");
  }
  get staticToolResults() {
    return this.toolResults.filter(
      (toolResult) => toolResult.dynamic !== true
    );
  }
  get dynamicToolResults() {
    return this.toolResults.filter(
      (toolResult) => toolResult.dynamic === true
    );
  }
};
function stepCountIs(stepCount) {
  return ({ steps }) => steps.length === stepCount;
}
function hasToolCall(toolName) {
  return ({ steps }) => {
    var _a21, _b15, _c;
    return (_c = (_b15 = (_a21 = steps[steps.length - 1]) == null ? void 0 : _a21.toolCalls) == null ? void 0 : _b15.some(
      (toolCall) => toolCall.toolName === toolName
    )) != null ? _c : false;
  };
}
async function isStopConditionMet({
  stopConditions,
  steps
}) {
  return (await Promise.all(stopConditions.map((condition) => condition({ steps })))).some((result) => result);
}
async function toResponseMessages({
  content: inputContent,
  tools
}) {
  const responseMessages = [];
  const content = [];
  for (const part of inputContent) {
    if (part.type === "source") {
      continue;
    }
    if ((part.type === "tool-result" || part.type === "tool-error") && !part.providerExecuted) {
      continue;
    }
    if (part.type === "text" && part.text.length === 0) {
      continue;
    }
    switch (part.type) {
      case "text":
        content.push({
          type: "text",
          text: part.text,
          providerOptions: part.providerMetadata
        });
        break;
      case "reasoning":
        content.push({
          type: "reasoning",
          text: part.text,
          providerOptions: part.providerMetadata
        });
        break;
      case "file":
        content.push({
          type: "file",
          data: part.file.base64,
          mediaType: part.file.mediaType,
          providerOptions: part.providerMetadata
        });
        break;
      case "tool-call":
        content.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          input: part.input,
          providerExecuted: part.providerExecuted,
          providerOptions: part.providerMetadata
        });
        break;
      case "tool-result": {
        const output = await createToolModelOutput({
          toolCallId: part.toolCallId,
          input: part.input,
          tool: tools == null ? void 0 : tools[part.toolName],
          output: part.output,
          errorMode: "none"
        });
        content.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output,
          providerOptions: part.providerMetadata
        });
        break;
      }
      case "tool-error": {
        const output = await createToolModelOutput({
          toolCallId: part.toolCallId,
          input: part.input,
          tool: tools == null ? void 0 : tools[part.toolName],
          output: part.error,
          errorMode: "json"
        });
        content.push({
          type: "tool-result",
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          output,
          providerOptions: part.providerMetadata
        });
        break;
      }
      case "tool-approval-request":
        content.push({
          type: "tool-approval-request",
          approvalId: part.approvalId,
          toolCallId: part.toolCall.toolCallId
        });
        break;
    }
  }
  if (content.length > 0) {
    responseMessages.push({
      role: "assistant",
      content
    });
  }
  const toolResultContent = [];
  for (const part of inputContent) {
    if (!(part.type === "tool-result" || part.type === "tool-error") || part.providerExecuted) {
      continue;
    }
    const output = await createToolModelOutput({
      toolCallId: part.toolCallId,
      input: part.input,
      tool: tools == null ? void 0 : tools[part.toolName],
      output: part.type === "tool-result" ? part.output : part.error,
      errorMode: part.type === "tool-error" ? "text" : "none"
    });
    toolResultContent.push({
      type: "tool-result",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      output,
      ...part.providerMetadata != null ? { providerOptions: part.providerMetadata } : {}
    });
  }
  if (toolResultContent.length > 0) {
    responseMessages.push({
      role: "tool",
      content: toolResultContent
    });
  }
  return responseMessages;
}
function mergeAbortSignals(...signals) {
  const validSignals = signals.filter(
    (signal) => signal != null
  );
  if (validSignals.length === 0) {
    return void 0;
  }
  if (validSignals.length === 1) {
    return validSignals[0];
  }
  const controller = new AbortController();
  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        controller.abort(signal.reason);
      },
      { once: true }
    );
  }
  return controller.signal;
}
var originalGenerateId = createIdGenerator$1({
  prefix: "aitxt",
  size: 24
});
async function generateText({
  model: modelArg,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries: maxRetriesArg,
  abortSignal,
  timeout,
  headers,
  stopWhen = stepCountIs(1),
  experimental_output,
  output = experimental_output,
  experimental_telemetry: telemetry,
  providerOptions,
  experimental_activeTools,
  activeTools = experimental_activeTools,
  experimental_prepareStep,
  prepareStep = experimental_prepareStep,
  experimental_repairToolCall: repairToolCall,
  experimental_download: download2,
  experimental_context,
  experimental_include: include,
  _internal: { generateId: generateId2 = originalGenerateId } = {},
  experimental_onStart: onStart,
  experimental_onStepStart: onStepStart,
  experimental_onToolCallStart: onToolCallStart,
  experimental_onToolCallFinish: onToolCallFinish,
  onStepFinish,
  onFinish,
  ...settings
}) {
  const model = resolveLanguageModel(modelArg);
  const createGlobalTelemetry = getGlobalTelemetryIntegration();
  const stopConditions = asArray(stopWhen);
  const totalTimeoutMs = getTotalTimeoutMs(timeout);
  const stepTimeoutMs = getStepTimeoutMs(timeout);
  const stepAbortController = stepTimeoutMs != null ? new AbortController() : void 0;
  const mergedAbortSignal = mergeAbortSignals(
    abortSignal,
    totalTimeoutMs != null ? AbortSignal.timeout(totalTimeoutMs) : void 0,
    stepAbortController == null ? void 0 : stepAbortController.signal
  );
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal: mergedAbortSignal
  });
  const callSettings = prepareCallSettings(settings);
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
    settings: { ...callSettings, maxRetries }
  });
  const modelInfo = { provider: model.provider, modelId: model.modelId };
  const initialPrompt = await standardizePrompt({
    system,
    prompt,
    messages
  });
  const globalTelemetry = createGlobalTelemetry(telemetry == null ? void 0 : telemetry.integrations);
  await notify({
    event: {
      model: modelInfo,
      system,
      prompt,
      messages,
      tools,
      toolChoice,
      activeTools,
      maxOutputTokens: callSettings.maxOutputTokens,
      temperature: callSettings.temperature,
      topP: callSettings.topP,
      topK: callSettings.topK,
      presencePenalty: callSettings.presencePenalty,
      frequencyPenalty: callSettings.frequencyPenalty,
      stopSequences: callSettings.stopSequences,
      seed: callSettings.seed,
      maxRetries,
      timeout,
      headers,
      providerOptions,
      stopWhen,
      output,
      abortSignal,
      include,
      functionId: telemetry == null ? void 0 : telemetry.functionId,
      metadata: telemetry == null ? void 0 : telemetry.metadata,
      experimental_context
    },
    callbacks: [
      onStart,
      globalTelemetry.onStart
    ]
  });
  const tracer = getTracer(telemetry);
  try {
    return await recordSpan({
      name: "ai.generateText",
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: "ai.generateText",
            telemetry
          }),
          ...baseTelemetryAttributes,
          // model:
          "ai.model.provider": model.provider,
          "ai.model.id": model.modelId,
          // specific settings that only make sense on the outer level:
          "ai.prompt": {
            input: () => JSON.stringify({ system, prompt, messages })
          }
        }
      }),
      tracer,
      fn: async (span) => {
        var _a21, _b15, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
        const initialMessages = initialPrompt.messages;
        const responseMessages = [];
        const { approvedToolApprovals, deniedToolApprovals } = collectToolApprovals({ messages: initialMessages });
        const localApprovedToolApprovals = approvedToolApprovals.filter(
          (toolApproval) => !toolApproval.toolCall.providerExecuted
        );
        if (deniedToolApprovals.length > 0 || localApprovedToolApprovals.length > 0) {
          const toolOutputs = await executeTools({
            toolCalls: localApprovedToolApprovals.map(
              (toolApproval) => toolApproval.toolCall
            ),
            tools,
            tracer,
            telemetry,
            messages: initialMessages,
            abortSignal: mergedAbortSignal,
            experimental_context,
            stepNumber: 0,
            model: modelInfo,
            onToolCallStart: [
              onToolCallStart,
              globalTelemetry.onToolCallStart
            ],
            onToolCallFinish: [
              onToolCallFinish,
              globalTelemetry.onToolCallFinish
            ]
          });
          const toolContent = [];
          for (const output2 of toolOutputs) {
            const modelOutput = await createToolModelOutput({
              toolCallId: output2.toolCallId,
              input: output2.input,
              tool: tools == null ? void 0 : tools[output2.toolName],
              output: output2.type === "tool-result" ? output2.output : output2.error,
              errorMode: output2.type === "tool-error" ? "text" : "none"
            });
            toolContent.push({
              type: "tool-result",
              toolCallId: output2.toolCallId,
              toolName: output2.toolName,
              output: modelOutput
            });
          }
          for (const toolApproval of deniedToolApprovals) {
            toolContent.push({
              type: "tool-result",
              toolCallId: toolApproval.toolCall.toolCallId,
              toolName: toolApproval.toolCall.toolName,
              output: {
                type: "execution-denied",
                reason: toolApproval.approvalResponse.reason,
                // For provider-executed tools, include approvalId so provider can correlate
                ...toolApproval.toolCall.providerExecuted && {
                  providerOptions: {
                    openai: {
                      approvalId: toolApproval.approvalResponse.approvalId
                    }
                  }
                }
              }
            });
          }
          responseMessages.push({
            role: "tool",
            content: toolContent
          });
        }
        const providerExecutedToolApprovals = [
          ...approvedToolApprovals,
          ...deniedToolApprovals
        ].filter((toolApproval) => toolApproval.toolCall.providerExecuted);
        if (providerExecutedToolApprovals.length > 0) {
          responseMessages.push({
            role: "tool",
            content: providerExecutedToolApprovals.map(
              (toolApproval) => ({
                type: "tool-approval-response",
                approvalId: toolApproval.approvalResponse.approvalId,
                approved: toolApproval.approvalResponse.approved,
                reason: toolApproval.approvalResponse.reason,
                providerExecuted: true
              })
            )
          });
        }
        const callSettings2 = prepareCallSettings(settings);
        let currentModelResponse;
        let clientToolCalls = [];
        let clientToolOutputs = [];
        const steps = [];
        const pendingDeferredToolCalls = /* @__PURE__ */ new Map();
        do {
          const stepTimeoutId = stepTimeoutMs != null ? setTimeout(() => stepAbortController.abort(), stepTimeoutMs) : void 0;
          try {
            const stepInputMessages = [...initialMessages, ...responseMessages];
            const prepareStepResult = await (prepareStep == null ? void 0 : prepareStep({
              model,
              steps,
              stepNumber: steps.length,
              messages: stepInputMessages,
              experimental_context
            }));
            const stepModel = resolveLanguageModel(
              (_a21 = prepareStepResult == null ? void 0 : prepareStepResult.model) != null ? _a21 : model
            );
            const stepModelInfo = {
              provider: stepModel.provider,
              modelId: stepModel.modelId
            };
            const promptMessages = await convertToLanguageModelPrompt({
              prompt: {
                system: (_b15 = prepareStepResult == null ? void 0 : prepareStepResult.system) != null ? _b15 : initialPrompt.system,
                messages: (_c = prepareStepResult == null ? void 0 : prepareStepResult.messages) != null ? _c : stepInputMessages
              },
              supportedUrls: await stepModel.supportedUrls,
              download: download2
            });
            experimental_context = (_d = prepareStepResult == null ? void 0 : prepareStepResult.experimental_context) != null ? _d : experimental_context;
            const stepActiveTools = (_e = prepareStepResult == null ? void 0 : prepareStepResult.activeTools) != null ? _e : activeTools;
            const { toolChoice: stepToolChoice, tools: stepTools } = await prepareToolsAndToolChoice({
              tools,
              toolChoice: (_f = prepareStepResult == null ? void 0 : prepareStepResult.toolChoice) != null ? _f : toolChoice,
              activeTools: stepActiveTools
            });
            const stepMessages = (_g = prepareStepResult == null ? void 0 : prepareStepResult.messages) != null ? _g : stepInputMessages;
            const stepSystem = (_h = prepareStepResult == null ? void 0 : prepareStepResult.system) != null ? _h : initialPrompt.system;
            const stepProviderOptions = mergeObjects(
              providerOptions,
              prepareStepResult == null ? void 0 : prepareStepResult.providerOptions
            );
            await notify({
              event: {
                stepNumber: steps.length,
                model: stepModelInfo,
                system: stepSystem,
                messages: stepMessages,
                tools,
                toolChoice: stepToolChoice,
                activeTools: stepActiveTools,
                steps: [...steps],
                providerOptions: stepProviderOptions,
                timeout,
                headers,
                stopWhen,
                output,
                abortSignal,
                include,
                functionId: telemetry == null ? void 0 : telemetry.functionId,
                metadata: telemetry == null ? void 0 : telemetry.metadata,
                experimental_context
              },
              callbacks: [
                onStepStart,
                globalTelemetry.onStepStart
              ]
            });
            currentModelResponse = await retry(
              () => {
                var _a22;
                return recordSpan({
                  name: "ai.generateText.doGenerate",
                  attributes: selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      ...assembleOperationName({
                        operationId: "ai.generateText.doGenerate",
                        telemetry
                      }),
                      ...baseTelemetryAttributes,
                      // model:
                      "ai.model.provider": stepModel.provider,
                      "ai.model.id": stepModel.modelId,
                      // prompt:
                      "ai.prompt.messages": {
                        input: () => stringifyForTelemetry(promptMessages)
                      },
                      "ai.prompt.tools": {
                        // convert the language model level tools:
                        input: () => stepTools == null ? void 0 : stepTools.map((tool2) => JSON.stringify(tool2))
                      },
                      "ai.prompt.toolChoice": {
                        input: () => stepToolChoice != null ? JSON.stringify(stepToolChoice) : void 0
                      },
                      // standardized gen-ai llm span attributes:
                      "gen_ai.system": stepModel.provider,
                      "gen_ai.request.model": stepModel.modelId,
                      "gen_ai.request.frequency_penalty": settings.frequencyPenalty,
                      "gen_ai.request.max_tokens": settings.maxOutputTokens,
                      "gen_ai.request.presence_penalty": settings.presencePenalty,
                      "gen_ai.request.stop_sequences": settings.stopSequences,
                      "gen_ai.request.temperature": (_a22 = settings.temperature) != null ? _a22 : void 0,
                      "gen_ai.request.top_k": settings.topK,
                      "gen_ai.request.top_p": settings.topP
                    }
                  }),
                  tracer,
                  fn: async (span2) => {
                    var _a23, _b22, _c2, _d2, _e2, _f2, _g2, _h2;
                    const result = await stepModel.doGenerate({
                      ...callSettings2,
                      tools: stepTools,
                      toolChoice: stepToolChoice,
                      responseFormat: await (output == null ? void 0 : output.responseFormat),
                      prompt: promptMessages,
                      providerOptions: stepProviderOptions,
                      abortSignal: mergedAbortSignal,
                      headers: headersWithUserAgent
                    });
                    const responseData = {
                      id: (_b22 = (_a23 = result.response) == null ? void 0 : _a23.id) != null ? _b22 : generateId2(),
                      timestamp: (_d2 = (_c2 = result.response) == null ? void 0 : _c2.timestamp) != null ? _d2 : /* @__PURE__ */ new Date(),
                      modelId: (_f2 = (_e2 = result.response) == null ? void 0 : _e2.modelId) != null ? _f2 : stepModel.modelId,
                      headers: (_g2 = result.response) == null ? void 0 : _g2.headers,
                      body: (_h2 = result.response) == null ? void 0 : _h2.body
                    };
                    span2.setAttributes(
                      await selectTelemetryAttributes({
                        telemetry,
                        attributes: {
                          "ai.response.finishReason": result.finishReason.unified,
                          "ai.response.text": {
                            output: () => extractTextContent(result.content)
                          },
                          "ai.response.reasoning": {
                            output: () => extractReasoningContent(result.content)
                          },
                          "ai.response.toolCalls": {
                            output: () => {
                              const toolCalls = asToolCalls(result.content);
                              return toolCalls == null ? void 0 : JSON.stringify(toolCalls);
                            }
                          },
                          "ai.response.id": responseData.id,
                          "ai.response.model": responseData.modelId,
                          "ai.response.timestamp": responseData.timestamp.toISOString(),
                          "ai.response.providerMetadata": JSON.stringify(
                            result.providerMetadata
                          ),
                          // TODO rename telemetry attributes to inputTokens and outputTokens
                          "ai.usage.promptTokens": result.usage.inputTokens.total,
                          "ai.usage.completionTokens": result.usage.outputTokens.total,
                          // standardized gen-ai llm span attributes:
                          "gen_ai.response.finish_reasons": [
                            result.finishReason.unified
                          ],
                          "gen_ai.response.id": responseData.id,
                          "gen_ai.response.model": responseData.modelId,
                          "gen_ai.usage.input_tokens": result.usage.inputTokens.total,
                          "gen_ai.usage.output_tokens": result.usage.outputTokens.total
                        }
                      })
                    );
                    return { ...result, response: responseData };
                  }
                });
              }
            );
            const stepToolCalls = await Promise.all(
              currentModelResponse.content.filter(
                (part) => part.type === "tool-call"
              ).map(
                (toolCall) => parseToolCall({
                  toolCall,
                  tools,
                  repairToolCall,
                  system,
                  messages: stepInputMessages
                })
              )
            );
            const toolApprovalRequests = {};
            for (const toolCall of stepToolCalls) {
              if (toolCall.invalid) {
                continue;
              }
              const tool2 = tools == null ? void 0 : tools[toolCall.toolName];
              if (tool2 == null) {
                continue;
              }
              if ((tool2 == null ? void 0 : tool2.onInputAvailable) != null) {
                await tool2.onInputAvailable({
                  input: toolCall.input,
                  toolCallId: toolCall.toolCallId,
                  messages: stepInputMessages,
                  abortSignal: mergedAbortSignal,
                  experimental_context
                });
              }
              if (await isApprovalNeeded({
                tool: tool2,
                toolCall,
                messages: stepInputMessages,
                experimental_context
              })) {
                toolApprovalRequests[toolCall.toolCallId] = {
                  type: "tool-approval-request",
                  approvalId: generateId2(),
                  toolCall
                };
              }
            }
            const invalidToolCalls = stepToolCalls.filter(
              (toolCall) => toolCall.invalid && toolCall.dynamic
            );
            clientToolOutputs = [];
            for (const toolCall of invalidToolCalls) {
              clientToolOutputs.push({
                type: "tool-error",
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
                error: getErrorMessage$1(toolCall.error),
                dynamic: true
              });
            }
            clientToolCalls = stepToolCalls.filter(
              (toolCall) => !toolCall.providerExecuted
            );
            if (tools != null) {
              clientToolOutputs.push(
                ...await executeTools({
                  toolCalls: clientToolCalls.filter(
                    (toolCall) => !toolCall.invalid && toolApprovalRequests[toolCall.toolCallId] == null
                  ),
                  tools,
                  tracer,
                  telemetry,
                  messages: stepInputMessages,
                  abortSignal: mergedAbortSignal,
                  experimental_context,
                  stepNumber: steps.length,
                  model: stepModelInfo,
                  onToolCallStart: [
                    onToolCallStart,
                    globalTelemetry.onToolCallStart
                  ],
                  onToolCallFinish: [
                    onToolCallFinish,
                    globalTelemetry.onToolCallFinish
                  ]
                })
              );
            }
            for (const toolCall of stepToolCalls) {
              if (!toolCall.providerExecuted)
                continue;
              const tool2 = tools == null ? void 0 : tools[toolCall.toolName];
              if ((tool2 == null ? void 0 : tool2.type) === "provider" && tool2.supportsDeferredResults) {
                const hasResultInResponse = currentModelResponse.content.some(
                  (part) => part.type === "tool-result" && part.toolCallId === toolCall.toolCallId
                );
                if (!hasResultInResponse) {
                  pendingDeferredToolCalls.set(toolCall.toolCallId, {
                    toolName: toolCall.toolName
                  });
                }
              }
            }
            for (const part of currentModelResponse.content) {
              if (part.type === "tool-result") {
                pendingDeferredToolCalls.delete(part.toolCallId);
              }
            }
            const stepContent = asContent({
              content: currentModelResponse.content,
              toolCalls: stepToolCalls,
              toolOutputs: clientToolOutputs,
              toolApprovalRequests: Object.values(toolApprovalRequests),
              tools
            });
            responseMessages.push(
              ...await toResponseMessages({
                content: stepContent,
                tools
              })
            );
            const stepRequest = ((_i = include == null ? void 0 : include.requestBody) != null ? _i : true) ? (_j = currentModelResponse.request) != null ? _j : {} : { ...currentModelResponse.request, body: void 0 };
            const stepResponse = {
              ...currentModelResponse.response,
              // deep clone msgs to avoid mutating past messages in multi-step:
              messages: structuredClone(responseMessages),
              // Conditionally include response body:
              body: ((_k = include == null ? void 0 : include.responseBody) != null ? _k : true) ? (_l = currentModelResponse.response) == null ? void 0 : _l.body : void 0
            };
            const stepNumber = steps.length;
            const currentStepResult = new DefaultStepResult({
              stepNumber,
              model: stepModelInfo,
              functionId: telemetry == null ? void 0 : telemetry.functionId,
              metadata: telemetry == null ? void 0 : telemetry.metadata,
              experimental_context,
              content: stepContent,
              finishReason: currentModelResponse.finishReason.unified,
              rawFinishReason: currentModelResponse.finishReason.raw,
              usage: asLanguageModelUsage(currentModelResponse.usage),
              warnings: currentModelResponse.warnings,
              providerMetadata: currentModelResponse.providerMetadata,
              request: stepRequest,
              response: stepResponse
            });
            logWarnings({
              warnings: (_m = currentModelResponse.warnings) != null ? _m : [],
              provider: stepModelInfo.provider,
              model: stepModelInfo.modelId
            });
            steps.push(currentStepResult);
            await notify({
              event: currentStepResult,
              callbacks: [onStepFinish, globalTelemetry.onStepFinish]
            });
          } finally {
            if (stepTimeoutId != null) {
              clearTimeout(stepTimeoutId);
            }
          }
        } while (
          // Continue if:
          // 1. There are client tool calls that have all been executed, OR
          // 2. There are pending deferred results from provider-executed tools
          (clientToolCalls.length > 0 && clientToolOutputs.length === clientToolCalls.length || pendingDeferredToolCalls.size > 0) && // continue until a stop condition is met:
          !await isStopConditionMet({ stopConditions, steps })
        );
        span.setAttributes(
          await selectTelemetryAttributes({
            telemetry,
            attributes: {
              "ai.response.finishReason": currentModelResponse.finishReason.unified,
              "ai.response.text": {
                output: () => extractTextContent(currentModelResponse.content)
              },
              "ai.response.reasoning": {
                output: () => extractReasoningContent(currentModelResponse.content)
              },
              "ai.response.toolCalls": {
                output: () => {
                  const toolCalls = asToolCalls(currentModelResponse.content);
                  return toolCalls == null ? void 0 : JSON.stringify(toolCalls);
                }
              },
              "ai.response.providerMetadata": JSON.stringify(
                currentModelResponse.providerMetadata
              ),
              // TODO rename telemetry attributes to inputTokens and outputTokens
              "ai.usage.promptTokens": currentModelResponse.usage.inputTokens.total,
              "ai.usage.completionTokens": currentModelResponse.usage.outputTokens.total
            }
          })
        );
        const lastStep = steps[steps.length - 1];
        const totalUsage = steps.reduce(
          (totalUsage2, step) => {
            return addLanguageModelUsage(totalUsage2, step.usage);
          },
          {
            inputTokens: void 0,
            outputTokens: void 0,
            totalTokens: void 0,
            reasoningTokens: void 0,
            cachedInputTokens: void 0
          }
        );
        await notify({
          event: {
            stepNumber: lastStep.stepNumber,
            model: lastStep.model,
            functionId: lastStep.functionId,
            metadata: lastStep.metadata,
            experimental_context: lastStep.experimental_context,
            finishReason: lastStep.finishReason,
            rawFinishReason: lastStep.rawFinishReason,
            usage: lastStep.usage,
            content: lastStep.content,
            text: lastStep.text,
            reasoningText: lastStep.reasoningText,
            reasoning: lastStep.reasoning,
            files: lastStep.files,
            sources: lastStep.sources,
            toolCalls: lastStep.toolCalls,
            staticToolCalls: lastStep.staticToolCalls,
            dynamicToolCalls: lastStep.dynamicToolCalls,
            toolResults: lastStep.toolResults,
            staticToolResults: lastStep.staticToolResults,
            dynamicToolResults: lastStep.dynamicToolResults,
            request: lastStep.request,
            response: lastStep.response,
            warnings: lastStep.warnings,
            providerMetadata: lastStep.providerMetadata,
            steps,
            totalUsage
          },
          callbacks: [
            onFinish,
            globalTelemetry.onFinish
          ]
        });
        let resolvedOutput;
        if (lastStep.finishReason === "stop") {
          const outputSpecification = output != null ? output : text();
          resolvedOutput = await outputSpecification.parseCompleteOutput(
            { text: lastStep.text },
            {
              response: lastStep.response,
              usage: lastStep.usage,
              finishReason: lastStep.finishReason
            }
          );
        }
        return new DefaultGenerateTextResult({
          steps,
          totalUsage,
          output: resolvedOutput
        });
      }
    });
  } catch (error) {
    throw wrapGatewayError(error);
  }
}
async function executeTools({
  toolCalls,
  tools,
  tracer,
  telemetry,
  messages,
  abortSignal,
  experimental_context,
  stepNumber,
  model,
  onToolCallStart,
  onToolCallFinish
}) {
  const toolOutputs = await Promise.all(
    toolCalls.map(
      async (toolCall) => executeToolCall({
        toolCall,
        tools,
        tracer,
        telemetry,
        messages,
        abortSignal,
        experimental_context,
        stepNumber,
        model,
        onToolCallStart,
        onToolCallFinish
      })
    )
  );
  return toolOutputs.filter(
    (output) => output != null
  );
}
var DefaultGenerateTextResult = class {
  constructor(options) {
    this.steps = options.steps;
    this._output = options.output;
    this.totalUsage = options.totalUsage;
  }
  get finalStep() {
    return this.steps[this.steps.length - 1];
  }
  get content() {
    return this.finalStep.content;
  }
  get text() {
    return this.finalStep.text;
  }
  get files() {
    return this.finalStep.files;
  }
  get reasoningText() {
    return this.finalStep.reasoningText;
  }
  get reasoning() {
    return this.finalStep.reasoning;
  }
  get toolCalls() {
    return this.finalStep.toolCalls;
  }
  get staticToolCalls() {
    return this.finalStep.staticToolCalls;
  }
  get dynamicToolCalls() {
    return this.finalStep.dynamicToolCalls;
  }
  get toolResults() {
    return this.finalStep.toolResults;
  }
  get staticToolResults() {
    return this.finalStep.staticToolResults;
  }
  get dynamicToolResults() {
    return this.finalStep.dynamicToolResults;
  }
  get sources() {
    return this.finalStep.sources;
  }
  get finishReason() {
    return this.finalStep.finishReason;
  }
  get rawFinishReason() {
    return this.finalStep.rawFinishReason;
  }
  get warnings() {
    return this.finalStep.warnings;
  }
  get providerMetadata() {
    return this.finalStep.providerMetadata;
  }
  get response() {
    return this.finalStep.response;
  }
  get request() {
    return this.finalStep.request;
  }
  get usage() {
    return this.finalStep.usage;
  }
  get experimental_output() {
    return this.output;
  }
  get output() {
    if (this._output == null) {
      throw new NoOutputGeneratedError();
    }
    return this._output;
  }
};
function asToolCalls(content) {
  const parts = content.filter(
    (part) => part.type === "tool-call"
  );
  if (parts.length === 0) {
    return void 0;
  }
  return parts.map((toolCall) => ({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toolCall.input
  }));
}
function asContent({
  content,
  toolCalls,
  toolOutputs,
  toolApprovalRequests,
  tools
}) {
  const contentParts = [];
  for (const part of content) {
    switch (part.type) {
      case "text":
      case "reasoning":
      case "source":
        contentParts.push(part);
        break;
      case "file": {
        contentParts.push({
          type: "file",
          file: new DefaultGeneratedFile(part),
          ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
        });
        break;
      }
      case "tool-call": {
        contentParts.push(
          toolCalls.find((toolCall) => toolCall.toolCallId === part.toolCallId)
        );
        break;
      }
      case "tool-result": {
        const toolCall = toolCalls.find(
          (toolCall2) => toolCall2.toolCallId === part.toolCallId
        );
        if (toolCall == null) {
          const tool2 = tools == null ? void 0 : tools[part.toolName];
          const supportsDeferredResults = (tool2 == null ? void 0 : tool2.type) === "provider" && tool2.supportsDeferredResults;
          if (!supportsDeferredResults) {
            throw new Error(`Tool call ${part.toolCallId} not found.`);
          }
          if (part.isError) {
            contentParts.push({
              type: "tool-error",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: void 0,
              error: part.result,
              providerExecuted: true,
              dynamic: part.dynamic
            });
          } else {
            contentParts.push({
              type: "tool-result",
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: void 0,
              output: part.result,
              providerExecuted: true,
              dynamic: part.dynamic
            });
          }
          break;
        }
        if (part.isError) {
          contentParts.push({
            type: "tool-error",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: toolCall.input,
            error: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic
          });
        } else {
          contentParts.push({
            type: "tool-result",
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: toolCall.input,
            output: part.result,
            providerExecuted: true,
            dynamic: toolCall.dynamic
          });
        }
        break;
      }
      case "tool-approval-request": {
        const toolCall = toolCalls.find(
          (toolCall2) => toolCall2.toolCallId === part.toolCallId
        );
        if (toolCall == null) {
          throw new ToolCallNotFoundForApprovalError({
            toolCallId: part.toolCallId,
            approvalId: part.approvalId
          });
        }
        contentParts.push({
          type: "tool-approval-request",
          approvalId: part.approvalId,
          toolCall
        });
        break;
      }
    }
  }
  return [...contentParts, ...toolOutputs, ...toolApprovalRequests];
}
function prepareHeaders(headers, defaultHeaders) {
  const responseHeaders = new Headers(headers != null ? headers : {});
  for (const [key, value] of Object.entries(defaultHeaders)) {
    if (!responseHeaders.has(key)) {
      responseHeaders.set(key, value);
    }
  }
  return responseHeaders;
}
function createTextStreamResponse({
  status,
  statusText,
  headers,
  textStream
}) {
  return new Response(textStream.pipeThrough(new TextEncoderStream()), {
    status: status != null ? status : 200,
    statusText,
    headers: prepareHeaders(headers, {
      "content-type": "text/plain; charset=utf-8"
    })
  });
}
function writeToServerResponse({
  response,
  status,
  statusText,
  headers,
  stream
}) {
  const statusCode = status != null ? status : 200;
  if (statusText !== void 0) {
    response.writeHead(statusCode, statusText, headers);
  } else {
    response.writeHead(statusCode, headers);
  }
  const reader = stream.getReader();
  const read = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done)
          break;
        const canContinue = response.write(value);
        if (!canContinue) {
          await new Promise((resolve3) => {
            response.once("drain", resolve3);
          });
        }
      }
    } catch (error) {
      throw error;
    } finally {
      response.end();
    }
  };
  read();
}
function pipeTextStreamToResponse({
  response,
  status,
  statusText,
  headers,
  textStream
}) {
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, {
        "content-type": "text/plain; charset=utf-8"
      }).entries()
    ),
    stream: textStream.pipeThrough(new TextEncoderStream())
  });
}
var JsonToSseTransformStream = class extends TransformStream {
  constructor() {
    super({
      transform(part, controller) {
        controller.enqueue(`data: ${JSON.stringify(part)}

`);
      },
      flush(controller) {
        controller.enqueue("data: [DONE]\n\n");
      }
    });
  }
};
var UI_MESSAGE_STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
  "x-vercel-ai-ui-message-stream": "v1",
  "x-accel-buffering": "no"
  // disable nginx buffering
};
function createUIMessageStreamResponse({
  status,
  statusText,
  headers,
  stream,
  consumeSseStream
}) {
  let sseStream = stream.pipeThrough(new JsonToSseTransformStream());
  if (consumeSseStream) {
    const [stream1, stream2] = sseStream.tee();
    sseStream = stream1;
    consumeSseStream({ stream: stream2 });
  }
  return new Response(sseStream.pipeThrough(new TextEncoderStream()), {
    status,
    statusText,
    headers: prepareHeaders(headers, UI_MESSAGE_STREAM_HEADERS)
  });
}
function getResponseUIMessageId({
  originalMessages,
  responseMessageId
}) {
  if (originalMessages == null) {
    return void 0;
  }
  const lastMessage = originalMessages[originalMessages.length - 1];
  return (lastMessage == null ? void 0 : lastMessage.role) === "assistant" ? lastMessage.id : typeof responseMessageId === "function" ? responseMessageId() : responseMessageId;
}
var uiMessageChunkSchema = lazySchema$1(
  () => zodSchema$1(
    union([
      strictObject({
        type: literal("text-start"),
        id: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("text-delta"),
        id: string(),
        delta: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("text-end"),
        id: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("error"),
        errorText: string()
      }),
      strictObject({
        type: literal("tool-input-start"),
        toolCallId: string(),
        toolName: string(),
        providerExecuted: boolean().optional(),
        providerMetadata: providerMetadataSchema.optional(),
        dynamic: boolean().optional(),
        title: string().optional()
      }),
      strictObject({
        type: literal("tool-input-delta"),
        toolCallId: string(),
        inputTextDelta: string()
      }),
      strictObject({
        type: literal("tool-input-available"),
        toolCallId: string(),
        toolName: string(),
        input: unknown(),
        providerExecuted: boolean().optional(),
        providerMetadata: providerMetadataSchema.optional(),
        dynamic: boolean().optional(),
        title: string().optional()
      }),
      strictObject({
        type: literal("tool-input-error"),
        toolCallId: string(),
        toolName: string(),
        input: unknown(),
        providerExecuted: boolean().optional(),
        providerMetadata: providerMetadataSchema.optional(),
        dynamic: boolean().optional(),
        errorText: string(),
        title: string().optional()
      }),
      strictObject({
        type: literal("tool-approval-request"),
        approvalId: string(),
        toolCallId: string()
      }),
      strictObject({
        type: literal("tool-output-available"),
        toolCallId: string(),
        output: unknown(),
        providerExecuted: boolean().optional(),
        dynamic: boolean().optional(),
        preliminary: boolean().optional()
      }),
      strictObject({
        type: literal("tool-output-error"),
        toolCallId: string(),
        errorText: string(),
        providerExecuted: boolean().optional(),
        dynamic: boolean().optional()
      }),
      strictObject({
        type: literal("tool-output-denied"),
        toolCallId: string()
      }),
      strictObject({
        type: literal("reasoning-start"),
        id: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("reasoning-delta"),
        id: string(),
        delta: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("reasoning-end"),
        id: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("source-url"),
        sourceId: string(),
        url: string(),
        title: string().optional(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("source-document"),
        sourceId: string(),
        mediaType: string(),
        title: string(),
        filename: string().optional(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: literal("file"),
        url: string(),
        mediaType: string(),
        providerMetadata: providerMetadataSchema.optional()
      }),
      strictObject({
        type: custom(
          (value) => typeof value === "string" && value.startsWith("data-"),
          { message: 'Type must start with "data-"' }
        ),
        id: string().optional(),
        data: unknown(),
        transient: boolean().optional()
      }),
      strictObject({
        type: literal("start-step")
      }),
      strictObject({
        type: literal("finish-step")
      }),
      strictObject({
        type: literal("start"),
        messageId: string().optional(),
        messageMetadata: unknown().optional()
      }),
      strictObject({
        type: literal("finish"),
        finishReason: _enum([
          "stop",
          "length",
          "content-filter",
          "tool-calls",
          "error",
          "other"
        ]).optional(),
        messageMetadata: unknown().optional()
      }),
      strictObject({
        type: literal("abort"),
        reason: string().optional()
      }),
      strictObject({
        type: literal("message-metadata"),
        messageMetadata: unknown()
      })
    ])
  )
);
function isDataUIMessageChunk(chunk) {
  return chunk.type.startsWith("data-");
}
function isDataUIPart(part) {
  return part.type.startsWith("data-");
}
function isTextUIPart(part) {
  return part.type === "text";
}
function isFileUIPart(part) {
  return part.type === "file";
}
function isReasoningUIPart(part) {
  return part.type === "reasoning";
}
function isStaticToolUIPart(part) {
  return part.type.startsWith("tool-");
}
function isDynamicToolUIPart(part) {
  return part.type === "dynamic-tool";
}
function isToolUIPart(part) {
  return isStaticToolUIPart(part) || isDynamicToolUIPart(part);
}
var isToolOrDynamicToolUIPart = isToolUIPart;
function getStaticToolName(part) {
  return part.type.split("-").slice(1).join("-");
}
function getToolName(part) {
  return isDynamicToolUIPart(part) ? part.toolName : getStaticToolName(part);
}
var getToolOrDynamicToolName = getToolName;
function createStreamingUIMessageState({
  lastMessage,
  messageId
}) {
  return {
    message: (lastMessage == null ? void 0 : lastMessage.role) === "assistant" ? lastMessage : {
      id: messageId,
      metadata: void 0,
      role: "assistant",
      parts: []
    },
    activeTextParts: {},
    activeReasoningParts: {},
    partialToolCalls: {}
  };
}
function processUIMessageStream({
  stream,
  messageMetadataSchema,
  dataPartSchemas,
  runUpdateMessageJob,
  onError,
  onToolCall,
  onData
}) {
  return stream.pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        await runUpdateMessageJob(async ({ state, write }) => {
          var _a21, _b15, _c, _d;
          function getToolInvocation(toolCallId) {
            const toolInvocations = state.message.parts.filter(isToolUIPart);
            const toolInvocation = toolInvocations.find(
              (invocation) => invocation.toolCallId === toolCallId
            );
            if (toolInvocation == null) {
              throw new UIMessageStreamError({
                chunkType: "tool-invocation",
                chunkId: toolCallId,
                message: `No tool invocation found for tool call ID "${toolCallId}".`
              });
            }
            return toolInvocation;
          }
          function updateToolPart(options) {
            var _a22;
            const part = state.message.parts.find(
              (part2) => isStaticToolUIPart(part2) && part2.toolCallId === options.toolCallId
            );
            const anyOptions = options;
            const anyPart = part;
            if (part != null) {
              part.state = options.state;
              anyPart.input = anyOptions.input;
              anyPart.output = anyOptions.output;
              anyPart.errorText = anyOptions.errorText;
              anyPart.rawInput = anyOptions.rawInput;
              anyPart.preliminary = anyOptions.preliminary;
              if (options.title !== void 0) {
                anyPart.title = options.title;
              }
              anyPart.providerExecuted = (_a22 = anyOptions.providerExecuted) != null ? _a22 : part.providerExecuted;
              if (anyOptions.providerMetadata != null) {
                part.callProviderMetadata = anyOptions.providerMetadata;
              }
            } else {
              state.message.parts.push({
                type: `tool-${options.toolName}`,
                toolCallId: options.toolCallId,
                state: options.state,
                title: options.title,
                input: anyOptions.input,
                output: anyOptions.output,
                rawInput: anyOptions.rawInput,
                errorText: anyOptions.errorText,
                providerExecuted: anyOptions.providerExecuted,
                preliminary: anyOptions.preliminary,
                ...anyOptions.providerMetadata != null ? { callProviderMetadata: anyOptions.providerMetadata } : {}
              });
            }
          }
          function updateDynamicToolPart(options) {
            var _a22, _b22;
            const part = state.message.parts.find(
              (part2) => part2.type === "dynamic-tool" && part2.toolCallId === options.toolCallId
            );
            const anyOptions = options;
            const anyPart = part;
            if (part != null) {
              part.state = options.state;
              anyPart.toolName = options.toolName;
              anyPart.input = anyOptions.input;
              anyPart.output = anyOptions.output;
              anyPart.errorText = anyOptions.errorText;
              anyPart.rawInput = (_a22 = anyOptions.rawInput) != null ? _a22 : anyPart.rawInput;
              anyPart.preliminary = anyOptions.preliminary;
              if (options.title !== void 0) {
                anyPart.title = options.title;
              }
              anyPart.providerExecuted = (_b22 = anyOptions.providerExecuted) != null ? _b22 : part.providerExecuted;
              if (anyOptions.providerMetadata != null) {
                part.callProviderMetadata = anyOptions.providerMetadata;
              }
            } else {
              state.message.parts.push({
                type: "dynamic-tool",
                toolName: options.toolName,
                toolCallId: options.toolCallId,
                state: options.state,
                input: anyOptions.input,
                output: anyOptions.output,
                errorText: anyOptions.errorText,
                preliminary: anyOptions.preliminary,
                providerExecuted: anyOptions.providerExecuted,
                title: options.title,
                ...anyOptions.providerMetadata != null ? { callProviderMetadata: anyOptions.providerMetadata } : {}
              });
            }
          }
          async function updateMessageMetadata(metadata) {
            if (metadata != null) {
              const mergedMetadata = state.message.metadata != null ? mergeObjects(state.message.metadata, metadata) : metadata;
              if (messageMetadataSchema != null) {
                await validateTypes$1({
                  value: mergedMetadata,
                  schema: messageMetadataSchema,
                  context: {
                    field: "message.metadata",
                    entityId: state.message.id
                  }
                });
              }
              state.message.metadata = mergedMetadata;
            }
          }
          switch (chunk.type) {
            case "text-start": {
              const textPart = {
                type: "text",
                text: "",
                providerMetadata: chunk.providerMetadata,
                state: "streaming"
              };
              state.activeTextParts[chunk.id] = textPart;
              state.message.parts.push(textPart);
              write();
              break;
            }
            case "text-delta": {
              const textPart = state.activeTextParts[chunk.id];
              if (textPart == null) {
                throw new UIMessageStreamError({
                  chunkType: "text-delta",
                  chunkId: chunk.id,
                  message: `Received text-delta for missing text part with ID "${chunk.id}". Ensure a "text-start" chunk is sent before any "text-delta" chunks.`
                });
              }
              textPart.text += chunk.delta;
              textPart.providerMetadata = (_a21 = chunk.providerMetadata) != null ? _a21 : textPart.providerMetadata;
              write();
              break;
            }
            case "text-end": {
              const textPart = state.activeTextParts[chunk.id];
              if (textPart == null) {
                throw new UIMessageStreamError({
                  chunkType: "text-end",
                  chunkId: chunk.id,
                  message: `Received text-end for missing text part with ID "${chunk.id}". Ensure a "text-start" chunk is sent before any "text-end" chunks.`
                });
              }
              textPart.state = "done";
              textPart.providerMetadata = (_b15 = chunk.providerMetadata) != null ? _b15 : textPart.providerMetadata;
              delete state.activeTextParts[chunk.id];
              write();
              break;
            }
            case "reasoning-start": {
              const reasoningPart = {
                type: "reasoning",
                text: "",
                providerMetadata: chunk.providerMetadata,
                state: "streaming"
              };
              state.activeReasoningParts[chunk.id] = reasoningPart;
              state.message.parts.push(reasoningPart);
              write();
              break;
            }
            case "reasoning-delta": {
              const reasoningPart = state.activeReasoningParts[chunk.id];
              if (reasoningPart == null) {
                throw new UIMessageStreamError({
                  chunkType: "reasoning-delta",
                  chunkId: chunk.id,
                  message: `Received reasoning-delta for missing reasoning part with ID "${chunk.id}". Ensure a "reasoning-start" chunk is sent before any "reasoning-delta" chunks.`
                });
              }
              reasoningPart.text += chunk.delta;
              reasoningPart.providerMetadata = (_c = chunk.providerMetadata) != null ? _c : reasoningPart.providerMetadata;
              write();
              break;
            }
            case "reasoning-end": {
              const reasoningPart = state.activeReasoningParts[chunk.id];
              if (reasoningPart == null) {
                throw new UIMessageStreamError({
                  chunkType: "reasoning-end",
                  chunkId: chunk.id,
                  message: `Received reasoning-end for missing reasoning part with ID "${chunk.id}". Ensure a "reasoning-start" chunk is sent before any "reasoning-end" chunks.`
                });
              }
              reasoningPart.providerMetadata = (_d = chunk.providerMetadata) != null ? _d : reasoningPart.providerMetadata;
              reasoningPart.state = "done";
              delete state.activeReasoningParts[chunk.id];
              write();
              break;
            }
            case "file": {
              state.message.parts.push({
                type: "file",
                mediaType: chunk.mediaType,
                url: chunk.url,
                ...chunk.providerMetadata != null ? { providerMetadata: chunk.providerMetadata } : {}
              });
              write();
              break;
            }
            case "source-url": {
              state.message.parts.push({
                type: "source-url",
                sourceId: chunk.sourceId,
                url: chunk.url,
                title: chunk.title,
                providerMetadata: chunk.providerMetadata
              });
              write();
              break;
            }
            case "source-document": {
              state.message.parts.push({
                type: "source-document",
                sourceId: chunk.sourceId,
                mediaType: chunk.mediaType,
                title: chunk.title,
                filename: chunk.filename,
                providerMetadata: chunk.providerMetadata
              });
              write();
              break;
            }
            case "tool-input-start": {
              const toolInvocations = state.message.parts.filter(isStaticToolUIPart);
              state.partialToolCalls[chunk.toolCallId] = {
                text: "",
                toolName: chunk.toolName,
                index: toolInvocations.length,
                dynamic: chunk.dynamic,
                title: chunk.title
              };
              if (chunk.dynamic) {
                updateDynamicToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  state: "input-streaming",
                  input: void 0,
                  providerExecuted: chunk.providerExecuted,
                  title: chunk.title,
                  providerMetadata: chunk.providerMetadata
                });
              } else {
                updateToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  state: "input-streaming",
                  input: void 0,
                  providerExecuted: chunk.providerExecuted,
                  title: chunk.title,
                  providerMetadata: chunk.providerMetadata
                });
              }
              write();
              break;
            }
            case "tool-input-delta": {
              const partialToolCall = state.partialToolCalls[chunk.toolCallId];
              if (partialToolCall == null) {
                throw new UIMessageStreamError({
                  chunkType: "tool-input-delta",
                  chunkId: chunk.toolCallId,
                  message: `Received tool-input-delta for missing tool call with ID "${chunk.toolCallId}". Ensure a "tool-input-start" chunk is sent before any "tool-input-delta" chunks.`
                });
              }
              partialToolCall.text += chunk.inputTextDelta;
              const { value: partialArgs } = await parsePartialJson(
                partialToolCall.text
              );
              if (partialToolCall.dynamic) {
                updateDynamicToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: partialToolCall.toolName,
                  state: "input-streaming",
                  input: partialArgs,
                  title: partialToolCall.title
                });
              } else {
                updateToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: partialToolCall.toolName,
                  state: "input-streaming",
                  input: partialArgs,
                  title: partialToolCall.title
                });
              }
              write();
              break;
            }
            case "tool-input-available": {
              if (chunk.dynamic) {
                updateDynamicToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  state: "input-available",
                  input: chunk.input,
                  providerExecuted: chunk.providerExecuted,
                  providerMetadata: chunk.providerMetadata,
                  title: chunk.title
                });
              } else {
                updateToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  state: "input-available",
                  input: chunk.input,
                  providerExecuted: chunk.providerExecuted,
                  providerMetadata: chunk.providerMetadata,
                  title: chunk.title
                });
              }
              write();
              if (onToolCall && !chunk.providerExecuted) {
                await onToolCall({
                  toolCall: chunk
                });
              }
              break;
            }
            case "tool-input-error": {
              const existingPart = state.message.parts.filter(isToolUIPart).find((p) => p.toolCallId === chunk.toolCallId);
              const isDynamic = existingPart != null ? existingPart.type === "dynamic-tool" : !!chunk.dynamic;
              if (isDynamic) {
                updateDynamicToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  state: "output-error",
                  input: chunk.input,
                  errorText: chunk.errorText,
                  providerExecuted: chunk.providerExecuted,
                  providerMetadata: chunk.providerMetadata
                });
              } else {
                updateToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                  state: "output-error",
                  input: void 0,
                  rawInput: chunk.input,
                  errorText: chunk.errorText,
                  providerExecuted: chunk.providerExecuted,
                  providerMetadata: chunk.providerMetadata
                });
              }
              write();
              break;
            }
            case "tool-approval-request": {
              const toolInvocation = getToolInvocation(chunk.toolCallId);
              toolInvocation.state = "approval-requested";
              toolInvocation.approval = { id: chunk.approvalId };
              write();
              break;
            }
            case "tool-output-denied": {
              const toolInvocation = getToolInvocation(chunk.toolCallId);
              toolInvocation.state = "output-denied";
              write();
              break;
            }
            case "tool-output-available": {
              const toolInvocation = getToolInvocation(chunk.toolCallId);
              if (toolInvocation.type === "dynamic-tool") {
                updateDynamicToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: toolInvocation.toolName,
                  state: "output-available",
                  input: toolInvocation.input,
                  output: chunk.output,
                  preliminary: chunk.preliminary,
                  providerExecuted: chunk.providerExecuted,
                  title: toolInvocation.title
                });
              } else {
                updateToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: getStaticToolName(toolInvocation),
                  state: "output-available",
                  input: toolInvocation.input,
                  output: chunk.output,
                  providerExecuted: chunk.providerExecuted,
                  preliminary: chunk.preliminary,
                  title: toolInvocation.title
                });
              }
              write();
              break;
            }
            case "tool-output-error": {
              const toolInvocation = getToolInvocation(chunk.toolCallId);
              if (toolInvocation.type === "dynamic-tool") {
                updateDynamicToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: toolInvocation.toolName,
                  state: "output-error",
                  input: toolInvocation.input,
                  errorText: chunk.errorText,
                  providerExecuted: chunk.providerExecuted,
                  title: toolInvocation.title
                });
              } else {
                updateToolPart({
                  toolCallId: chunk.toolCallId,
                  toolName: getStaticToolName(toolInvocation),
                  state: "output-error",
                  input: toolInvocation.input,
                  rawInput: toolInvocation.rawInput,
                  errorText: chunk.errorText,
                  providerExecuted: chunk.providerExecuted,
                  title: toolInvocation.title
                });
              }
              write();
              break;
            }
            case "start-step": {
              state.message.parts.push({ type: "step-start" });
              break;
            }
            case "finish-step": {
              state.activeTextParts = {};
              state.activeReasoningParts = {};
              break;
            }
            case "start": {
              if (chunk.messageId != null) {
                state.message.id = chunk.messageId;
              }
              await updateMessageMetadata(chunk.messageMetadata);
              if (chunk.messageId != null || chunk.messageMetadata != null) {
                write();
              }
              break;
            }
            case "finish": {
              if (chunk.finishReason != null) {
                state.finishReason = chunk.finishReason;
              }
              await updateMessageMetadata(chunk.messageMetadata);
              if (chunk.messageMetadata != null) {
                write();
              }
              break;
            }
            case "message-metadata": {
              await updateMessageMetadata(chunk.messageMetadata);
              if (chunk.messageMetadata != null) {
                write();
              }
              break;
            }
            case "error": {
              onError == null ? void 0 : onError(new Error(chunk.errorText));
              break;
            }
            default: {
              if (isDataUIMessageChunk(chunk)) {
                if ((dataPartSchemas == null ? void 0 : dataPartSchemas[chunk.type]) != null) {
                  const partIdx = state.message.parts.findIndex(
                    (p) => "id" in p && "data" in p && p.id === chunk.id && p.type === chunk.type
                  );
                  const actualPartIdx = partIdx >= 0 ? partIdx : state.message.parts.length;
                  await validateTypes$1({
                    value: chunk.data,
                    schema: dataPartSchemas[chunk.type],
                    context: {
                      field: `message.parts[${actualPartIdx}].data`,
                      entityName: chunk.type,
                      entityId: chunk.id
                    }
                  });
                }
                const dataChunk = chunk;
                if (dataChunk.transient) {
                  onData == null ? void 0 : onData(dataChunk);
                  break;
                }
                const existingUIPart = dataChunk.id != null ? state.message.parts.find(
                  (chunkArg) => dataChunk.type === chunkArg.type && dataChunk.id === chunkArg.id
                ) : void 0;
                if (existingUIPart != null) {
                  existingUIPart.data = dataChunk.data;
                } else {
                  state.message.parts.push(dataChunk);
                }
                onData == null ? void 0 : onData(dataChunk);
                write();
              }
            }
          }
          controller.enqueue(chunk);
        });
      }
    })
  );
}
function handleUIMessageStreamFinish({
  messageId,
  originalMessages = [],
  onStepFinish,
  onFinish,
  onError,
  stream
}) {
  let lastMessage = originalMessages == null ? void 0 : originalMessages[originalMessages.length - 1];
  if ((lastMessage == null ? void 0 : lastMessage.role) !== "assistant") {
    lastMessage = void 0;
  } else {
    messageId = lastMessage.id;
  }
  let isAborted = false;
  const idInjectedStream = stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (chunk.type === "start") {
          const startChunk = chunk;
          if (startChunk.messageId == null && messageId != null) {
            startChunk.messageId = messageId;
          }
        }
        if (chunk.type === "abort") {
          isAborted = true;
        }
        controller.enqueue(chunk);
      }
    })
  );
  if (onFinish == null && onStepFinish == null) {
    return idInjectedStream;
  }
  const state = createStreamingUIMessageState({
    lastMessage: lastMessage ? structuredClone(lastMessage) : void 0,
    messageId: messageId != null ? messageId : ""
    // will be overridden by the stream
  });
  const runUpdateMessageJob = async (job) => {
    await job({ state, write: () => {
    } });
  };
  let finishCalled = false;
  const callOnFinish = async () => {
    if (finishCalled || !onFinish) {
      return;
    }
    finishCalled = true;
    const isContinuation = state.message.id === (lastMessage == null ? void 0 : lastMessage.id);
    await onFinish({
      isAborted,
      isContinuation,
      responseMessage: state.message,
      messages: [
        ...isContinuation ? originalMessages.slice(0, -1) : originalMessages,
        state.message
      ],
      finishReason: state.finishReason
    });
  };
  const callOnStepFinish = async () => {
    if (!onStepFinish) {
      return;
    }
    const isContinuation = state.message.id === (lastMessage == null ? void 0 : lastMessage.id);
    try {
      await onStepFinish({
        isContinuation,
        responseMessage: structuredClone(state.message),
        messages: [
          ...isContinuation ? originalMessages.slice(0, -1) : originalMessages,
          structuredClone(state.message)
        ]
      });
    } catch (error) {
      onError(error);
    }
  };
  return processUIMessageStream({
    stream: idInjectedStream,
    runUpdateMessageJob,
    onError
  }).pipeThrough(
    new TransformStream({
      async transform(chunk, controller) {
        if (chunk.type === "finish-step") {
          await callOnStepFinish();
        }
        controller.enqueue(chunk);
      },
      // @ts-expect-error cancel is still new and missing from types https://developer.mozilla.org/en-US/docs/Web/API/TransformStream#browser_compatibility
      async cancel() {
        await callOnFinish();
      },
      async flush() {
        await callOnFinish();
      }
    })
  );
}
function pipeUIMessageStreamToResponse({
  response,
  status,
  statusText,
  headers,
  stream,
  consumeSseStream
}) {
  let sseStream = stream.pipeThrough(new JsonToSseTransformStream());
  if (consumeSseStream) {
    const [stream1, stream2] = sseStream.tee();
    sseStream = stream1;
    consumeSseStream({ stream: stream2 });
  }
  writeToServerResponse({
    response,
    status,
    statusText,
    headers: Object.fromEntries(
      prepareHeaders(headers, UI_MESSAGE_STREAM_HEADERS).entries()
    ),
    stream: sseStream.pipeThrough(new TextEncoderStream())
  });
}
function createAsyncIterableStream(source) {
  const stream = source.pipeThrough(new TransformStream());
  stream[Symbol.asyncIterator] = function() {
    const reader = this.getReader();
    let finished = false;
    async function cleanup(cancelStream) {
      var _a21;
      if (finished)
        return;
      finished = true;
      try {
        if (cancelStream) {
          await ((_a21 = reader.cancel) == null ? void 0 : _a21.call(reader));
        }
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {
        }
      }
    }
    return {
      /**
       * Reads the next chunk from the stream.
       * @returns A promise resolving to the next IteratorResult.
       */
      async next() {
        if (finished) {
          return { done: true, value: void 0 };
        }
        const { done, value } = await reader.read();
        if (done) {
          await cleanup(true);
          return { done: true, value: void 0 };
        }
        return { done: false, value };
      },
      /**
       * May be called on early exit (e.g., break from for-await) or after completion.
       * Ensures the stream is cancelled and resources are released.
       * @returns A promise resolving to a completed IteratorResult.
       */
      async return() {
        await cleanup(true);
        return { done: true, value: void 0 };
      },
      /**
       * Called on early exit with error.
       * Ensures the stream is cancelled and resources are released, then rethrows the error.
       * @param err The error to throw.
       * @returns A promise that rejects with the provided error.
       */
      async throw(err) {
        await cleanup(true);
        throw err;
      }
    };
  };
  return stream;
}
async function consumeStream({
  stream,
  onError
}) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done } = await reader.read();
      if (done)
        break;
    }
  } catch (error) {
    onError == null ? void 0 : onError(error);
  } finally {
    reader.releaseLock();
  }
}
function createResolvablePromise() {
  let resolve3;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve3 = res;
    reject = rej;
  });
  return {
    promise,
    resolve: resolve3,
    reject
  };
}
function createStitchableStream() {
  let innerStreamReaders = [];
  let controller = null;
  let isClosed = false;
  let waitForNewStream = createResolvablePromise();
  const terminate = () => {
    isClosed = true;
    waitForNewStream.resolve();
    innerStreamReaders.forEach((reader) => reader.cancel());
    innerStreamReaders = [];
    controller == null ? void 0 : controller.close();
  };
  const processPull = async () => {
    if (isClosed && innerStreamReaders.length === 0) {
      controller == null ? void 0 : controller.close();
      return;
    }
    if (innerStreamReaders.length === 0) {
      waitForNewStream = createResolvablePromise();
      await waitForNewStream.promise;
      return processPull();
    }
    try {
      const { value, done } = await innerStreamReaders[0].read();
      if (done) {
        innerStreamReaders.shift();
        if (innerStreamReaders.length === 0 && isClosed) {
          controller == null ? void 0 : controller.close();
        } else {
          await processPull();
        }
      } else {
        controller == null ? void 0 : controller.enqueue(value);
      }
    } catch (error) {
      controller == null ? void 0 : controller.error(error);
      innerStreamReaders.shift();
      terminate();
    }
  };
  return {
    stream: new ReadableStream({
      start(controllerParam) {
        controller = controllerParam;
      },
      pull: processPull,
      async cancel() {
        for (const reader of innerStreamReaders) {
          await reader.cancel();
        }
        innerStreamReaders = [];
        isClosed = true;
      }
    }),
    addStream: (innerStream) => {
      if (isClosed) {
        throw new Error("Cannot add inner stream: outer stream is closed");
      }
      innerStreamReaders.push(innerStream.getReader());
      waitForNewStream.resolve();
    },
    /**
     * Gracefully close the outer stream. This will let the inner streams
     * finish processing and then close the outer stream.
     */
    close: () => {
      isClosed = true;
      waitForNewStream.resolve();
      if (innerStreamReaders.length === 0) {
        controller == null ? void 0 : controller.close();
      }
    },
    /**
     * Immediately close the outer stream. This will cancel all inner streams
     * and close the outer stream.
     */
    terminate
  };
}
function runToolsTransformation({
  tools,
  generatorStream,
  tracer,
  telemetry,
  system,
  messages,
  abortSignal,
  repairToolCall,
  experimental_context,
  generateId: generateId2,
  stepNumber,
  model,
  onToolCallStart,
  onToolCallFinish
}) {
  let toolResultsStreamController = null;
  const toolResultsStream = new ReadableStream({
    start(controller) {
      toolResultsStreamController = controller;
    }
  });
  const outstandingToolResults = /* @__PURE__ */ new Set();
  const toolInputs = /* @__PURE__ */ new Map();
  const toolCallsByToolCallId = /* @__PURE__ */ new Map();
  let canClose = false;
  let finishChunk = void 0;
  function attemptClose() {
    if (canClose && outstandingToolResults.size === 0) {
      if (finishChunk != null) {
        toolResultsStreamController.enqueue(finishChunk);
      }
      toolResultsStreamController.close();
    }
  }
  const forwardStream = new TransformStream({
    async transform(chunk, controller) {
      const chunkType = chunk.type;
      switch (chunkType) {
        case "stream-start":
        case "text-start":
        case "text-delta":
        case "text-end":
        case "reasoning-start":
        case "reasoning-delta":
        case "reasoning-end":
        case "tool-input-start":
        case "tool-input-delta":
        case "tool-input-end":
        case "source":
        case "response-metadata":
        case "error":
        case "raw": {
          controller.enqueue(chunk);
          break;
        }
        case "file": {
          controller.enqueue({
            type: "file",
            file: new DefaultGeneratedFileWithType({
              data: chunk.data,
              mediaType: chunk.mediaType
            }),
            ...chunk.providerMetadata != null ? { providerMetadata: chunk.providerMetadata } : {}
          });
          break;
        }
        case "finish": {
          finishChunk = {
            type: "finish",
            finishReason: chunk.finishReason.unified,
            rawFinishReason: chunk.finishReason.raw,
            usage: asLanguageModelUsage(chunk.usage),
            providerMetadata: chunk.providerMetadata
          };
          break;
        }
        case "tool-approval-request": {
          const toolCall = toolCallsByToolCallId.get(chunk.toolCallId);
          if (toolCall == null) {
            toolResultsStreamController.enqueue({
              type: "error",
              error: new ToolCallNotFoundForApprovalError({
                toolCallId: chunk.toolCallId,
                approvalId: chunk.approvalId
              })
            });
            break;
          }
          controller.enqueue({
            type: "tool-approval-request",
            approvalId: chunk.approvalId,
            toolCall
          });
          break;
        }
        case "tool-call": {
          try {
            const toolCall = await parseToolCall({
              toolCall: chunk,
              tools,
              repairToolCall,
              system,
              messages
            });
            toolCallsByToolCallId.set(toolCall.toolCallId, toolCall);
            controller.enqueue(toolCall);
            if (toolCall.invalid) {
              toolResultsStreamController.enqueue({
                type: "tool-error",
                toolCallId: toolCall.toolCallId,
                toolName: toolCall.toolName,
                input: toolCall.input,
                error: getErrorMessage$1(toolCall.error),
                dynamic: true,
                title: toolCall.title
              });
              break;
            }
            const tool2 = tools == null ? void 0 : tools[toolCall.toolName];
            if (tool2 == null) {
              break;
            }
            if (tool2.onInputAvailable != null) {
              await tool2.onInputAvailable({
                input: toolCall.input,
                toolCallId: toolCall.toolCallId,
                messages,
                abortSignal,
                experimental_context
              });
            }
            if (await isApprovalNeeded({
              tool: tool2,
              toolCall,
              messages,
              experimental_context
            })) {
              toolResultsStreamController.enqueue({
                type: "tool-approval-request",
                approvalId: generateId2(),
                toolCall
              });
              break;
            }
            toolInputs.set(toolCall.toolCallId, toolCall.input);
            if (tool2.execute != null && toolCall.providerExecuted !== true) {
              const toolExecutionId = generateId2();
              outstandingToolResults.add(toolExecutionId);
              executeToolCall({
                toolCall,
                tools,
                tracer,
                telemetry,
                messages,
                abortSignal,
                experimental_context,
                stepNumber,
                model,
                onToolCallStart,
                onToolCallFinish,
                onPreliminaryToolResult: (result) => {
                  toolResultsStreamController.enqueue(result);
                }
              }).then((result) => {
                toolResultsStreamController.enqueue(result);
              }).catch((error) => {
                toolResultsStreamController.enqueue({
                  type: "error",
                  error
                });
              }).finally(() => {
                outstandingToolResults.delete(toolExecutionId);
                attemptClose();
              });
            }
          } catch (error) {
            toolResultsStreamController.enqueue({ type: "error", error });
          }
          break;
        }
        case "tool-result": {
          const toolName = chunk.toolName;
          if (chunk.isError) {
            toolResultsStreamController.enqueue({
              type: "tool-error",
              toolCallId: chunk.toolCallId,
              toolName,
              input: toolInputs.get(chunk.toolCallId),
              providerExecuted: true,
              error: chunk.result,
              dynamic: chunk.dynamic
            });
          } else {
            controller.enqueue({
              type: "tool-result",
              toolCallId: chunk.toolCallId,
              toolName,
              input: toolInputs.get(chunk.toolCallId),
              output: chunk.result,
              providerExecuted: true,
              dynamic: chunk.dynamic
            });
          }
          break;
        }
        default: {
          const _exhaustiveCheck = chunkType;
          throw new Error(`Unhandled chunk type: ${_exhaustiveCheck}`);
        }
      }
    },
    flush() {
      canClose = true;
      attemptClose();
    }
  });
  return new ReadableStream({
    async start(controller) {
      return Promise.all([
        generatorStream.pipeThrough(forwardStream).pipeTo(
          new WritableStream({
            write(chunk) {
              controller.enqueue(chunk);
            },
            close() {
            }
          })
        ),
        toolResultsStream.pipeTo(
          new WritableStream({
            write(chunk) {
              controller.enqueue(chunk);
            },
            close() {
              controller.close();
            }
          })
        )
      ]);
    }
  });
}
var originalGenerateId2 = createIdGenerator$1({
  prefix: "aitxt",
  size: 24
});
function streamText({
  model,
  tools,
  toolChoice,
  system,
  prompt,
  messages,
  maxRetries,
  abortSignal,
  timeout,
  headers,
  stopWhen = stepCountIs(1),
  experimental_output,
  output = experimental_output,
  experimental_telemetry: telemetry,
  prepareStep,
  providerOptions,
  experimental_activeTools,
  activeTools = experimental_activeTools,
  experimental_repairToolCall: repairToolCall,
  experimental_transform: transform,
  experimental_download: download2,
  includeRawChunks = false,
  onChunk,
  onError = ({ error }) => {
    console.error(error);
  },
  onFinish,
  onAbort,
  onStepFinish,
  experimental_onStart: onStart,
  experimental_onStepStart: onStepStart,
  experimental_onToolCallStart: onToolCallStart,
  experimental_onToolCallFinish: onToolCallFinish,
  experimental_context,
  experimental_include: include,
  _internal: { now: now2 = now, generateId: generateId2 = originalGenerateId2 } = {},
  ...settings
}) {
  const totalTimeoutMs = getTotalTimeoutMs(timeout);
  const stepTimeoutMs = getStepTimeoutMs(timeout);
  const chunkTimeoutMs = getChunkTimeoutMs(timeout);
  const stepAbortController = stepTimeoutMs != null ? new AbortController() : void 0;
  const chunkAbortController = chunkTimeoutMs != null ? new AbortController() : void 0;
  return new DefaultStreamTextResult({
    model: resolveLanguageModel(model),
    telemetry,
    headers,
    settings,
    maxRetries,
    abortSignal: mergeAbortSignals(
      abortSignal,
      totalTimeoutMs != null ? AbortSignal.timeout(totalTimeoutMs) : void 0,
      stepAbortController == null ? void 0 : stepAbortController.signal,
      chunkAbortController == null ? void 0 : chunkAbortController.signal
    ),
    stepTimeoutMs,
    stepAbortController,
    chunkTimeoutMs,
    chunkAbortController,
    system,
    prompt,
    messages,
    tools,
    toolChoice,
    transforms: asArray(transform),
    activeTools,
    repairToolCall,
    stopConditions: asArray(stopWhen),
    output,
    providerOptions,
    prepareStep,
    includeRawChunks,
    timeout,
    stopWhen,
    originalAbortSignal: abortSignal,
    onChunk,
    onError,
    onFinish,
    onAbort,
    onStepFinish,
    onStart,
    onStepStart,
    onToolCallStart,
    onToolCallFinish,
    now: now2,
    generateId: generateId2,
    experimental_context,
    download: download2,
    include
  });
}
function createOutputTransformStream(output) {
  let firstTextChunkId = void 0;
  let text2 = "";
  let textChunk = "";
  let textProviderMetadata = void 0;
  let lastPublishedJson = "";
  function publishTextChunk({
    controller,
    partialOutput = void 0
  }) {
    controller.enqueue({
      part: {
        type: "text-delta",
        id: firstTextChunkId,
        text: textChunk,
        providerMetadata: textProviderMetadata
      },
      partialOutput
    });
    textChunk = "";
  }
  return new TransformStream({
    async transform(chunk, controller) {
      var _a21;
      if (chunk.type === "finish-step" && textChunk.length > 0) {
        publishTextChunk({ controller });
      }
      if (chunk.type !== "text-delta" && chunk.type !== "text-start" && chunk.type !== "text-end") {
        controller.enqueue({ part: chunk, partialOutput: void 0 });
        return;
      }
      if (firstTextChunkId == null) {
        firstTextChunkId = chunk.id;
      } else if (chunk.id !== firstTextChunkId) {
        controller.enqueue({ part: chunk, partialOutput: void 0 });
        return;
      }
      if (chunk.type === "text-start") {
        controller.enqueue({ part: chunk, partialOutput: void 0 });
        return;
      }
      if (chunk.type === "text-end") {
        if (textChunk.length > 0) {
          publishTextChunk({ controller });
        }
        controller.enqueue({ part: chunk, partialOutput: void 0 });
        return;
      }
      text2 += chunk.text;
      textChunk += chunk.text;
      textProviderMetadata = (_a21 = chunk.providerMetadata) != null ? _a21 : textProviderMetadata;
      const result = await output.parsePartialOutput({ text: text2 });
      if (result !== void 0) {
        const currentJson = JSON.stringify(result.partial);
        if (currentJson !== lastPublishedJson) {
          publishTextChunk({ controller, partialOutput: result.partial });
          lastPublishedJson = currentJson;
        }
      }
    }
  });
}
var DefaultStreamTextResult = class {
  constructor({
    model,
    telemetry,
    headers,
    settings,
    maxRetries: maxRetriesArg,
    abortSignal,
    stepTimeoutMs,
    stepAbortController,
    chunkTimeoutMs,
    chunkAbortController,
    system,
    prompt,
    messages,
    tools,
    toolChoice,
    transforms,
    activeTools,
    repairToolCall,
    stopConditions,
    output,
    providerOptions,
    prepareStep,
    includeRawChunks,
    now: now2,
    generateId: generateId2,
    timeout,
    stopWhen,
    originalAbortSignal,
    onChunk,
    onError,
    onFinish,
    onAbort,
    onStepFinish,
    onStart,
    onStepStart,
    onToolCallStart,
    onToolCallFinish,
    experimental_context,
    download: download2,
    include
  }) {
    this._totalUsage = new DelayedPromise();
    this._finishReason = new DelayedPromise();
    this._rawFinishReason = new DelayedPromise();
    this._steps = new DelayedPromise();
    this.outputSpecification = output;
    this.includeRawChunks = includeRawChunks;
    this.tools = tools;
    const createGlobalTelemetry = getGlobalTelemetryIntegration();
    const globalTelemetry = createGlobalTelemetry(telemetry == null ? void 0 : telemetry.integrations);
    let stepFinish;
    let recordedContent = [];
    const recordedResponseMessages = [];
    let recordedFinishReason = void 0;
    let recordedRawFinishReason = void 0;
    let recordedTotalUsage = void 0;
    let recordedRequest = {};
    let recordedWarnings = [];
    const recordedSteps = [];
    const pendingDeferredToolCalls = /* @__PURE__ */ new Map();
    let rootSpan;
    let activeTextContent = {};
    let activeReasoningContent = {};
    const eventProcessor = new TransformStream({
      async transform(chunk, controller) {
        var _a21, _b15, _c, _d;
        controller.enqueue(chunk);
        const { part } = chunk;
        if (part.type === "text-delta" || part.type === "reasoning-delta" || part.type === "source" || part.type === "tool-call" || part.type === "tool-result" || part.type === "tool-input-start" || part.type === "tool-input-delta" || part.type === "raw") {
          await (onChunk == null ? void 0 : onChunk({ chunk: part }));
        }
        if (part.type === "error") {
          await onError({ error: wrapGatewayError(part.error) });
        }
        if (part.type === "text-start") {
          activeTextContent[part.id] = {
            type: "text",
            text: "",
            providerMetadata: part.providerMetadata
          };
          recordedContent.push(activeTextContent[part.id]);
        }
        if (part.type === "text-delta") {
          const activeText = activeTextContent[part.id];
          if (activeText == null) {
            controller.enqueue({
              part: {
                type: "error",
                error: `text part ${part.id} not found`
              },
              partialOutput: void 0
            });
            return;
          }
          activeText.text += part.text;
          activeText.providerMetadata = (_a21 = part.providerMetadata) != null ? _a21 : activeText.providerMetadata;
        }
        if (part.type === "text-end") {
          const activeText = activeTextContent[part.id];
          if (activeText == null) {
            controller.enqueue({
              part: {
                type: "error",
                error: `text part ${part.id} not found`
              },
              partialOutput: void 0
            });
            return;
          }
          activeText.providerMetadata = (_b15 = part.providerMetadata) != null ? _b15 : activeText.providerMetadata;
          delete activeTextContent[part.id];
        }
        if (part.type === "reasoning-start") {
          activeReasoningContent[part.id] = {
            type: "reasoning",
            text: "",
            providerMetadata: part.providerMetadata
          };
          recordedContent.push(activeReasoningContent[part.id]);
        }
        if (part.type === "reasoning-delta") {
          const activeReasoning = activeReasoningContent[part.id];
          if (activeReasoning == null) {
            controller.enqueue({
              part: {
                type: "error",
                error: `reasoning part ${part.id} not found`
              },
              partialOutput: void 0
            });
            return;
          }
          activeReasoning.text += part.text;
          activeReasoning.providerMetadata = (_c = part.providerMetadata) != null ? _c : activeReasoning.providerMetadata;
        }
        if (part.type === "reasoning-end") {
          const activeReasoning = activeReasoningContent[part.id];
          if (activeReasoning == null) {
            controller.enqueue({
              part: {
                type: "error",
                error: `reasoning part ${part.id} not found`
              },
              partialOutput: void 0
            });
            return;
          }
          activeReasoning.providerMetadata = (_d = part.providerMetadata) != null ? _d : activeReasoning.providerMetadata;
          delete activeReasoningContent[part.id];
        }
        if (part.type === "file") {
          recordedContent.push({
            type: "file",
            file: part.file,
            ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
          });
        }
        if (part.type === "source") {
          recordedContent.push(part);
        }
        if (part.type === "tool-call") {
          recordedContent.push(part);
        }
        if (part.type === "tool-result" && !part.preliminary) {
          recordedContent.push(part);
        }
        if (part.type === "tool-approval-request") {
          recordedContent.push(part);
        }
        if (part.type === "tool-error") {
          recordedContent.push(part);
        }
        if (part.type === "start-step") {
          recordedContent = [];
          activeReasoningContent = {};
          activeTextContent = {};
          recordedRequest = part.request;
          recordedWarnings = part.warnings;
        }
        if (part.type === "finish-step") {
          const stepMessages = await toResponseMessages({
            content: recordedContent,
            tools
          });
          const currentStepResult = new DefaultStepResult({
            stepNumber: recordedSteps.length,
            model: modelInfo,
            ...callbackTelemetryProps,
            experimental_context,
            content: recordedContent,
            finishReason: part.finishReason,
            rawFinishReason: part.rawFinishReason,
            usage: part.usage,
            warnings: recordedWarnings,
            request: recordedRequest,
            response: {
              ...part.response,
              messages: [...recordedResponseMessages, ...stepMessages]
            },
            providerMetadata: part.providerMetadata
          });
          await notify({
            event: currentStepResult,
            callbacks: [onStepFinish, globalTelemetry.onStepFinish]
          });
          logWarnings({
            warnings: recordedWarnings,
            provider: modelInfo.provider,
            model: modelInfo.modelId
          });
          recordedSteps.push(currentStepResult);
          recordedResponseMessages.push(...stepMessages);
          stepFinish.resolve();
        }
        if (part.type === "finish") {
          recordedTotalUsage = part.totalUsage;
          recordedFinishReason = part.finishReason;
          recordedRawFinishReason = part.rawFinishReason;
        }
      },
      async flush(controller) {
        try {
          if (recordedSteps.length === 0) {
            const error = (abortSignal == null ? void 0 : abortSignal.aborted) ? abortSignal.reason : new NoOutputGeneratedError({
              message: "No output generated. Check the stream for errors."
            });
            self2._finishReason.reject(error);
            self2._rawFinishReason.reject(error);
            self2._totalUsage.reject(error);
            self2._steps.reject(error);
            return;
          }
          const finishReason = recordedFinishReason != null ? recordedFinishReason : "other";
          const totalUsage = recordedTotalUsage != null ? recordedTotalUsage : createNullLanguageModelUsage();
          self2._finishReason.resolve(finishReason);
          self2._rawFinishReason.resolve(recordedRawFinishReason);
          self2._totalUsage.resolve(totalUsage);
          self2._steps.resolve(recordedSteps);
          const finalStep = recordedSteps[recordedSteps.length - 1];
          await notify({
            event: {
              stepNumber: finalStep.stepNumber,
              model: finalStep.model,
              functionId: finalStep.functionId,
              metadata: finalStep.metadata,
              experimental_context: finalStep.experimental_context,
              finishReason: finalStep.finishReason,
              rawFinishReason: finalStep.rawFinishReason,
              totalUsage,
              usage: finalStep.usage,
              content: finalStep.content,
              text: finalStep.text,
              reasoningText: finalStep.reasoningText,
              reasoning: finalStep.reasoning,
              files: finalStep.files,
              sources: finalStep.sources,
              toolCalls: finalStep.toolCalls,
              staticToolCalls: finalStep.staticToolCalls,
              dynamicToolCalls: finalStep.dynamicToolCalls,
              toolResults: finalStep.toolResults,
              staticToolResults: finalStep.staticToolResults,
              dynamicToolResults: finalStep.dynamicToolResults,
              request: finalStep.request,
              response: finalStep.response,
              warnings: finalStep.warnings,
              providerMetadata: finalStep.providerMetadata,
              steps: recordedSteps
            },
            callbacks: [
              onFinish,
              globalTelemetry.onFinish
            ]
          });
          rootSpan.setAttributes(
            await selectTelemetryAttributes({
              telemetry,
              attributes: {
                "ai.response.finishReason": finishReason,
                "ai.response.text": { output: () => finalStep.text },
                "ai.response.reasoning": {
                  output: () => finalStep.reasoningText
                },
                "ai.response.toolCalls": {
                  output: () => {
                    var _a21;
                    return ((_a21 = finalStep.toolCalls) == null ? void 0 : _a21.length) ? JSON.stringify(finalStep.toolCalls) : void 0;
                  }
                },
                "ai.response.providerMetadata": JSON.stringify(
                  finalStep.providerMetadata
                ),
                "ai.usage.inputTokens": totalUsage.inputTokens,
                "ai.usage.outputTokens": totalUsage.outputTokens,
                "ai.usage.totalTokens": totalUsage.totalTokens,
                "ai.usage.reasoningTokens": totalUsage.reasoningTokens,
                "ai.usage.cachedInputTokens": totalUsage.cachedInputTokens
              }
            })
          );
        } catch (error) {
          controller.error(error);
        } finally {
          rootSpan.end();
        }
      }
    });
    const stitchableStream = createStitchableStream();
    this.addStream = stitchableStream.addStream;
    this.closeStream = stitchableStream.close;
    const reader = stitchableStream.stream.getReader();
    let stream = new ReadableStream({
      async start(controller) {
        controller.enqueue({ type: "start" });
      },
      async pull(controller) {
        function abort() {
          onAbort == null ? void 0 : onAbort({ steps: recordedSteps });
          controller.enqueue({
            type: "abort",
            // The `reason` is usually of type DOMException, but it can also be of any type,
            // so we use getErrorMessage for serialization because it is already designed to accept values of the unknown type.
            // See: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/reason
            ...(abortSignal == null ? void 0 : abortSignal.reason) !== void 0 ? { reason: getErrorMessage$2(abortSignal.reason) } : {}
          });
          controller.close();
        }
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          if (abortSignal == null ? void 0 : abortSignal.aborted) {
            abort();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          if (isAbortError$1(error) && (abortSignal == null ? void 0 : abortSignal.aborted)) {
            abort();
          } else {
            controller.error(error);
          }
        }
      },
      cancel(reason) {
        return stitchableStream.stream.cancel(reason);
      }
    });
    for (const transform of transforms) {
      stream = stream.pipeThrough(
        transform({
          tools,
          stopStream() {
            stitchableStream.terminate();
          }
        })
      );
    }
    this.baseStream = stream.pipeThrough(createOutputTransformStream(output != null ? output : text())).pipeThrough(eventProcessor);
    const { maxRetries, retry } = prepareRetries({
      maxRetries: maxRetriesArg,
      abortSignal
    });
    const tracer = getTracer(telemetry);
    const callSettings = prepareCallSettings(settings);
    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model,
      telemetry,
      headers,
      settings: { ...callSettings, maxRetries }
    });
    const self2 = this;
    const modelInfo = { provider: model.provider, modelId: model.modelId };
    const callbackTelemetryProps = {
      functionId: telemetry == null ? void 0 : telemetry.functionId,
      metadata: telemetry == null ? void 0 : telemetry.metadata
    };
    recordSpan({
      name: "ai.streamText",
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({ operationId: "ai.streamText", telemetry }),
          ...baseTelemetryAttributes,
          // specific settings that only make sense on the outer level:
          "ai.prompt": {
            input: () => JSON.stringify({ system, prompt, messages })
          }
        }
      }),
      tracer,
      endWhenDone: false,
      fn: async (rootSpanArg) => {
        rootSpan = rootSpanArg;
        const initialPrompt = await standardizePrompt({
          system,
          prompt,
          messages
        });
        await notify({
          event: {
            model: modelInfo,
            system,
            prompt,
            messages,
            tools,
            toolChoice,
            activeTools,
            maxOutputTokens: callSettings.maxOutputTokens,
            temperature: callSettings.temperature,
            topP: callSettings.topP,
            topK: callSettings.topK,
            presencePenalty: callSettings.presencePenalty,
            frequencyPenalty: callSettings.frequencyPenalty,
            stopSequences: callSettings.stopSequences,
            seed: callSettings.seed,
            maxRetries,
            timeout,
            headers,
            providerOptions,
            stopWhen,
            output,
            abortSignal: originalAbortSignal,
            include,
            ...callbackTelemetryProps,
            experimental_context
          },
          callbacks: [
            onStart,
            globalTelemetry.onStart
          ]
        });
        const initialMessages = initialPrompt.messages;
        const initialResponseMessages = [];
        const { approvedToolApprovals, deniedToolApprovals } = collectToolApprovals({ messages: initialMessages });
        if (deniedToolApprovals.length > 0 || approvedToolApprovals.length > 0) {
          const providerExecutedToolApprovals = [
            ...approvedToolApprovals,
            ...deniedToolApprovals
          ].filter((toolApproval) => toolApproval.toolCall.providerExecuted);
          const localApprovedToolApprovals = approvedToolApprovals.filter(
            (toolApproval) => !toolApproval.toolCall.providerExecuted
          );
          const localDeniedToolApprovals = deniedToolApprovals.filter(
            (toolApproval) => !toolApproval.toolCall.providerExecuted
          );
          const deniedProviderExecutedToolApprovals = deniedToolApprovals.filter(
            (toolApproval) => toolApproval.toolCall.providerExecuted
          );
          let toolExecutionStepStreamController;
          const toolExecutionStepStream = new ReadableStream({
            start(controller) {
              toolExecutionStepStreamController = controller;
            }
          });
          self2.addStream(toolExecutionStepStream);
          try {
            for (const toolApproval of [
              ...localDeniedToolApprovals,
              ...deniedProviderExecutedToolApprovals
            ]) {
              toolExecutionStepStreamController == null ? void 0 : toolExecutionStepStreamController.enqueue({
                type: "tool-output-denied",
                toolCallId: toolApproval.toolCall.toolCallId,
                toolName: toolApproval.toolCall.toolName
              });
            }
            const toolOutputs = [];
            await Promise.all(
              localApprovedToolApprovals.map(async (toolApproval) => {
                const result = await executeToolCall({
                  toolCall: toolApproval.toolCall,
                  tools,
                  tracer,
                  telemetry,
                  messages: initialMessages,
                  abortSignal,
                  experimental_context,
                  stepNumber: recordedSteps.length,
                  model: modelInfo,
                  onToolCallStart: [
                    onToolCallStart,
                    globalTelemetry.onToolCallStart
                  ],
                  onToolCallFinish: [
                    onToolCallFinish,
                    globalTelemetry.onToolCallFinish
                  ],
                  onPreliminaryToolResult: (result2) => {
                    toolExecutionStepStreamController == null ? void 0 : toolExecutionStepStreamController.enqueue(result2);
                  }
                });
                if (result != null) {
                  toolExecutionStepStreamController == null ? void 0 : toolExecutionStepStreamController.enqueue(result);
                  toolOutputs.push(result);
                }
              })
            );
            if (providerExecutedToolApprovals.length > 0) {
              initialResponseMessages.push({
                role: "tool",
                content: providerExecutedToolApprovals.map(
                  (toolApproval) => ({
                    type: "tool-approval-response",
                    approvalId: toolApproval.approvalResponse.approvalId,
                    approved: toolApproval.approvalResponse.approved,
                    reason: toolApproval.approvalResponse.reason,
                    providerExecuted: true
                  })
                )
              });
            }
            if (toolOutputs.length > 0 || localDeniedToolApprovals.length > 0) {
              const localToolContent = [];
              for (const output2 of toolOutputs) {
                localToolContent.push({
                  type: "tool-result",
                  toolCallId: output2.toolCallId,
                  toolName: output2.toolName,
                  output: await createToolModelOutput({
                    toolCallId: output2.toolCallId,
                    input: output2.input,
                    tool: tools == null ? void 0 : tools[output2.toolName],
                    output: output2.type === "tool-result" ? output2.output : output2.error,
                    errorMode: output2.type === "tool-error" ? "text" : "none"
                  })
                });
              }
              for (const toolApproval of localDeniedToolApprovals) {
                localToolContent.push({
                  type: "tool-result",
                  toolCallId: toolApproval.toolCall.toolCallId,
                  toolName: toolApproval.toolCall.toolName,
                  output: {
                    type: "execution-denied",
                    reason: toolApproval.approvalResponse.reason
                  }
                });
              }
              initialResponseMessages.push({
                role: "tool",
                content: localToolContent
              });
            }
          } finally {
            toolExecutionStepStreamController == null ? void 0 : toolExecutionStepStreamController.close();
          }
        }
        recordedResponseMessages.push(...initialResponseMessages);
        async function streamStep({
          currentStep,
          responseMessages,
          usage
        }) {
          var _a21, _b15, _c, _d, _e, _f, _g, _h, _i;
          const includeRawChunks2 = self2.includeRawChunks;
          const stepTimeoutId = stepTimeoutMs != null ? setTimeout(() => stepAbortController.abort(), stepTimeoutMs) : void 0;
          let chunkTimeoutId = void 0;
          function resetChunkTimeout() {
            if (chunkTimeoutMs != null) {
              if (chunkTimeoutId != null) {
                clearTimeout(chunkTimeoutId);
              }
              chunkTimeoutId = setTimeout(
                () => chunkAbortController.abort(),
                chunkTimeoutMs
              );
            }
          }
          function clearChunkTimeout() {
            if (chunkTimeoutId != null) {
              clearTimeout(chunkTimeoutId);
              chunkTimeoutId = void 0;
            }
          }
          function clearStepTimeout() {
            if (stepTimeoutId != null) {
              clearTimeout(stepTimeoutId);
            }
          }
          try {
            stepFinish = new DelayedPromise();
            const stepInputMessages = [...initialMessages, ...responseMessages];
            const prepareStepResult = await (prepareStep == null ? void 0 : prepareStep({
              model,
              steps: recordedSteps,
              stepNumber: recordedSteps.length,
              messages: stepInputMessages,
              experimental_context
            }));
            const stepModel = resolveLanguageModel(
              (_a21 = prepareStepResult == null ? void 0 : prepareStepResult.model) != null ? _a21 : model
            );
            const stepModelInfo = {
              provider: stepModel.provider,
              modelId: stepModel.modelId
            };
            const promptMessages = await convertToLanguageModelPrompt({
              prompt: {
                system: (_b15 = prepareStepResult == null ? void 0 : prepareStepResult.system) != null ? _b15 : initialPrompt.system,
                messages: (_c = prepareStepResult == null ? void 0 : prepareStepResult.messages) != null ? _c : stepInputMessages
              },
              supportedUrls: await stepModel.supportedUrls,
              download: download2
            });
            const stepActiveTools = (_d = prepareStepResult == null ? void 0 : prepareStepResult.activeTools) != null ? _d : activeTools;
            const { toolChoice: stepToolChoice, tools: stepTools } = await prepareToolsAndToolChoice({
              tools,
              toolChoice: (_e = prepareStepResult == null ? void 0 : prepareStepResult.toolChoice) != null ? _e : toolChoice,
              activeTools: stepActiveTools
            });
            experimental_context = (_f = prepareStepResult == null ? void 0 : prepareStepResult.experimental_context) != null ? _f : experimental_context;
            const stepMessages = (_g = prepareStepResult == null ? void 0 : prepareStepResult.messages) != null ? _g : stepInputMessages;
            const stepSystem = (_h = prepareStepResult == null ? void 0 : prepareStepResult.system) != null ? _h : initialPrompt.system;
            const stepProviderOptions = mergeObjects(
              providerOptions,
              prepareStepResult == null ? void 0 : prepareStepResult.providerOptions
            );
            await notify({
              event: {
                stepNumber: recordedSteps.length,
                model: stepModelInfo,
                system: stepSystem,
                messages: stepMessages,
                tools,
                toolChoice: stepToolChoice,
                activeTools: stepActiveTools,
                steps: [...recordedSteps],
                providerOptions: stepProviderOptions,
                timeout,
                headers,
                stopWhen,
                output,
                abortSignal: originalAbortSignal,
                include,
                ...callbackTelemetryProps,
                experimental_context
              },
              callbacks: [
                onStepStart,
                globalTelemetry.onStepStart
              ]
            });
            const {
              result: { stream: stream2, response, request },
              doStreamSpan,
              startTimestampMs
            } = await retry(
              () => recordSpan({
                name: "ai.streamText.doStream",
                attributes: selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    ...assembleOperationName({
                      operationId: "ai.streamText.doStream",
                      telemetry
                    }),
                    ...baseTelemetryAttributes,
                    // model:
                    "ai.model.provider": stepModel.provider,
                    "ai.model.id": stepModel.modelId,
                    // prompt:
                    "ai.prompt.messages": {
                      input: () => stringifyForTelemetry(promptMessages)
                    },
                    "ai.prompt.tools": {
                      // convert the language model level tools:
                      input: () => stepTools == null ? void 0 : stepTools.map((tool2) => JSON.stringify(tool2))
                    },
                    "ai.prompt.toolChoice": {
                      input: () => stepToolChoice != null ? JSON.stringify(stepToolChoice) : void 0
                    },
                    // standardized gen-ai llm span attributes:
                    "gen_ai.system": stepModel.provider,
                    "gen_ai.request.model": stepModel.modelId,
                    "gen_ai.request.frequency_penalty": callSettings.frequencyPenalty,
                    "gen_ai.request.max_tokens": callSettings.maxOutputTokens,
                    "gen_ai.request.presence_penalty": callSettings.presencePenalty,
                    "gen_ai.request.stop_sequences": callSettings.stopSequences,
                    "gen_ai.request.temperature": callSettings.temperature,
                    "gen_ai.request.top_k": callSettings.topK,
                    "gen_ai.request.top_p": callSettings.topP
                  }
                }),
                tracer,
                endWhenDone: false,
                fn: async (doStreamSpan2) => ({
                  startTimestampMs: now2(),
                  // get before the call
                  doStreamSpan: doStreamSpan2,
                  result: await stepModel.doStream({
                    ...callSettings,
                    tools: stepTools,
                    toolChoice: stepToolChoice,
                    responseFormat: await (output == null ? void 0 : output.responseFormat),
                    prompt: promptMessages,
                    providerOptions: stepProviderOptions,
                    abortSignal,
                    headers,
                    includeRawChunks: includeRawChunks2
                  })
                })
              })
            );
            const streamWithToolResults = runToolsTransformation({
              tools,
              generatorStream: stream2,
              tracer,
              telemetry,
              system,
              messages: stepInputMessages,
              repairToolCall,
              abortSignal,
              experimental_context,
              generateId: generateId2,
              stepNumber: recordedSteps.length,
              model: stepModelInfo,
              onToolCallStart: [
                onToolCallStart,
                globalTelemetry.onToolCallStart
              ],
              onToolCallFinish: [
                onToolCallFinish,
                globalTelemetry.onToolCallFinish
              ]
            });
            const stepRequest = ((_i = include == null ? void 0 : include.requestBody) != null ? _i : true) ? request != null ? request : {} : { ...request, body: void 0 };
            const stepToolCalls = [];
            const stepToolOutputs = [];
            let warnings;
            const activeToolCallToolNames = {};
            let stepFinishReason = "other";
            let stepRawFinishReason = void 0;
            let stepUsage = createNullLanguageModelUsage();
            let stepProviderMetadata;
            let stepFirstChunk = true;
            let stepResponse = {
              id: generateId2(),
              timestamp: /* @__PURE__ */ new Date(),
              modelId: modelInfo.modelId
            };
            let activeText = "";
            self2.addStream(
              streamWithToolResults.pipeThrough(
                new TransformStream({
                  async transform(chunk, controller) {
                    var _a22, _b22, _c2, _d2, _e2;
                    resetChunkTimeout();
                    if (chunk.type === "stream-start") {
                      warnings = chunk.warnings;
                      return;
                    }
                    if (stepFirstChunk) {
                      const msToFirstChunk = now2() - startTimestampMs;
                      stepFirstChunk = false;
                      doStreamSpan.addEvent("ai.stream.firstChunk", {
                        "ai.response.msToFirstChunk": msToFirstChunk
                      });
                      doStreamSpan.setAttributes({
                        "ai.response.msToFirstChunk": msToFirstChunk
                      });
                      controller.enqueue({
                        type: "start-step",
                        request: stepRequest,
                        warnings: warnings != null ? warnings : []
                      });
                    }
                    const chunkType = chunk.type;
                    switch (chunkType) {
                      case "tool-approval-request":
                      case "text-start":
                      case "text-end": {
                        controller.enqueue(chunk);
                        break;
                      }
                      case "text-delta": {
                        if (chunk.delta.length > 0) {
                          controller.enqueue({
                            type: "text-delta",
                            id: chunk.id,
                            text: chunk.delta,
                            providerMetadata: chunk.providerMetadata
                          });
                          activeText += chunk.delta;
                        }
                        break;
                      }
                      case "reasoning-start":
                      case "reasoning-end": {
                        controller.enqueue(chunk);
                        break;
                      }
                      case "reasoning-delta": {
                        controller.enqueue({
                          type: "reasoning-delta",
                          id: chunk.id,
                          text: chunk.delta,
                          providerMetadata: chunk.providerMetadata
                        });
                        break;
                      }
                      case "tool-call": {
                        controller.enqueue(chunk);
                        stepToolCalls.push(chunk);
                        break;
                      }
                      case "tool-result": {
                        controller.enqueue(chunk);
                        if (!chunk.preliminary) {
                          stepToolOutputs.push(chunk);
                        }
                        break;
                      }
                      case "tool-error": {
                        controller.enqueue(chunk);
                        stepToolOutputs.push(chunk);
                        break;
                      }
                      case "response-metadata": {
                        stepResponse = {
                          id: (_a22 = chunk.id) != null ? _a22 : stepResponse.id,
                          timestamp: (_b22 = chunk.timestamp) != null ? _b22 : stepResponse.timestamp,
                          modelId: (_c2 = chunk.modelId) != null ? _c2 : stepResponse.modelId
                        };
                        break;
                      }
                      case "finish": {
                        stepUsage = chunk.usage;
                        stepFinishReason = chunk.finishReason;
                        stepRawFinishReason = chunk.rawFinishReason;
                        stepProviderMetadata = chunk.providerMetadata;
                        const msToFinish = now2() - startTimestampMs;
                        doStreamSpan.addEvent("ai.stream.finish");
                        doStreamSpan.setAttributes({
                          "ai.response.msToFinish": msToFinish,
                          "ai.response.avgOutputTokensPerSecond": 1e3 * ((_d2 = stepUsage.outputTokens) != null ? _d2 : 0) / msToFinish
                        });
                        break;
                      }
                      case "file": {
                        controller.enqueue(chunk);
                        break;
                      }
                      case "source": {
                        controller.enqueue(chunk);
                        break;
                      }
                      case "tool-input-start": {
                        activeToolCallToolNames[chunk.id] = chunk.toolName;
                        const tool2 = tools == null ? void 0 : tools[chunk.toolName];
                        if ((tool2 == null ? void 0 : tool2.onInputStart) != null) {
                          await tool2.onInputStart({
                            toolCallId: chunk.id,
                            messages: stepInputMessages,
                            abortSignal,
                            experimental_context
                          });
                        }
                        controller.enqueue({
                          ...chunk,
                          dynamic: (_e2 = chunk.dynamic) != null ? _e2 : (tool2 == null ? void 0 : tool2.type) === "dynamic",
                          title: tool2 == null ? void 0 : tool2.title
                        });
                        break;
                      }
                      case "tool-input-end": {
                        delete activeToolCallToolNames[chunk.id];
                        controller.enqueue(chunk);
                        break;
                      }
                      case "tool-input-delta": {
                        const toolName = activeToolCallToolNames[chunk.id];
                        const tool2 = tools == null ? void 0 : tools[toolName];
                        if ((tool2 == null ? void 0 : tool2.onInputDelta) != null) {
                          await tool2.onInputDelta({
                            inputTextDelta: chunk.delta,
                            toolCallId: chunk.id,
                            messages: stepInputMessages,
                            abortSignal,
                            experimental_context
                          });
                        }
                        controller.enqueue(chunk);
                        break;
                      }
                      case "error": {
                        controller.enqueue(chunk);
                        stepFinishReason = "error";
                        break;
                      }
                      case "raw": {
                        if (includeRawChunks2) {
                          controller.enqueue(chunk);
                        }
                        break;
                      }
                      default: {
                        const exhaustiveCheck = chunkType;
                        throw new Error(
                          `Unknown chunk type: ${exhaustiveCheck}`
                        );
                      }
                    }
                  },
                  // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
                  async flush(controller) {
                    const stepToolCallsJson = stepToolCalls.length > 0 ? JSON.stringify(stepToolCalls) : void 0;
                    try {
                      doStreamSpan.setAttributes(
                        await selectTelemetryAttributes({
                          telemetry,
                          attributes: {
                            "ai.response.finishReason": stepFinishReason,
                            "ai.response.text": {
                              output: () => activeText
                            },
                            "ai.response.reasoning": {
                              output: () => {
                                const reasoningParts = recordedContent.filter(
                                  (c) => c.type === "reasoning"
                                );
                                return reasoningParts.length > 0 ? reasoningParts.map((r) => r.text).join("\n") : void 0;
                              }
                            },
                            "ai.response.toolCalls": {
                              output: () => stepToolCallsJson
                            },
                            "ai.response.id": stepResponse.id,
                            "ai.response.model": stepResponse.modelId,
                            "ai.response.timestamp": stepResponse.timestamp.toISOString(),
                            "ai.response.providerMetadata": JSON.stringify(stepProviderMetadata),
                            "ai.usage.inputTokens": stepUsage.inputTokens,
                            "ai.usage.outputTokens": stepUsage.outputTokens,
                            "ai.usage.totalTokens": stepUsage.totalTokens,
                            "ai.usage.reasoningTokens": stepUsage.reasoningTokens,
                            "ai.usage.cachedInputTokens": stepUsage.cachedInputTokens,
                            // standardized gen-ai llm span attributes:
                            "gen_ai.response.finish_reasons": [
                              stepFinishReason
                            ],
                            "gen_ai.response.id": stepResponse.id,
                            "gen_ai.response.model": stepResponse.modelId,
                            "gen_ai.usage.input_tokens": stepUsage.inputTokens,
                            "gen_ai.usage.output_tokens": stepUsage.outputTokens
                          }
                        })
                      );
                    } catch (error) {
                    } finally {
                      doStreamSpan.end();
                    }
                    controller.enqueue({
                      type: "finish-step",
                      finishReason: stepFinishReason,
                      rawFinishReason: stepRawFinishReason,
                      usage: stepUsage,
                      providerMetadata: stepProviderMetadata,
                      response: {
                        ...stepResponse,
                        headers: response == null ? void 0 : response.headers
                      }
                    });
                    const combinedUsage = addLanguageModelUsage(
                      usage,
                      stepUsage
                    );
                    await stepFinish.promise;
                    const clientToolCalls = stepToolCalls.filter(
                      (toolCall) => toolCall.providerExecuted !== true
                    );
                    const clientToolOutputs = stepToolOutputs.filter(
                      (toolOutput) => toolOutput.providerExecuted !== true
                    );
                    for (const toolCall of stepToolCalls) {
                      if (toolCall.providerExecuted !== true)
                        continue;
                      const tool2 = tools == null ? void 0 : tools[toolCall.toolName];
                      if ((tool2 == null ? void 0 : tool2.type) === "provider" && tool2.supportsDeferredResults) {
                        const hasResultInStep = stepToolOutputs.some(
                          (output2) => (output2.type === "tool-result" || output2.type === "tool-error") && output2.toolCallId === toolCall.toolCallId
                        );
                        if (!hasResultInStep) {
                          pendingDeferredToolCalls.set(toolCall.toolCallId, {
                            toolName: toolCall.toolName
                          });
                        }
                      }
                    }
                    for (const output2 of stepToolOutputs) {
                      if (output2.type === "tool-result" || output2.type === "tool-error") {
                        pendingDeferredToolCalls.delete(output2.toolCallId);
                      }
                    }
                    clearStepTimeout();
                    clearChunkTimeout();
                    if (
                      // Continue if:
                      // 1. There are client tool calls that have all been executed, OR
                      // 2. There are pending deferred results from provider-executed tools
                      (clientToolCalls.length > 0 && clientToolOutputs.length === clientToolCalls.length || pendingDeferredToolCalls.size > 0) && // continue until a stop condition is met:
                      !await isStopConditionMet({
                        stopConditions,
                        steps: recordedSteps
                      })
                    ) {
                      responseMessages.push(
                        ...await toResponseMessages({
                          content: (
                            // use transformed content to create the messages for the next step:
                            recordedSteps[recordedSteps.length - 1].content
                          ),
                          tools
                        })
                      );
                      try {
                        await streamStep({
                          currentStep: currentStep + 1,
                          responseMessages,
                          usage: combinedUsage
                        });
                      } catch (error) {
                        controller.enqueue({
                          type: "error",
                          error
                        });
                        self2.closeStream();
                      }
                    } else {
                      controller.enqueue({
                        type: "finish",
                        finishReason: stepFinishReason,
                        rawFinishReason: stepRawFinishReason,
                        totalUsage: combinedUsage
                      });
                      self2.closeStream();
                    }
                  }
                })
              )
            );
          } finally {
            clearStepTimeout();
            clearChunkTimeout();
          }
        }
        await streamStep({
          currentStep: 0,
          responseMessages: initialResponseMessages,
          usage: createNullLanguageModelUsage()
        });
      }
    }).catch((error) => {
      self2.addStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "error", error });
            controller.close();
          }
        })
      );
      self2.closeStream();
    });
  }
  get steps() {
    this.consumeStream();
    return this._steps.promise;
  }
  get finalStep() {
    return this.steps.then((steps) => steps[steps.length - 1]);
  }
  get content() {
    return this.finalStep.then((step) => step.content);
  }
  get warnings() {
    return this.finalStep.then((step) => step.warnings);
  }
  get providerMetadata() {
    return this.finalStep.then((step) => step.providerMetadata);
  }
  get text() {
    return this.finalStep.then((step) => step.text);
  }
  get reasoningText() {
    return this.finalStep.then((step) => step.reasoningText);
  }
  get reasoning() {
    return this.finalStep.then((step) => step.reasoning);
  }
  get sources() {
    return this.finalStep.then((step) => step.sources);
  }
  get files() {
    return this.finalStep.then((step) => step.files);
  }
  get toolCalls() {
    return this.finalStep.then((step) => step.toolCalls);
  }
  get staticToolCalls() {
    return this.finalStep.then((step) => step.staticToolCalls);
  }
  get dynamicToolCalls() {
    return this.finalStep.then((step) => step.dynamicToolCalls);
  }
  get toolResults() {
    return this.finalStep.then((step) => step.toolResults);
  }
  get staticToolResults() {
    return this.finalStep.then((step) => step.staticToolResults);
  }
  get dynamicToolResults() {
    return this.finalStep.then((step) => step.dynamicToolResults);
  }
  get usage() {
    return this.finalStep.then((step) => step.usage);
  }
  get request() {
    return this.finalStep.then((step) => step.request);
  }
  get response() {
    return this.finalStep.then((step) => step.response);
  }
  get totalUsage() {
    this.consumeStream();
    return this._totalUsage.promise;
  }
  get finishReason() {
    this.consumeStream();
    return this._finishReason.promise;
  }
  get rawFinishReason() {
    this.consumeStream();
    return this._rawFinishReason.promise;
  }
  /**
   * Split out a new stream from the original stream.
   * The original stream is replaced to allow for further splitting,
   * since we do not know how many times the stream will be split.
   *
   * Note: this leads to buffering the stream content on the server.
   * However, the LLM results are expected to be small enough to not cause issues.
   */
  teeStream() {
    const [stream1, stream2] = this.baseStream.tee();
    this.baseStream = stream2;
    return stream1;
  }
  get textStream() {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream({
          transform({ part }, controller) {
            if (part.type === "text-delta") {
              controller.enqueue(part.text);
            }
          }
        })
      )
    );
  }
  get fullStream() {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream({
          transform({ part }, controller) {
            controller.enqueue(part);
          }
        })
      )
    );
  }
  async consumeStream(options) {
    var _a21;
    try {
      await consumeStream({
        stream: this.fullStream,
        onError: options == null ? void 0 : options.onError
      });
    } catch (error) {
      (_a21 = options == null ? void 0 : options.onError) == null ? void 0 : _a21.call(options, error);
    }
  }
  get experimental_partialOutputStream() {
    return this.partialOutputStream;
  }
  get partialOutputStream() {
    return createAsyncIterableStream(
      this.teeStream().pipeThrough(
        new TransformStream({
          transform({ partialOutput }, controller) {
            if (partialOutput != null) {
              controller.enqueue(partialOutput);
            }
          }
        })
      )
    );
  }
  get elementStream() {
    var _a21, _b15, _c;
    const transform = (_a21 = this.outputSpecification) == null ? void 0 : _a21.createElementStreamTransform();
    if (transform == null) {
      throw new UnsupportedFunctionalityError$1({
        functionality: `element streams in ${(_c = (_b15 = this.outputSpecification) == null ? void 0 : _b15.name) != null ? _c : "text"} mode`
      });
    }
    return createAsyncIterableStream(this.teeStream().pipeThrough(transform));
  }
  get output() {
    return this.finalStep.then((step) => {
      var _a21;
      const output = (_a21 = this.outputSpecification) != null ? _a21 : text();
      return output.parseCompleteOutput(
        { text: step.text },
        {
          response: step.response,
          usage: step.usage,
          finishReason: step.finishReason
        }
      );
    });
  }
  toUIMessageStream({
    originalMessages,
    generateMessageId,
    onFinish,
    messageMetadata,
    sendReasoning = true,
    sendSources = false,
    sendStart = true,
    sendFinish = true,
    onError = getErrorMessage$2
  } = {}) {
    const responseMessageId = generateMessageId != null ? getResponseUIMessageId({
      originalMessages,
      responseMessageId: generateMessageId
    }) : void 0;
    const isDynamic = (part) => {
      var _a21;
      const tool2 = (_a21 = this.tools) == null ? void 0 : _a21[part.toolName];
      if (tool2 == null) {
        return part.dynamic;
      }
      return (tool2 == null ? void 0 : tool2.type) === "dynamic" ? true : void 0;
    };
    const baseStream = this.fullStream.pipeThrough(
      new TransformStream({
        transform: async (part, controller) => {
          const messageMetadataValue = messageMetadata == null ? void 0 : messageMetadata({ part });
          const partType = part.type;
          switch (partType) {
            case "text-start": {
              controller.enqueue({
                type: "text-start",
                id: part.id,
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
              });
              break;
            }
            case "text-delta": {
              controller.enqueue({
                type: "text-delta",
                id: part.id,
                delta: part.text,
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
              });
              break;
            }
            case "text-end": {
              controller.enqueue({
                type: "text-end",
                id: part.id,
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
              });
              break;
            }
            case "reasoning-start": {
              controller.enqueue({
                type: "reasoning-start",
                id: part.id,
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
              });
              break;
            }
            case "reasoning-delta": {
              if (sendReasoning) {
                controller.enqueue({
                  type: "reasoning-delta",
                  id: part.id,
                  delta: part.text,
                  ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
                });
              }
              break;
            }
            case "reasoning-end": {
              controller.enqueue({
                type: "reasoning-end",
                id: part.id,
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
              });
              break;
            }
            case "file": {
              controller.enqueue({
                type: "file",
                mediaType: part.file.mediaType,
                url: `data:${part.file.mediaType};base64,${part.file.base64}`,
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
              });
              break;
            }
            case "source": {
              if (sendSources && part.sourceType === "url") {
                controller.enqueue({
                  type: "source-url",
                  sourceId: part.id,
                  url: part.url,
                  title: part.title,
                  ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
                });
              }
              if (sendSources && part.sourceType === "document") {
                controller.enqueue({
                  type: "source-document",
                  sourceId: part.id,
                  mediaType: part.mediaType,
                  title: part.title,
                  filename: part.filename,
                  ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {}
                });
              }
              break;
            }
            case "tool-input-start": {
              const dynamic = isDynamic(part);
              controller.enqueue({
                type: "tool-input-start",
                toolCallId: part.id,
                toolName: part.toolName,
                ...part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {},
                ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {},
                ...dynamic != null ? { dynamic } : {},
                ...part.title != null ? { title: part.title } : {}
              });
              break;
            }
            case "tool-input-delta": {
              controller.enqueue({
                type: "tool-input-delta",
                toolCallId: part.id,
                inputTextDelta: part.delta
              });
              break;
            }
            case "tool-call": {
              const dynamic = isDynamic(part);
              if (part.invalid) {
                controller.enqueue({
                  type: "tool-input-error",
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                  ...part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {},
                  ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {},
                  ...dynamic != null ? { dynamic } : {},
                  errorText: onError(part.error),
                  ...part.title != null ? { title: part.title } : {}
                });
              } else {
                controller.enqueue({
                  type: "tool-input-available",
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                  ...part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {},
                  ...part.providerMetadata != null ? { providerMetadata: part.providerMetadata } : {},
                  ...dynamic != null ? { dynamic } : {},
                  ...part.title != null ? { title: part.title } : {}
                });
              }
              break;
            }
            case "tool-approval-request": {
              controller.enqueue({
                type: "tool-approval-request",
                approvalId: part.approvalId,
                toolCallId: part.toolCall.toolCallId
              });
              break;
            }
            case "tool-result": {
              const dynamic = isDynamic(part);
              controller.enqueue({
                type: "tool-output-available",
                toolCallId: part.toolCallId,
                output: part.output,
                ...part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {},
                ...part.preliminary != null ? { preliminary: part.preliminary } : {},
                ...dynamic != null ? { dynamic } : {}
              });
              break;
            }
            case "tool-error": {
              const dynamic = isDynamic(part);
              controller.enqueue({
                type: "tool-output-error",
                toolCallId: part.toolCallId,
                errorText: onError(part.error),
                ...part.providerExecuted != null ? { providerExecuted: part.providerExecuted } : {},
                ...dynamic != null ? { dynamic } : {}
              });
              break;
            }
            case "tool-output-denied": {
              controller.enqueue({
                type: "tool-output-denied",
                toolCallId: part.toolCallId
              });
              break;
            }
            case "error": {
              controller.enqueue({
                type: "error",
                errorText: onError(part.error)
              });
              break;
            }
            case "start-step": {
              controller.enqueue({ type: "start-step" });
              break;
            }
            case "finish-step": {
              controller.enqueue({ type: "finish-step" });
              break;
            }
            case "start": {
              if (sendStart) {
                controller.enqueue({
                  type: "start",
                  ...messageMetadataValue != null ? { messageMetadata: messageMetadataValue } : {},
                  ...responseMessageId != null ? { messageId: responseMessageId } : {}
                });
              }
              break;
            }
            case "finish": {
              if (sendFinish) {
                controller.enqueue({
                  type: "finish",
                  finishReason: part.finishReason,
                  ...messageMetadataValue != null ? { messageMetadata: messageMetadataValue } : {}
                });
              }
              break;
            }
            case "abort": {
              controller.enqueue(part);
              break;
            }
            case "tool-input-end": {
              break;
            }
            case "raw": {
              break;
            }
            default: {
              const exhaustiveCheck = partType;
              throw new Error(`Unknown chunk type: ${exhaustiveCheck}`);
            }
          }
          if (messageMetadataValue != null && partType !== "start" && partType !== "finish") {
            controller.enqueue({
              type: "message-metadata",
              messageMetadata: messageMetadataValue
            });
          }
        }
      })
    );
    return createAsyncIterableStream(
      handleUIMessageStreamFinish({
        stream: baseStream,
        messageId: responseMessageId != null ? responseMessageId : generateMessageId == null ? void 0 : generateMessageId(),
        originalMessages,
        onFinish,
        onError
      })
    );
  }
  pipeUIMessageStreamToResponse(response, {
    originalMessages,
    generateMessageId,
    onFinish,
    messageMetadata,
    sendReasoning,
    sendSources,
    sendFinish,
    sendStart,
    onError,
    ...init
  } = {}) {
    pipeUIMessageStreamToResponse({
      response,
      stream: this.toUIMessageStream({
        originalMessages,
        generateMessageId,
        onFinish,
        messageMetadata,
        sendReasoning,
        sendSources,
        sendFinish,
        sendStart,
        onError
      }),
      ...init
    });
  }
  pipeTextStreamToResponse(response, init) {
    pipeTextStreamToResponse({
      response,
      textStream: this.textStream,
      ...init
    });
  }
  toUIMessageStreamResponse({
    originalMessages,
    generateMessageId,
    onFinish,
    messageMetadata,
    sendReasoning,
    sendSources,
    sendFinish,
    sendStart,
    onError,
    ...init
  } = {}) {
    return createUIMessageStreamResponse({
      stream: this.toUIMessageStream({
        originalMessages,
        generateMessageId,
        onFinish,
        messageMetadata,
        sendReasoning,
        sendSources,
        sendFinish,
        sendStart,
        onError
      }),
      ...init
    });
  }
  toTextStreamResponse(init) {
    return createTextStreamResponse({
      textStream: this.textStream,
      ...init
    });
  }
};
var ToolLoopAgent = class {
  constructor(settings) {
    this.version = "agent-v1";
    this.settings = settings;
  }
  /**
   * The id of the agent.
   */
  get id() {
    return this.settings.id;
  }
  /**
   * The tools that the agent can use.
   */
  get tools() {
    return this.settings.tools;
  }
  async prepareCall(options) {
    var _a21, _b15, _c, _d;
    const {
      experimental_onStart: _settingsOnStart,
      experimental_onStepStart: _settingsOnStepStart,
      experimental_onToolCallStart: _settingsOnToolCallStart,
      experimental_onToolCallFinish: _settingsOnToolCallFinish,
      onStepFinish: _settingsOnStepFinish,
      onFinish: _settingsOnFinish,
      ...settingsWithoutCallbacks
    } = this.settings;
    const baseCallArgs = {
      ...settingsWithoutCallbacks,
      stopWhen: (_a21 = this.settings.stopWhen) != null ? _a21 : stepCountIs(20),
      ...options
    };
    const preparedCallArgs = (_d = await ((_c = (_b15 = this.settings).prepareCall) == null ? void 0 : _c.call(
      _b15,
      baseCallArgs
    ))) != null ? _d : baseCallArgs;
    const { instructions, messages, prompt, ...callArgs } = preparedCallArgs;
    return {
      ...callArgs,
      // restore prompt types
      ...{ system: instructions, messages, prompt }
    };
  }
  mergeCallbacks(settingsCallback, methodCallback) {
    if (methodCallback && settingsCallback) {
      return async (event) => {
        await settingsCallback(event);
        await methodCallback(event);
      };
    }
    return methodCallback != null ? methodCallback : settingsCallback;
  }
  /**
   * Generates an output from the agent (non-streaming).
   */
  async generate({
    abortSignal,
    timeout,
    experimental_onStart,
    experimental_onStepStart,
    experimental_onToolCallStart,
    experimental_onToolCallFinish,
    onStepFinish,
    onFinish,
    ...options
  }) {
    return generateText({
      ...await this.prepareCall(options),
      abortSignal,
      timeout,
      experimental_onStart: this.mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart
      ),
      experimental_onStepStart: this.mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart
      ),
      experimental_onToolCallStart: this.mergeCallbacks(
        this.settings.experimental_onToolCallStart,
        experimental_onToolCallStart
      ),
      experimental_onToolCallFinish: this.mergeCallbacks(
        this.settings.experimental_onToolCallFinish,
        experimental_onToolCallFinish
      ),
      onStepFinish: this.mergeCallbacks(
        this.settings.onStepFinish,
        onStepFinish
      ),
      onFinish: this.mergeCallbacks(this.settings.onFinish, onFinish)
    });
  }
  /**
   * Streams an output from the agent (streaming).
   */
  async stream({
    abortSignal,
    timeout,
    experimental_transform,
    experimental_onStart,
    experimental_onStepStart,
    experimental_onToolCallStart,
    experimental_onToolCallFinish,
    onStepFinish,
    onFinish,
    ...options
  }) {
    return streamText({
      ...await this.prepareCall(options),
      abortSignal,
      timeout,
      experimental_transform,
      experimental_onStart: this.mergeCallbacks(
        this.settings.experimental_onStart,
        experimental_onStart
      ),
      experimental_onStepStart: this.mergeCallbacks(
        this.settings.experimental_onStepStart,
        experimental_onStepStart
      ),
      experimental_onToolCallStart: this.mergeCallbacks(
        this.settings.experimental_onToolCallStart,
        experimental_onToolCallStart
      ),
      experimental_onToolCallFinish: this.mergeCallbacks(
        this.settings.experimental_onToolCallFinish,
        experimental_onToolCallFinish
      ),
      onStepFinish: this.mergeCallbacks(
        this.settings.onStepFinish,
        onStepFinish
      ),
      onFinish: this.mergeCallbacks(this.settings.onFinish, onFinish)
    });
  }
};
function createUIMessageStream({
  execute,
  onError = getErrorMessage$1,
  originalMessages,
  onStepFinish,
  onFinish,
  generateId: generateId2 = generateId$1
}) {
  let controller;
  const ongoingStreamPromises = [];
  const stream = new ReadableStream({
    start(controllerArg) {
      controller = controllerArg;
    }
  });
  function safeEnqueue(data) {
    try {
      controller.enqueue(data);
    } catch (error) {
    }
  }
  try {
    const result = execute({
      writer: {
        write(part) {
          safeEnqueue(part);
        },
        merge(streamArg) {
          ongoingStreamPromises.push(
            (async () => {
              const reader = streamArg.getReader();
              while (true) {
                const { done, value } = await reader.read();
                if (done)
                  break;
                safeEnqueue(value);
              }
            })().catch((error) => {
              safeEnqueue({
                type: "error",
                errorText: onError(error)
              });
            })
          );
        },
        onError
      }
    });
    if (result) {
      ongoingStreamPromises.push(
        result.catch((error) => {
          safeEnqueue({
            type: "error",
            errorText: onError(error)
          });
        })
      );
    }
  } catch (error) {
    safeEnqueue({
      type: "error",
      errorText: onError(error)
    });
  }
  const waitForStreams = new Promise(async (resolve3) => {
    while (ongoingStreamPromises.length > 0) {
      await ongoingStreamPromises.shift();
    }
    resolve3();
  });
  waitForStreams.finally(() => {
    try {
      controller.close();
    } catch (error) {
    }
  });
  return handleUIMessageStreamFinish({
    stream,
    messageId: generateId2(),
    originalMessages,
    onStepFinish,
    onFinish,
    onError
  });
}
function readUIMessageStream({
  message,
  stream,
  onError,
  terminateOnError = false
}) {
  var _a21;
  let controller;
  let hasErrored = false;
  const outputStream = new ReadableStream({
    start(controllerParam) {
      controller = controllerParam;
    }
  });
  const state = createStreamingUIMessageState({
    messageId: (_a21 = message == null ? void 0 : message.id) != null ? _a21 : "",
    lastMessage: message
  });
  const handleError = (error) => {
    onError == null ? void 0 : onError(error);
    if (!hasErrored && terminateOnError) {
      hasErrored = true;
      controller == null ? void 0 : controller.error(error);
    }
  };
  consumeStream({
    stream: processUIMessageStream({
      stream,
      runUpdateMessageJob(job) {
        return job({
          state,
          write: () => {
            controller == null ? void 0 : controller.enqueue(structuredClone(state.message));
          }
        });
      },
      onError: handleError
    }),
    onError: handleError
  }).finally(() => {
    if (!hasErrored) {
      controller == null ? void 0 : controller.close();
    }
  });
  return createAsyncIterableStream(outputStream);
}
async function convertToModelMessages(messages, options) {
  const modelMessages = [];
  if (options == null ? void 0 : options.ignoreIncompleteToolCalls) {
    messages = messages.map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) => !isToolUIPart(part) || part.state !== "input-streaming" && part.state !== "input-available"
      )
    }));
  }
  for (const message of messages) {
    switch (message.role) {
      case "system": {
        const textParts = message.parts.filter(
          (part) => part.type === "text"
        );
        const providerMetadata = textParts.reduce((acc, part) => {
          if (part.providerMetadata != null) {
            return { ...acc, ...part.providerMetadata };
          }
          return acc;
        }, {});
        modelMessages.push({
          role: "system",
          content: textParts.map((part) => part.text).join(""),
          ...Object.keys(providerMetadata).length > 0 ? { providerOptions: providerMetadata } : {}
        });
        break;
      }
      case "user": {
        modelMessages.push({
          role: "user",
          content: message.parts.map((part) => {
            var _a21;
            if (isTextUIPart(part)) {
              return {
                type: "text",
                text: part.text,
                ...part.providerMetadata != null ? { providerOptions: part.providerMetadata } : {}
              };
            }
            if (isFileUIPart(part)) {
              return {
                type: "file",
                mediaType: part.mediaType,
                filename: part.filename,
                data: part.url,
                ...part.providerMetadata != null ? { providerOptions: part.providerMetadata } : {}
              };
            }
            if (isDataUIPart(part)) {
              return (_a21 = options == null ? void 0 : options.convertDataPart) == null ? void 0 : _a21.call(
                options,
                part
              );
            }
          }).filter(isNonNullable$1)
        });
        break;
      }
      case "assistant": {
        if (message.parts != null) {
          let block = [];
          async function processBlock() {
            var _a21, _b15, _c, _d, _e, _f;
            if (block.length === 0) {
              return;
            }
            const content = [];
            for (const part of block) {
              if (isTextUIPart(part)) {
                content.push({
                  type: "text",
                  text: part.text,
                  ...part.providerMetadata != null ? { providerOptions: part.providerMetadata } : {}
                });
              } else if (isFileUIPart(part)) {
                content.push({
                  type: "file",
                  mediaType: part.mediaType,
                  filename: part.filename,
                  data: part.url,
                  ...part.providerMetadata != null ? { providerOptions: part.providerMetadata } : {}
                });
              } else if (isReasoningUIPart(part)) {
                content.push({
                  type: "reasoning",
                  text: part.text,
                  providerOptions: part.providerMetadata
                });
              } else if (isToolUIPart(part)) {
                const toolName = getToolName(part);
                if (part.state !== "input-streaming") {
                  content.push({
                    type: "tool-call",
                    toolCallId: part.toolCallId,
                    toolName,
                    input: part.state === "output-error" ? (_a21 = part.input) != null ? _a21 : "rawInput" in part ? part.rawInput : void 0 : part.input,
                    providerExecuted: part.providerExecuted,
                    ...part.callProviderMetadata != null ? { providerOptions: part.callProviderMetadata } : {}
                  });
                  if (part.approval != null) {
                    content.push({
                      type: "tool-approval-request",
                      approvalId: part.approval.id,
                      toolCallId: part.toolCallId
                    });
                  }
                  if (part.providerExecuted === true && part.state !== "approval-responded" && (part.state === "output-available" || part.state === "output-error")) {
                    content.push({
                      type: "tool-result",
                      toolCallId: part.toolCallId,
                      toolName,
                      output: await createToolModelOutput({
                        toolCallId: part.toolCallId,
                        input: part.input,
                        output: part.state === "output-error" ? part.errorText : part.output,
                        tool: (_b15 = options == null ? void 0 : options.tools) == null ? void 0 : _b15[toolName],
                        errorMode: part.state === "output-error" ? "json" : "none"
                      }),
                      ...part.callProviderMetadata != null ? { providerOptions: part.callProviderMetadata } : {}
                    });
                  }
                }
              } else if (isDataUIPart(part)) {
                const dataPart = (_c = options == null ? void 0 : options.convertDataPart) == null ? void 0 : _c.call(
                  options,
                  part
                );
                if (dataPart != null) {
                  content.push(dataPart);
                }
              } else {
                const _exhaustiveCheck = part;
                throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
              }
            }
            modelMessages.push({
              role: "assistant",
              content
            });
            const toolParts = block.filter(
              (part) => {
                var _a22;
                return isToolUIPart(part) && (part.providerExecuted !== true || ((_a22 = part.approval) == null ? void 0 : _a22.approved) != null);
              }
            );
            if (toolParts.length > 0) {
              {
                const content2 = [];
                for (const toolPart of toolParts) {
                  if (((_d = toolPart.approval) == null ? void 0 : _d.approved) != null) {
                    content2.push({
                      type: "tool-approval-response",
                      approvalId: toolPart.approval.id,
                      approved: toolPart.approval.approved,
                      reason: toolPart.approval.reason,
                      providerExecuted: toolPart.providerExecuted
                    });
                  }
                  if (toolPart.providerExecuted === true) {
                    continue;
                  }
                  switch (toolPart.state) {
                    case "output-denied": {
                      content2.push({
                        type: "tool-result",
                        toolCallId: toolPart.toolCallId,
                        toolName: getToolName(toolPart),
                        output: {
                          type: "error-text",
                          value: (_e = toolPart.approval.reason) != null ? _e : "Tool execution denied."
                        },
                        ...toolPart.callProviderMetadata != null ? { providerOptions: toolPart.callProviderMetadata } : {}
                      });
                      break;
                    }
                    case "output-error":
                    case "output-available": {
                      const toolName = getToolName(toolPart);
                      content2.push({
                        type: "tool-result",
                        toolCallId: toolPart.toolCallId,
                        toolName,
                        output: await createToolModelOutput({
                          toolCallId: toolPart.toolCallId,
                          input: toolPart.input,
                          output: toolPart.state === "output-error" ? toolPart.errorText : toolPart.output,
                          tool: (_f = options == null ? void 0 : options.tools) == null ? void 0 : _f[toolName],
                          errorMode: toolPart.state === "output-error" ? "text" : "none"
                        }),
                        ...toolPart.callProviderMetadata != null ? { providerOptions: toolPart.callProviderMetadata } : {}
                      });
                      break;
                    }
                  }
                }
                if (content2.length > 0) {
                  modelMessages.push({
                    role: "tool",
                    content: content2
                  });
                }
              }
            }
            block = [];
          }
          for (const part of message.parts) {
            if (isTextUIPart(part) || isReasoningUIPart(part) || isFileUIPart(part) || isToolUIPart(part) || isDataUIPart(part)) {
              block.push(part);
            } else if (part.type === "step-start") {
              await processBlock();
            }
          }
          await processBlock();
          break;
        }
        break;
      }
      default: {
        const _exhaustiveCheck = message.role;
        throw new MessageConversionError({
          originalMessage: message,
          message: `Unsupported role: ${_exhaustiveCheck}`
        });
      }
    }
  }
  return modelMessages;
}
var uiMessagesSchema = lazySchema$1(
  () => zodSchema$1(
    array$1(
      object$1({
        id: string(),
        role: _enum(["system", "user", "assistant"]),
        metadata: unknown().optional(),
        parts: array$1(
          union([
            object$1({
              type: literal("text"),
              text: string(),
              state: _enum(["streaming", "done"]).optional(),
              providerMetadata: providerMetadataSchema.optional()
            }),
            object$1({
              type: literal("reasoning"),
              text: string(),
              state: _enum(["streaming", "done"]).optional(),
              providerMetadata: providerMetadataSchema.optional()
            }),
            object$1({
              type: literal("source-url"),
              sourceId: string(),
              url: string(),
              title: string().optional(),
              providerMetadata: providerMetadataSchema.optional()
            }),
            object$1({
              type: literal("source-document"),
              sourceId: string(),
              mediaType: string(),
              title: string(),
              filename: string().optional(),
              providerMetadata: providerMetadataSchema.optional()
            }),
            object$1({
              type: literal("file"),
              mediaType: string(),
              filename: string().optional(),
              url: string(),
              providerMetadata: providerMetadataSchema.optional()
            }),
            object$1({
              type: literal("step-start")
            }),
            object$1({
              type: string().startsWith("data-"),
              id: string().optional(),
              data: unknown()
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("input-streaming"),
              input: unknown().optional(),
              providerExecuted: boolean().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              output: never().optional(),
              errorText: never().optional(),
              approval: never().optional()
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("input-available"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: never().optional()
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("approval-requested"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: never().optional(),
                reason: never().optional()
              })
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("approval-responded"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: boolean(),
                reason: string().optional()
              })
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("output-available"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: unknown(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              preliminary: boolean().optional(),
              approval: object$1({
                id: string(),
                approved: literal(true),
                reason: string().optional()
              }).optional()
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("output-error"),
              input: unknown(),
              rawInput: unknown().optional(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: string(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: literal(true),
                reason: string().optional()
              }).optional()
            }),
            object$1({
              type: literal("dynamic-tool"),
              toolName: string(),
              toolCallId: string(),
              state: literal("output-denied"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: literal(false),
                reason: string().optional()
              })
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("input-streaming"),
              providerExecuted: boolean().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              input: unknown().optional(),
              output: never().optional(),
              errorText: never().optional(),
              approval: never().optional()
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("input-available"),
              providerExecuted: boolean().optional(),
              input: unknown(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: never().optional()
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("approval-requested"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: never().optional(),
                reason: never().optional()
              })
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("approval-responded"),
              input: unknown(),
              providerExecuted: boolean().optional(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: boolean(),
                reason: string().optional()
              })
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("output-available"),
              providerExecuted: boolean().optional(),
              input: unknown(),
              output: unknown(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              preliminary: boolean().optional(),
              approval: object$1({
                id: string(),
                approved: literal(true),
                reason: string().optional()
              }).optional()
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("output-error"),
              providerExecuted: boolean().optional(),
              input: unknown(),
              rawInput: unknown().optional(),
              output: never().optional(),
              errorText: string(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: literal(true),
                reason: string().optional()
              }).optional()
            }),
            object$1({
              type: string().startsWith("tool-"),
              toolCallId: string(),
              state: literal("output-denied"),
              providerExecuted: boolean().optional(),
              input: unknown(),
              output: never().optional(),
              errorText: never().optional(),
              callProviderMetadata: providerMetadataSchema.optional(),
              approval: object$1({
                id: string(),
                approved: literal(false),
                reason: string().optional()
              })
            })
          ])
        ).nonempty("Message must contain at least one part")
      })
    ).nonempty("Messages array must not be empty")
  )
);
async function safeValidateUIMessages({
  messages,
  metadataSchema,
  dataSchemas,
  tools
}) {
  try {
    if (messages == null) {
      return {
        success: false,
        error: new InvalidArgumentError3({
          parameter: "messages",
          value: messages,
          message: "messages parameter must be provided"
        })
      };
    }
    const validatedMessages = await validateTypes$1({
      value: messages,
      schema: uiMessagesSchema
    });
    if (metadataSchema) {
      for (const [msgIdx, message] of validatedMessages.entries()) {
        await validateTypes$1({
          value: message.metadata,
          schema: metadataSchema,
          context: {
            field: `messages[${msgIdx}].metadata`,
            entityId: message.id
          }
        });
      }
    }
    if (dataSchemas || tools) {
      for (const [msgIdx, message] of validatedMessages.entries()) {
        for (const [partIdx, part] of message.parts.entries()) {
          if (dataSchemas && part.type.startsWith("data-")) {
            const dataPart = part;
            const dataName = dataPart.type.slice(5);
            const dataSchema = dataSchemas[dataName];
            if (!dataSchema) {
              return {
                success: false,
                error: new TypeValidationError$1({
                  value: dataPart.data,
                  cause: `No data schema found for data part ${dataName}`,
                  context: {
                    field: `messages[${msgIdx}].parts[${partIdx}].data`,
                    entityName: dataName,
                    entityId: dataPart.id
                  }
                })
              };
            }
            await validateTypes$1({
              value: dataPart.data,
              schema: dataSchema,
              context: {
                field: `messages[${msgIdx}].parts[${partIdx}].data`,
                entityName: dataName,
                entityId: dataPart.id
              }
            });
          }
          if (tools && part.type.startsWith("tool-")) {
            const toolPart = part;
            const toolName = toolPart.type.slice(5);
            const tool2 = tools[toolName];
            if (!tool2) {
              return {
                success: false,
                error: new TypeValidationError$1({
                  value: toolPart.input,
                  cause: `No tool schema found for tool part ${toolName}`,
                  context: {
                    field: `messages[${msgIdx}].parts[${partIdx}].input`,
                    entityName: toolName,
                    entityId: toolPart.toolCallId
                  }
                })
              };
            }
            if (toolPart.state === "input-available" || toolPart.state === "output-available" || toolPart.state === "output-error" && toolPart.input !== void 0) {
              await validateTypes$1({
                value: toolPart.input,
                schema: tool2.inputSchema,
                context: {
                  field: `messages[${msgIdx}].parts[${partIdx}].input`,
                  entityName: toolName,
                  entityId: toolPart.toolCallId
                }
              });
            }
            if (toolPart.state === "output-available" && tool2.outputSchema) {
              await validateTypes$1({
                value: toolPart.output,
                schema: tool2.outputSchema,
                context: {
                  field: `messages[${msgIdx}].parts[${partIdx}].output`,
                  entityName: toolName,
                  entityId: toolPart.toolCallId
                }
              });
            }
          }
        }
      }
    }
    return {
      success: true,
      data: validatedMessages
    };
  } catch (error) {
    const err = error;
    return {
      success: false,
      error: err
    };
  }
}
async function validateUIMessages({
  messages,
  metadataSchema,
  dataSchemas,
  tools
}) {
  const response = await safeValidateUIMessages({
    messages,
    metadataSchema,
    dataSchemas,
    tools
  });
  if (!response.success)
    throw response.error;
  return response.data;
}
async function createAgentUIStream({
  agent,
  uiMessages,
  options,
  abortSignal,
  timeout,
  experimental_transform,
  onStepFinish,
  ...uiMessageStreamOptions
}) {
  var _a21;
  const validatedMessages = await validateUIMessages({
    messages: uiMessages,
    tools: agent.tools
  });
  const modelMessages = await convertToModelMessages(validatedMessages, {
    tools: agent.tools
  });
  const result = await agent.stream({
    prompt: modelMessages,
    options,
    abortSignal,
    timeout,
    experimental_transform,
    onStepFinish
  });
  return result.toUIMessageStream({
    ...uiMessageStreamOptions,
    // TODO reading `originalMessages` is here for bc, always use `validatedMessages` in v7
    originalMessages: (_a21 = uiMessageStreamOptions.originalMessages) != null ? _a21 : validatedMessages
  });
}
async function createAgentUIStreamResponse({
  headers,
  status,
  statusText,
  consumeSseStream,
  ...options
}) {
  return createUIMessageStreamResponse({
    headers,
    status,
    statusText,
    consumeSseStream,
    stream: await createAgentUIStream(options)
  });
}
async function pipeAgentUIStreamToResponse({
  response,
  headers,
  status,
  statusText,
  consumeSseStream,
  ...options
}) {
  pipeUIMessageStreamToResponse({
    response,
    headers,
    status,
    statusText,
    consumeSseStream,
    stream: await createAgentUIStream(options)
  });
}
async function embed({
  model: modelArg,
  value,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  experimental_telemetry: telemetry
}) {
  const model = resolveEmbeddingModel(modelArg);
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
    settings: { maxRetries }
  });
  const tracer = getTracer(telemetry);
  return recordSpan({
    name: "ai.embed",
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: "ai.embed", telemetry }),
        ...baseTelemetryAttributes,
        "ai.value": { input: () => JSON.stringify(value) }
      }
    }),
    tracer,
    fn: async (span) => {
      const { embedding, usage, warnings, response, providerMetadata } = await retry(
        () => (
          // nested spans to align with the embedMany telemetry data:
          recordSpan({
            name: "ai.embed.doEmbed",
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: "ai.embed.doEmbed",
                  telemetry
                }),
                ...baseTelemetryAttributes,
                // specific settings that only make sense on the outer level:
                "ai.values": { input: () => [JSON.stringify(value)] }
              }
            }),
            tracer,
            fn: async (doEmbedSpan) => {
              var _a21;
              const modelResponse = await model.doEmbed({
                values: [value],
                abortSignal,
                headers: headersWithUserAgent,
                providerOptions
              });
              const embedding2 = modelResponse.embeddings[0];
              const usage2 = (_a21 = modelResponse.usage) != null ? _a21 : { tokens: NaN };
              doEmbedSpan.setAttributes(
                await selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    "ai.embeddings": {
                      output: () => modelResponse.embeddings.map(
                        (embedding3) => JSON.stringify(embedding3)
                      )
                    },
                    "ai.usage.tokens": usage2.tokens
                  }
                })
              );
              return {
                embedding: embedding2,
                usage: usage2,
                warnings: modelResponse.warnings,
                providerMetadata: modelResponse.providerMetadata,
                response: modelResponse.response
              };
            }
          })
        )
      );
      span.setAttributes(
        await selectTelemetryAttributes({
          telemetry,
          attributes: {
            "ai.embedding": { output: () => JSON.stringify(embedding) },
            "ai.usage.tokens": usage.tokens
          }
        })
      );
      logWarnings({ warnings, provider: model.provider, model: model.modelId });
      return new DefaultEmbedResult({
        value,
        embedding,
        usage,
        warnings,
        providerMetadata,
        response
      });
    }
  });
}
var DefaultEmbedResult = class {
  constructor(options) {
    this.value = options.value;
    this.embedding = options.embedding;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.response = options.response;
  }
};
function splitArray(array2, chunkSize) {
  if (chunkSize <= 0) {
    throw new Error("chunkSize must be greater than 0");
  }
  const result = [];
  for (let i = 0; i < array2.length; i += chunkSize) {
    result.push(array2.slice(i, i + chunkSize));
  }
  return result;
}
async function embedMany({
  model: modelArg,
  values,
  maxParallelCalls = Infinity,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  providerOptions,
  experimental_telemetry: telemetry
}) {
  const model = resolveEmbeddingModel(modelArg);
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
    settings: { maxRetries }
  });
  const tracer = getTracer(telemetry);
  return recordSpan({
    name: "ai.embedMany",
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: "ai.embedMany", telemetry }),
        ...baseTelemetryAttributes,
        // specific settings that only make sense on the outer level:
        "ai.values": {
          input: () => values.map((value) => JSON.stringify(value))
        }
      }
    }),
    tracer,
    fn: async (span) => {
      var _a21;
      const [maxEmbeddingsPerCall, supportsParallelCalls] = await Promise.all([
        model.maxEmbeddingsPerCall,
        model.supportsParallelCalls
      ]);
      if (maxEmbeddingsPerCall == null || maxEmbeddingsPerCall === Infinity) {
        const { embeddings: embeddings2, usage, warnings: warnings2, response, providerMetadata: providerMetadata2 } = await retry(() => {
          return recordSpan({
            name: "ai.embedMany.doEmbed",
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: "ai.embedMany.doEmbed",
                  telemetry
                }),
                ...baseTelemetryAttributes,
                // specific settings that only make sense on the outer level:
                "ai.values": {
                  input: () => values.map((value) => JSON.stringify(value))
                }
              }
            }),
            tracer,
            fn: async (doEmbedSpan) => {
              var _a22;
              const modelResponse = await model.doEmbed({
                values,
                abortSignal,
                headers: headersWithUserAgent,
                providerOptions
              });
              const embeddings3 = modelResponse.embeddings;
              const usage2 = (_a22 = modelResponse.usage) != null ? _a22 : { tokens: NaN };
              doEmbedSpan.setAttributes(
                await selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    "ai.embeddings": {
                      output: () => embeddings3.map(
                        (embedding) => JSON.stringify(embedding)
                      )
                    },
                    "ai.usage.tokens": usage2.tokens
                  }
                })
              );
              return {
                embeddings: embeddings3,
                usage: usage2,
                warnings: modelResponse.warnings,
                providerMetadata: modelResponse.providerMetadata,
                response: modelResponse.response
              };
            }
          });
        });
        span.setAttributes(
          await selectTelemetryAttributes({
            telemetry,
            attributes: {
              "ai.embeddings": {
                output: () => embeddings2.map((embedding) => JSON.stringify(embedding))
              },
              "ai.usage.tokens": usage.tokens
            }
          })
        );
        logWarnings({
          warnings: warnings2,
          provider: model.provider,
          model: model.modelId
        });
        return new DefaultEmbedManyResult({
          values,
          embeddings: embeddings2,
          usage,
          warnings: warnings2,
          providerMetadata: providerMetadata2,
          responses: [response]
        });
      }
      const valueChunks = splitArray(values, maxEmbeddingsPerCall);
      const embeddings = [];
      const warnings = [];
      const responses = [];
      let tokens = 0;
      let providerMetadata;
      const parallelChunks = splitArray(
        valueChunks,
        supportsParallelCalls ? maxParallelCalls : 1
      );
      for (const parallelChunk of parallelChunks) {
        const results = await Promise.all(
          parallelChunk.map((chunk) => {
            return retry(() => {
              return recordSpan({
                name: "ai.embedMany.doEmbed",
                attributes: selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    ...assembleOperationName({
                      operationId: "ai.embedMany.doEmbed",
                      telemetry
                    }),
                    ...baseTelemetryAttributes,
                    // specific settings that only make sense on the outer level:
                    "ai.values": {
                      input: () => chunk.map((value) => JSON.stringify(value))
                    }
                  }
                }),
                tracer,
                fn: async (doEmbedSpan) => {
                  var _a22;
                  const modelResponse = await model.doEmbed({
                    values: chunk,
                    abortSignal,
                    headers: headersWithUserAgent,
                    providerOptions
                  });
                  const embeddings2 = modelResponse.embeddings;
                  const usage = (_a22 = modelResponse.usage) != null ? _a22 : { tokens: NaN };
                  doEmbedSpan.setAttributes(
                    await selectTelemetryAttributes({
                      telemetry,
                      attributes: {
                        "ai.embeddings": {
                          output: () => embeddings2.map(
                            (embedding) => JSON.stringify(embedding)
                          )
                        },
                        "ai.usage.tokens": usage.tokens
                      }
                    })
                  );
                  return {
                    embeddings: embeddings2,
                    usage,
                    warnings: modelResponse.warnings,
                    providerMetadata: modelResponse.providerMetadata,
                    response: modelResponse.response
                  };
                }
              });
            });
          })
        );
        for (const result of results) {
          embeddings.push(...result.embeddings);
          warnings.push(...result.warnings);
          responses.push(result.response);
          tokens += result.usage.tokens;
          if (result.providerMetadata) {
            if (!providerMetadata) {
              providerMetadata = { ...result.providerMetadata };
            } else {
              for (const [providerName, metadata] of Object.entries(
                result.providerMetadata
              )) {
                providerMetadata[providerName] = {
                  ...(_a21 = providerMetadata[providerName]) != null ? _a21 : {},
                  ...metadata
                };
              }
            }
          }
        }
      }
      span.setAttributes(
        await selectTelemetryAttributes({
          telemetry,
          attributes: {
            "ai.embeddings": {
              output: () => embeddings.map((embedding) => JSON.stringify(embedding))
            },
            "ai.usage.tokens": tokens
          }
        })
      );
      logWarnings({
        warnings,
        provider: model.provider,
        model: model.modelId
      });
      return new DefaultEmbedManyResult({
        values,
        embeddings,
        usage: { tokens },
        warnings,
        providerMetadata,
        responses
      });
    }
  });
}
var DefaultEmbedManyResult = class {
  constructor(options) {
    this.values = options.values;
    this.embeddings = options.embeddings;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.responses = options.responses;
  }
};
async function generateImage({
  model: modelArg,
  prompt: promptArg,
  n = 1,
  maxImagesPerCall,
  size,
  aspectRatio,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers
}) {
  var _a21, _b15;
  const model = resolveImageModel(modelArg);
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const maxImagesPerCallWithDefault = (_a21 = maxImagesPerCall != null ? maxImagesPerCall : await invokeModelMaxImagesPerCall(model)) != null ? _a21 : 1;
  const callCount = Math.ceil(n / maxImagesPerCallWithDefault);
  const callImageCounts = Array.from({ length: callCount }, (_, i) => {
    if (i < callCount - 1) {
      return maxImagesPerCallWithDefault;
    }
    const remainder = n % maxImagesPerCallWithDefault;
    return remainder === 0 ? maxImagesPerCallWithDefault : remainder;
  });
  const results = await Promise.all(
    callImageCounts.map(
      async (callImageCount) => retry(() => {
        const { prompt, files, mask } = normalizePrompt(promptArg);
        return model.doGenerate({
          prompt,
          files,
          mask,
          n: callImageCount,
          abortSignal,
          headers: headersWithUserAgent,
          size,
          aspectRatio,
          seed,
          providerOptions: providerOptions != null ? providerOptions : {}
        });
      })
    )
  );
  const images = [];
  const warnings = [];
  const responses = [];
  const providerMetadata = {};
  let totalUsage = {
    inputTokens: void 0,
    outputTokens: void 0,
    totalTokens: void 0
  };
  for (const result of results) {
    images.push(
      ...result.images.map(
        (image) => {
          var _a22;
          return new DefaultGeneratedFile({
            data: image,
            mediaType: (_a22 = detectMediaType({
              data: image,
              signatures: imageMediaTypeSignatures
            })) != null ? _a22 : "image/png"
          });
        }
      )
    );
    warnings.push(...result.warnings);
    if (result.usage != null) {
      totalUsage = addImageModelUsage(totalUsage, result.usage);
    }
    if (result.providerMetadata) {
      for (const [providerName, metadata] of Object.entries(result.providerMetadata)) {
        if (providerName === "gateway") {
          const currentEntry = providerMetadata[providerName];
          if (currentEntry != null && typeof currentEntry === "object") {
            providerMetadata[providerName] = {
              ...currentEntry,
              ...metadata
            };
          } else {
            providerMetadata[providerName] = metadata;
          }
          const imagesValue = providerMetadata[providerName].images;
          if (Array.isArray(imagesValue) && imagesValue.length === 0) {
            delete providerMetadata[providerName].images;
          }
        } else {
          (_b15 = providerMetadata[providerName]) != null ? _b15 : providerMetadata[providerName] = { images: [] };
          providerMetadata[providerName].images.push(
            ...result.providerMetadata[providerName].images
          );
        }
      }
    }
    responses.push(result.response);
  }
  logWarnings({ warnings, provider: model.provider, model: model.modelId });
  if (!images.length) {
    throw new NoImageGeneratedError({ responses });
  }
  return new DefaultGenerateImageResult({
    images,
    warnings,
    responses,
    providerMetadata,
    usage: totalUsage
  });
}
var DefaultGenerateImageResult = class {
  constructor(options) {
    this.images = options.images;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = options.providerMetadata;
    this.usage = options.usage;
  }
  get image() {
    return this.images[0];
  }
};
async function invokeModelMaxImagesPerCall(model) {
  const isFunction = model.maxImagesPerCall instanceof Function;
  if (!isFunction) {
    return model.maxImagesPerCall;
  }
  return model.maxImagesPerCall({
    modelId: model.modelId
  });
}
function normalizePrompt(prompt) {
  if (typeof prompt === "string") {
    return { prompt, files: void 0, mask: void 0 };
  }
  return {
    prompt: prompt.text,
    files: prompt.images.map(toImageModelV3File),
    mask: prompt.mask ? toImageModelV3File(prompt.mask) : void 0
  };
}
function toImageModelV3File(dataContent) {
  if (typeof dataContent === "string" && dataContent.startsWith("http")) {
    return {
      type: "url",
      url: dataContent
    };
  }
  if (typeof dataContent === "string" && dataContent.startsWith("data:")) {
    const { mediaType: dataUrlMediaType, base64Content } = splitDataUrl(dataContent);
    if (base64Content != null) {
      const uint8Data2 = convertBase64ToUint8Array$1(base64Content);
      return {
        type: "file",
        data: uint8Data2,
        mediaType: dataUrlMediaType || detectMediaType({
          data: uint8Data2,
          signatures: imageMediaTypeSignatures
        }) || "image/png"
      };
    }
  }
  const uint8Data = convertDataContentToUint8Array(dataContent);
  return {
    type: "file",
    data: uint8Data,
    mediaType: detectMediaType({
      data: uint8Data,
      signatures: imageMediaTypeSignatures
    }) || "image/png"
  };
}
var experimental_generateImage = generateImage;
var noSchemaOutputStrategy = {
  type: "no-schema",
  jsonSchema: async () => void 0,
  async validatePartialResult({ value, textDelta }) {
    return { success: true, value: { partial: value, textDelta } };
  },
  async validateFinalResult(value, context2) {
    return value === void 0 ? {
      success: false,
      error: new NoObjectGeneratedError({
        message: "No object generated: response did not match schema.",
        text: context2.text,
        response: context2.response,
        usage: context2.usage,
        finishReason: context2.finishReason
      })
    } : { success: true, value };
  },
  createElementStream() {
    throw new UnsupportedFunctionalityError$1({
      functionality: "element streams in no-schema mode"
    });
  }
};
var objectOutputStrategy = (schema) => ({
  type: "object",
  jsonSchema: async () => await schema.jsonSchema,
  async validatePartialResult({ value, textDelta }) {
    return {
      success: true,
      value: {
        // Note: currently no validation of partial results:
        partial: value,
        textDelta
      }
    };
  },
  async validateFinalResult(value) {
    return safeValidateTypes$1({ value, schema });
  },
  createElementStream() {
    throw new UnsupportedFunctionalityError$1({
      functionality: "element streams in object mode"
    });
  }
});
var arrayOutputStrategy = (schema) => {
  return {
    type: "array",
    // wrap in object that contains array of elements, since most LLMs will not
    // be able to generate an array directly:
    // possible future optimization: use arrays directly when model supports grammar-guided generation
    jsonSchema: async () => {
      const { $schema, ...itemSchema } = await schema.jsonSchema;
      return {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "object",
        properties: {
          elements: { type: "array", items: itemSchema }
        },
        required: ["elements"],
        additionalProperties: false
      };
    },
    async validatePartialResult({
      value,
      latestObject,
      isFirstDelta,
      isFinalDelta
    }) {
      var _a21;
      if (!isJSONObject(value) || !isJSONArray(value.elements)) {
        return {
          success: false,
          error: new TypeValidationError$1({
            value,
            cause: "value must be an object that contains an array of elements"
          })
        };
      }
      const inputArray = value.elements;
      const resultArray = [];
      for (let i = 0; i < inputArray.length; i++) {
        const element = inputArray[i];
        const result = await safeValidateTypes$1({ value: element, schema });
        if (i === inputArray.length - 1 && !isFinalDelta) {
          continue;
        }
        if (!result.success) {
          return result;
        }
        resultArray.push(result.value);
      }
      const publishedElementCount = (_a21 = latestObject == null ? void 0 : latestObject.length) != null ? _a21 : 0;
      let textDelta = "";
      if (isFirstDelta) {
        textDelta += "[";
      }
      if (publishedElementCount > 0) {
        textDelta += ",";
      }
      textDelta += resultArray.slice(publishedElementCount).map((element) => JSON.stringify(element)).join(",");
      if (isFinalDelta) {
        textDelta += "]";
      }
      return {
        success: true,
        value: {
          partial: resultArray,
          textDelta
        }
      };
    },
    async validateFinalResult(value) {
      if (!isJSONObject(value) || !isJSONArray(value.elements)) {
        return {
          success: false,
          error: new TypeValidationError$1({
            value,
            cause: "value must be an object that contains an array of elements"
          })
        };
      }
      const inputArray = value.elements;
      for (const element of inputArray) {
        const result = await safeValidateTypes$1({ value: element, schema });
        if (!result.success) {
          return result;
        }
      }
      return { success: true, value: inputArray };
    },
    createElementStream(originalStream) {
      let publishedElements = 0;
      return createAsyncIterableStream(
        originalStream.pipeThrough(
          new TransformStream({
            transform(chunk, controller) {
              switch (chunk.type) {
                case "object": {
                  const array2 = chunk.object;
                  for (; publishedElements < array2.length; publishedElements++) {
                    controller.enqueue(array2[publishedElements]);
                  }
                  break;
                }
                case "text-delta":
                case "finish":
                case "error":
                  break;
                default: {
                  const _exhaustiveCheck = chunk;
                  throw new Error(
                    `Unsupported chunk type: ${_exhaustiveCheck}`
                  );
                }
              }
            }
          })
        )
      );
    }
  };
};
var enumOutputStrategy = (enumValues) => {
  return {
    type: "enum",
    // wrap in object that contains result, since most LLMs will not
    // be able to generate an enum value directly:
    // possible future optimization: use enums directly when model supports top-level enums
    jsonSchema: async () => ({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {
        result: { type: "string", enum: enumValues }
      },
      required: ["result"],
      additionalProperties: false
    }),
    async validateFinalResult(value) {
      if (!isJSONObject(value) || typeof value.result !== "string") {
        return {
          success: false,
          error: new TypeValidationError$1({
            value,
            cause: 'value must be an object that contains a string in the "result" property.'
          })
        };
      }
      const result = value.result;
      return enumValues.includes(result) ? { success: true, value: result } : {
        success: false,
        error: new TypeValidationError$1({
          value,
          cause: "value must be a string in the enum"
        })
      };
    },
    async validatePartialResult({ value, textDelta }) {
      if (!isJSONObject(value) || typeof value.result !== "string") {
        return {
          success: false,
          error: new TypeValidationError$1({
            value,
            cause: 'value must be an object that contains a string in the "result" property.'
          })
        };
      }
      const result = value.result;
      const possibleEnumValues = enumValues.filter(
        (enumValue) => enumValue.startsWith(result)
      );
      if (value.result.length === 0 || possibleEnumValues.length === 0) {
        return {
          success: false,
          error: new TypeValidationError$1({
            value,
            cause: "value must be a string in the enum"
          })
        };
      }
      return {
        success: true,
        value: {
          partial: possibleEnumValues.length > 1 ? result : possibleEnumValues[0],
          textDelta
        }
      };
    },
    createElementStream() {
      throw new UnsupportedFunctionalityError$1({
        functionality: "element streams in enum mode"
      });
    }
  };
};
function getOutputStrategy({
  output,
  schema,
  enumValues
}) {
  switch (output) {
    case "object":
      return objectOutputStrategy(asSchema$1(schema));
    case "array":
      return arrayOutputStrategy(asSchema$1(schema));
    case "enum":
      return enumOutputStrategy(enumValues);
    case "no-schema":
      return noSchemaOutputStrategy;
    default: {
      const _exhaustiveCheck = output;
      throw new Error(`Unsupported output: ${_exhaustiveCheck}`);
    }
  }
}
async function parseAndValidateObjectResult(result, outputStrategy, context2) {
  const parseResult = await safeParseJSON$1({ text: result });
  if (!parseResult.success) {
    throw new NoObjectGeneratedError({
      message: "No object generated: could not parse the response.",
      cause: parseResult.error,
      text: result,
      response: context2.response,
      usage: context2.usage,
      finishReason: context2.finishReason
    });
  }
  const validationResult = await outputStrategy.validateFinalResult(
    parseResult.value,
    {
      text: result,
      response: context2.response,
      usage: context2.usage
    }
  );
  if (!validationResult.success) {
    throw new NoObjectGeneratedError({
      message: "No object generated: response did not match schema.",
      cause: validationResult.error,
      text: result,
      response: context2.response,
      usage: context2.usage,
      finishReason: context2.finishReason
    });
  }
  return validationResult.value;
}
async function parseAndValidateObjectResultWithRepair(result, outputStrategy, repairText, context2) {
  try {
    return await parseAndValidateObjectResult(result, outputStrategy, context2);
  } catch (error) {
    if (repairText != null && NoObjectGeneratedError.isInstance(error) && (JSONParseError$1.isInstance(error.cause) || TypeValidationError$1.isInstance(error.cause))) {
      const repairedText = await repairText({
        text: result,
        error: error.cause
      });
      if (repairedText === null) {
        throw error;
      }
      return await parseAndValidateObjectResult(
        repairedText,
        outputStrategy,
        context2
      );
    }
    throw error;
  }
}
function validateObjectGenerationInput({
  output,
  schema,
  schemaName,
  schemaDescription,
  enumValues
}) {
  if (output != null && output !== "object" && output !== "array" && output !== "enum" && output !== "no-schema") {
    throw new InvalidArgumentError3({
      parameter: "output",
      value: output,
      message: "Invalid output type."
    });
  }
  if (output === "no-schema") {
    if (schema != null) {
      throw new InvalidArgumentError3({
        parameter: "schema",
        value: schema,
        message: "Schema is not supported for no-schema output."
      });
    }
    if (schemaDescription != null) {
      throw new InvalidArgumentError3({
        parameter: "schemaDescription",
        value: schemaDescription,
        message: "Schema description is not supported for no-schema output."
      });
    }
    if (schemaName != null) {
      throw new InvalidArgumentError3({
        parameter: "schemaName",
        value: schemaName,
        message: "Schema name is not supported for no-schema output."
      });
    }
    if (enumValues != null) {
      throw new InvalidArgumentError3({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are not supported for no-schema output."
      });
    }
  }
  if (output === "object") {
    if (schema == null) {
      throw new InvalidArgumentError3({
        parameter: "schema",
        value: schema,
        message: "Schema is required for object output."
      });
    }
    if (enumValues != null) {
      throw new InvalidArgumentError3({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are not supported for object output."
      });
    }
  }
  if (output === "array") {
    if (schema == null) {
      throw new InvalidArgumentError3({
        parameter: "schema",
        value: schema,
        message: "Element schema is required for array output."
      });
    }
    if (enumValues != null) {
      throw new InvalidArgumentError3({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are not supported for array output."
      });
    }
  }
  if (output === "enum") {
    if (schema != null) {
      throw new InvalidArgumentError3({
        parameter: "schema",
        value: schema,
        message: "Schema is not supported for enum output."
      });
    }
    if (schemaDescription != null) {
      throw new InvalidArgumentError3({
        parameter: "schemaDescription",
        value: schemaDescription,
        message: "Schema description is not supported for enum output."
      });
    }
    if (schemaName != null) {
      throw new InvalidArgumentError3({
        parameter: "schemaName",
        value: schemaName,
        message: "Schema name is not supported for enum output."
      });
    }
    if (enumValues == null) {
      throw new InvalidArgumentError3({
        parameter: "enumValues",
        value: enumValues,
        message: "Enum values are required for enum output."
      });
    }
    for (const value of enumValues) {
      if (typeof value !== "string") {
        throw new InvalidArgumentError3({
          parameter: "enumValues",
          value,
          message: "Enum values must be strings."
        });
      }
    }
  }
}
var originalGenerateId3 = createIdGenerator$1({ prefix: "aiobj", size: 24 });
async function generateObject(options) {
  const {
    model: modelArg,
    output = "object",
    system,
    prompt,
    messages,
    maxRetries: maxRetriesArg,
    abortSignal,
    headers,
    experimental_repairText: repairText,
    experimental_telemetry: telemetry,
    experimental_download: download2,
    providerOptions,
    _internal: {
      generateId: generateId2 = originalGenerateId3,
      currentDate = () => /* @__PURE__ */ new Date()
    } = {},
    ...settings
  } = options;
  const model = resolveLanguageModel(modelArg);
  const enumValues = "enum" in options ? options.enum : void 0;
  const {
    schema: inputSchema,
    schemaDescription,
    schemaName
  } = "schema" in options ? options : {};
  validateObjectGenerationInput({
    output,
    schema: inputSchema,
    schemaName,
    schemaDescription,
    enumValues
  });
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const outputStrategy = getOutputStrategy({
    output,
    schema: inputSchema,
    enumValues
  });
  const callSettings = prepareCallSettings(settings);
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers: headersWithUserAgent,
    settings: { ...callSettings, maxRetries }
  });
  const tracer = getTracer(telemetry);
  const jsonSchema2 = await outputStrategy.jsonSchema();
  try {
    return await recordSpan({
      name: "ai.generateObject",
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: "ai.generateObject",
            telemetry
          }),
          ...baseTelemetryAttributes,
          // specific settings that only make sense on the outer level:
          "ai.prompt": {
            input: () => JSON.stringify({ system, prompt, messages })
          },
          "ai.schema": jsonSchema2 != null ? { input: () => JSON.stringify(jsonSchema2) } : void 0,
          "ai.schema.name": schemaName,
          "ai.schema.description": schemaDescription,
          "ai.settings.output": outputStrategy.type
        }
      }),
      tracer,
      fn: async (span) => {
        var _a21;
        let result;
        let finishReason;
        let usage;
        let warnings;
        let response;
        let request;
        let resultProviderMetadata;
        let reasoning;
        const standardizedPrompt = await standardizePrompt({
          system,
          prompt,
          messages
        });
        const promptMessages = await convertToLanguageModelPrompt({
          prompt: standardizedPrompt,
          supportedUrls: await model.supportedUrls,
          download: download2
        });
        const generateResult = await retry(
          () => recordSpan({
            name: "ai.generateObject.doGenerate",
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: "ai.generateObject.doGenerate",
                  telemetry
                }),
                ...baseTelemetryAttributes,
                "ai.prompt.messages": {
                  input: () => stringifyForTelemetry(promptMessages)
                },
                // standardized gen-ai llm span attributes:
                "gen_ai.system": model.provider,
                "gen_ai.request.model": model.modelId,
                "gen_ai.request.frequency_penalty": callSettings.frequencyPenalty,
                "gen_ai.request.max_tokens": callSettings.maxOutputTokens,
                "gen_ai.request.presence_penalty": callSettings.presencePenalty,
                "gen_ai.request.temperature": callSettings.temperature,
                "gen_ai.request.top_k": callSettings.topK,
                "gen_ai.request.top_p": callSettings.topP
              }
            }),
            tracer,
            fn: async (span2) => {
              var _a22, _b15, _c, _d, _e, _f, _g, _h;
              const result2 = await model.doGenerate({
                responseFormat: {
                  type: "json",
                  schema: jsonSchema2,
                  name: schemaName,
                  description: schemaDescription
                },
                ...prepareCallSettings(settings),
                prompt: promptMessages,
                providerOptions,
                abortSignal,
                headers: headersWithUserAgent
              });
              const responseData = {
                id: (_b15 = (_a22 = result2.response) == null ? void 0 : _a22.id) != null ? _b15 : generateId2(),
                timestamp: (_d = (_c = result2.response) == null ? void 0 : _c.timestamp) != null ? _d : currentDate(),
                modelId: (_f = (_e = result2.response) == null ? void 0 : _e.modelId) != null ? _f : model.modelId,
                headers: (_g = result2.response) == null ? void 0 : _g.headers,
                body: (_h = result2.response) == null ? void 0 : _h.body
              };
              const text2 = extractTextContent(result2.content);
              const reasoning2 = extractReasoningContent(result2.content);
              if (text2 === void 0) {
                throw new NoObjectGeneratedError({
                  message: "No object generated: the model did not return a response.",
                  response: responseData,
                  usage: asLanguageModelUsage(result2.usage),
                  finishReason: result2.finishReason.unified
                });
              }
              span2.setAttributes(
                await selectTelemetryAttributes({
                  telemetry,
                  attributes: {
                    "ai.response.finishReason": result2.finishReason.unified,
                    "ai.response.object": { output: () => text2 },
                    "ai.response.id": responseData.id,
                    "ai.response.model": responseData.modelId,
                    "ai.response.timestamp": responseData.timestamp.toISOString(),
                    "ai.response.providerMetadata": JSON.stringify(
                      result2.providerMetadata
                    ),
                    // TODO rename telemetry attributes to inputTokens and outputTokens
                    "ai.usage.promptTokens": result2.usage.inputTokens.total,
                    "ai.usage.completionTokens": result2.usage.outputTokens.total,
                    // standardized gen-ai llm span attributes:
                    "gen_ai.response.finish_reasons": [
                      result2.finishReason.unified
                    ],
                    "gen_ai.response.id": responseData.id,
                    "gen_ai.response.model": responseData.modelId,
                    "gen_ai.usage.input_tokens": result2.usage.inputTokens.total,
                    "gen_ai.usage.output_tokens": result2.usage.outputTokens.total
                  }
                })
              );
              return {
                ...result2,
                objectText: text2,
                reasoning: reasoning2,
                responseData
              };
            }
          })
        );
        result = generateResult.objectText;
        finishReason = generateResult.finishReason.unified;
        usage = asLanguageModelUsage(generateResult.usage);
        warnings = generateResult.warnings;
        resultProviderMetadata = generateResult.providerMetadata;
        request = (_a21 = generateResult.request) != null ? _a21 : {};
        response = generateResult.responseData;
        reasoning = generateResult.reasoning;
        logWarnings({
          warnings,
          provider: model.provider,
          model: model.modelId
        });
        const object2 = await parseAndValidateObjectResultWithRepair(
          result,
          outputStrategy,
          repairText,
          {
            response,
            usage,
            finishReason
          }
        );
        span.setAttributes(
          await selectTelemetryAttributes({
            telemetry,
            attributes: {
              "ai.response.finishReason": finishReason,
              "ai.response.object": {
                output: () => JSON.stringify(object2)
              },
              "ai.response.providerMetadata": JSON.stringify(
                resultProviderMetadata
              ),
              // TODO rename telemetry attributes to inputTokens and outputTokens
              "ai.usage.promptTokens": usage.inputTokens,
              "ai.usage.completionTokens": usage.outputTokens
            }
          })
        );
        return new DefaultGenerateObjectResult({
          object: object2,
          reasoning,
          finishReason,
          usage,
          warnings,
          request,
          response,
          providerMetadata: resultProviderMetadata
        });
      }
    });
  } catch (error) {
    throw wrapGatewayError(error);
  }
}
var DefaultGenerateObjectResult = class {
  constructor(options) {
    this.object = options.object;
    this.finishReason = options.finishReason;
    this.usage = options.usage;
    this.warnings = options.warnings;
    this.providerMetadata = options.providerMetadata;
    this.response = options.response;
    this.request = options.request;
    this.reasoning = options.reasoning;
  }
  toJsonResponse(init) {
    var _a21;
    return new Response(JSON.stringify(this.object), {
      status: (_a21 = init == null ? void 0 : init.status) != null ? _a21 : 200,
      headers: prepareHeaders(init == null ? void 0 : init.headers, {
        "content-type": "application/json; charset=utf-8"
      })
    });
  }
};
function cosineSimilarity(vector1, vector2) {
  if (vector1.length !== vector2.length) {
    throw new InvalidArgumentError3({
      parameter: "vector1,vector2",
      value: { vector1Length: vector1.length, vector2Length: vector2.length },
      message: `Vectors must have the same length`
    });
  }
  const n = vector1.length;
  if (n === 0) {
    return 0;
  }
  let magnitudeSquared1 = 0;
  let magnitudeSquared2 = 0;
  let dotProduct = 0;
  for (let i = 0; i < n; i++) {
    const value1 = vector1[i];
    const value2 = vector2[i];
    magnitudeSquared1 += value1 * value1;
    magnitudeSquared2 += value2 * value2;
    dotProduct += value1 * value2;
  }
  return magnitudeSquared1 === 0 || magnitudeSquared2 === 0 ? 0 : dotProduct / (Math.sqrt(magnitudeSquared1) * Math.sqrt(magnitudeSquared2));
}
function createDownload(options) {
  return ({ url, abortSignal }) => download({ url, maxBytes: options == null ? void 0 : options.maxBytes, abortSignal });
}
function getTextFromDataUrl(dataUrl) {
  const [header, base64Content] = dataUrl.split(",");
  const mediaType = header.split(";")[0].split(":")[1];
  if (mediaType == null || base64Content == null) {
    throw new Error("Invalid data URL format");
  }
  try {
    return window.atob(base64Content);
  } catch (error) {
    throw new Error(`Error decoding data URL`);
  }
}
function isDeepEqualData(obj1, obj2) {
  if (obj1 === obj2)
    return true;
  if (obj1 == null || obj2 == null)
    return false;
  if (typeof obj1 !== "object" && typeof obj2 !== "object")
    return obj1 === obj2;
  if (obj1.constructor !== obj2.constructor)
    return false;
  if (obj1 instanceof Date && obj2 instanceof Date) {
    return obj1.getTime() === obj2.getTime();
  }
  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length)
      return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!isDeepEqualData(obj1[i], obj2[i]))
        return false;
    }
    return true;
  }
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  if (keys1.length !== keys2.length)
    return false;
  for (const key of keys1) {
    if (!keys2.includes(key))
      return false;
    if (!isDeepEqualData(obj1[key], obj2[key]))
      return false;
  }
  return true;
}
var SerialJobExecutor = class {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }
  async processQueue() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    while (this.queue.length > 0) {
      await this.queue[0]();
      this.queue.shift();
    }
    this.isProcessing = false;
  }
  async run(job) {
    return new Promise((resolve3, reject) => {
      this.queue.push(async () => {
        try {
          await job();
          resolve3();
        } catch (error) {
          reject(error);
        }
      });
      void this.processQueue();
    });
  }
};
function simulateReadableStream({
  chunks,
  initialDelayInMs = 0,
  chunkDelayInMs = 0,
  _internal
}) {
  var _a21;
  const delay2 = (_a21 = _internal == null ? void 0 : _internal.delay) != null ? _a21 : delay;
  let index2 = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index2 < chunks.length) {
        await delay2(index2 === 0 ? initialDelayInMs : chunkDelayInMs);
        controller.enqueue(chunks[index2++]);
      } else {
        controller.close();
      }
    }
  });
}
var originalGenerateId4 = createIdGenerator$1({ prefix: "aiobj", size: 24 });
function streamObject(options) {
  const {
    model,
    output = "object",
    system,
    prompt,
    messages,
    maxRetries,
    abortSignal,
    headers,
    experimental_repairText: repairText,
    experimental_telemetry: telemetry,
    experimental_download: download2,
    providerOptions,
    onError = ({ error }) => {
      console.error(error);
    },
    onFinish,
    _internal: {
      generateId: generateId2 = originalGenerateId4,
      currentDate = () => /* @__PURE__ */ new Date(),
      now: now2 = now
    } = {},
    ...settings
  } = options;
  const enumValues = "enum" in options && options.enum ? options.enum : void 0;
  const {
    schema: inputSchema,
    schemaDescription,
    schemaName
  } = "schema" in options ? options : {};
  validateObjectGenerationInput({
    output,
    schema: inputSchema,
    schemaName,
    schemaDescription,
    enumValues
  });
  const outputStrategy = getOutputStrategy({
    output,
    schema: inputSchema,
    enumValues
  });
  return new DefaultStreamObjectResult({
    model,
    telemetry,
    headers,
    settings,
    maxRetries,
    abortSignal,
    outputStrategy,
    system,
    prompt,
    messages,
    schemaName,
    schemaDescription,
    providerOptions,
    repairText,
    onError,
    onFinish,
    download: download2,
    generateId: generateId2,
    currentDate,
    now: now2
  });
}
var DefaultStreamObjectResult = class {
  constructor({
    model: modelArg,
    headers,
    telemetry,
    settings,
    maxRetries: maxRetriesArg,
    abortSignal,
    outputStrategy,
    system,
    prompt,
    messages,
    schemaName,
    schemaDescription,
    providerOptions,
    repairText,
    onError,
    onFinish,
    download: download2,
    generateId: generateId2,
    currentDate,
    now: now2
  }) {
    this._object = new DelayedPromise();
    this._usage = new DelayedPromise();
    this._providerMetadata = new DelayedPromise();
    this._warnings = new DelayedPromise();
    this._request = new DelayedPromise();
    this._response = new DelayedPromise();
    this._finishReason = new DelayedPromise();
    const model = resolveLanguageModel(modelArg);
    const { maxRetries, retry } = prepareRetries({
      maxRetries: maxRetriesArg,
      abortSignal
    });
    const callSettings = prepareCallSettings(settings);
    const baseTelemetryAttributes = getBaseTelemetryAttributes({
      model,
      telemetry,
      headers,
      settings: { ...callSettings, maxRetries }
    });
    const tracer = getTracer(telemetry);
    const self2 = this;
    const stitchableStream = createStitchableStream();
    const eventProcessor = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        if (chunk.type === "error") {
          onError({ error: wrapGatewayError(chunk.error) });
        }
      }
    });
    this.baseStream = stitchableStream.stream.pipeThrough(eventProcessor);
    recordSpan({
      name: "ai.streamObject",
      attributes: selectTelemetryAttributes({
        telemetry,
        attributes: {
          ...assembleOperationName({
            operationId: "ai.streamObject",
            telemetry
          }),
          ...baseTelemetryAttributes,
          // specific settings that only make sense on the outer level:
          "ai.prompt": {
            input: () => JSON.stringify({ system, prompt, messages })
          },
          "ai.schema": {
            input: async () => JSON.stringify(await outputStrategy.jsonSchema())
          },
          "ai.schema.name": schemaName,
          "ai.schema.description": schemaDescription,
          "ai.settings.output": outputStrategy.type
        }
      }),
      tracer,
      endWhenDone: false,
      fn: async (rootSpan) => {
        const standardizedPrompt = await standardizePrompt({
          system,
          prompt,
          messages
        });
        const callOptions = {
          responseFormat: {
            type: "json",
            schema: await outputStrategy.jsonSchema(),
            name: schemaName,
            description: schemaDescription
          },
          ...prepareCallSettings(settings),
          prompt: await convertToLanguageModelPrompt({
            prompt: standardizedPrompt,
            supportedUrls: await model.supportedUrls,
            download: download2
          }),
          providerOptions,
          abortSignal,
          headers,
          includeRawChunks: false
        };
        const transformer = {
          transform: (chunk, controller) => {
            switch (chunk.type) {
              case "text-delta":
                controller.enqueue(chunk.delta);
                break;
              case "response-metadata":
              case "finish":
              case "error":
              case "stream-start":
                controller.enqueue(chunk);
                break;
            }
          }
        };
        const {
          result: { stream, response, request },
          doStreamSpan,
          startTimestampMs
        } = await retry(
          () => recordSpan({
            name: "ai.streamObject.doStream",
            attributes: selectTelemetryAttributes({
              telemetry,
              attributes: {
                ...assembleOperationName({
                  operationId: "ai.streamObject.doStream",
                  telemetry
                }),
                ...baseTelemetryAttributes,
                "ai.prompt.messages": {
                  input: () => stringifyForTelemetry(callOptions.prompt)
                },
                // standardized gen-ai llm span attributes:
                "gen_ai.system": model.provider,
                "gen_ai.request.model": model.modelId,
                "gen_ai.request.frequency_penalty": callSettings.frequencyPenalty,
                "gen_ai.request.max_tokens": callSettings.maxOutputTokens,
                "gen_ai.request.presence_penalty": callSettings.presencePenalty,
                "gen_ai.request.temperature": callSettings.temperature,
                "gen_ai.request.top_k": callSettings.topK,
                "gen_ai.request.top_p": callSettings.topP
              }
            }),
            tracer,
            endWhenDone: false,
            fn: async (doStreamSpan2) => ({
              startTimestampMs: now2(),
              doStreamSpan: doStreamSpan2,
              result: await model.doStream(callOptions)
            })
          })
        );
        self2._request.resolve(request != null ? request : {});
        let warnings;
        let usage = createNullLanguageModelUsage();
        let finishReason;
        let providerMetadata;
        let object2;
        let error;
        let accumulatedText = "";
        let textDelta = "";
        let fullResponse = {
          id: generateId2(),
          timestamp: currentDate(),
          modelId: model.modelId
        };
        let latestObjectJson = void 0;
        let latestObject = void 0;
        let isFirstChunk = true;
        let isFirstDelta = true;
        const transformedStream = stream.pipeThrough(new TransformStream(transformer)).pipeThrough(
          new TransformStream({
            async transform(chunk, controller) {
              var _a21, _b15, _c;
              if (typeof chunk === "object" && chunk.type === "stream-start") {
                warnings = chunk.warnings;
                return;
              }
              if (isFirstChunk) {
                const msToFirstChunk = now2() - startTimestampMs;
                isFirstChunk = false;
                doStreamSpan.addEvent("ai.stream.firstChunk", {
                  "ai.stream.msToFirstChunk": msToFirstChunk
                });
                doStreamSpan.setAttributes({
                  "ai.stream.msToFirstChunk": msToFirstChunk
                });
              }
              if (typeof chunk === "string") {
                accumulatedText += chunk;
                textDelta += chunk;
                const { value: currentObjectJson, state: parseState } = await parsePartialJson(accumulatedText);
                if (currentObjectJson !== void 0 && !isDeepEqualData(latestObjectJson, currentObjectJson)) {
                  const validationResult = await outputStrategy.validatePartialResult({
                    value: currentObjectJson,
                    textDelta,
                    latestObject,
                    isFirstDelta,
                    isFinalDelta: parseState === "successful-parse"
                  });
                  if (validationResult.success && !isDeepEqualData(
                    latestObject,
                    validationResult.value.partial
                  )) {
                    latestObjectJson = currentObjectJson;
                    latestObject = validationResult.value.partial;
                    controller.enqueue({
                      type: "object",
                      object: latestObject
                    });
                    controller.enqueue({
                      type: "text-delta",
                      textDelta: validationResult.value.textDelta
                    });
                    textDelta = "";
                    isFirstDelta = false;
                  }
                }
                return;
              }
              switch (chunk.type) {
                case "response-metadata": {
                  fullResponse = {
                    id: (_a21 = chunk.id) != null ? _a21 : fullResponse.id,
                    timestamp: (_b15 = chunk.timestamp) != null ? _b15 : fullResponse.timestamp,
                    modelId: (_c = chunk.modelId) != null ? _c : fullResponse.modelId
                  };
                  break;
                }
                case "finish": {
                  if (textDelta !== "") {
                    controller.enqueue({ type: "text-delta", textDelta });
                  }
                  finishReason = chunk.finishReason.unified;
                  usage = asLanguageModelUsage(chunk.usage);
                  providerMetadata = chunk.providerMetadata;
                  controller.enqueue({
                    ...chunk,
                    finishReason: chunk.finishReason.unified,
                    usage,
                    response: fullResponse
                  });
                  logWarnings({
                    warnings: warnings != null ? warnings : [],
                    provider: model.provider,
                    model: model.modelId
                  });
                  self2._usage.resolve(usage);
                  self2._providerMetadata.resolve(providerMetadata);
                  self2._warnings.resolve(warnings);
                  self2._response.resolve({
                    ...fullResponse,
                    headers: response == null ? void 0 : response.headers
                  });
                  self2._finishReason.resolve(finishReason != null ? finishReason : "other");
                  try {
                    object2 = await parseAndValidateObjectResultWithRepair(
                      accumulatedText,
                      outputStrategy,
                      repairText,
                      {
                        response: fullResponse,
                        usage,
                        finishReason
                      }
                    );
                    self2._object.resolve(object2);
                  } catch (e) {
                    error = e;
                    self2._object.reject(e);
                  }
                  break;
                }
                default: {
                  controller.enqueue(chunk);
                  break;
                }
              }
            },
            // invoke onFinish callback and resolve toolResults promise when the stream is about to close:
            async flush(controller) {
              try {
                const finalUsage = usage != null ? usage : {
                  promptTokens: NaN,
                  completionTokens: NaN,
                  totalTokens: NaN
                };
                doStreamSpan.setAttributes(
                  await selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      "ai.response.finishReason": finishReason,
                      "ai.response.object": {
                        output: () => JSON.stringify(object2)
                      },
                      "ai.response.id": fullResponse.id,
                      "ai.response.model": fullResponse.modelId,
                      "ai.response.timestamp": fullResponse.timestamp.toISOString(),
                      "ai.response.providerMetadata": JSON.stringify(providerMetadata),
                      "ai.usage.inputTokens": finalUsage.inputTokens,
                      "ai.usage.outputTokens": finalUsage.outputTokens,
                      "ai.usage.totalTokens": finalUsage.totalTokens,
                      "ai.usage.reasoningTokens": finalUsage.reasoningTokens,
                      "ai.usage.cachedInputTokens": finalUsage.cachedInputTokens,
                      // standardized gen-ai llm span attributes:
                      "gen_ai.response.finish_reasons": [finishReason],
                      "gen_ai.response.id": fullResponse.id,
                      "gen_ai.response.model": fullResponse.modelId,
                      "gen_ai.usage.input_tokens": finalUsage.inputTokens,
                      "gen_ai.usage.output_tokens": finalUsage.outputTokens
                    }
                  })
                );
                doStreamSpan.end();
                rootSpan.setAttributes(
                  await selectTelemetryAttributes({
                    telemetry,
                    attributes: {
                      "ai.usage.inputTokens": finalUsage.inputTokens,
                      "ai.usage.outputTokens": finalUsage.outputTokens,
                      "ai.usage.totalTokens": finalUsage.totalTokens,
                      "ai.usage.reasoningTokens": finalUsage.reasoningTokens,
                      "ai.usage.cachedInputTokens": finalUsage.cachedInputTokens,
                      "ai.response.object": {
                        output: () => JSON.stringify(object2)
                      },
                      "ai.response.providerMetadata": JSON.stringify(providerMetadata)
                    }
                  })
                );
                await (onFinish == null ? void 0 : onFinish({
                  usage: finalUsage,
                  object: object2,
                  error,
                  response: {
                    ...fullResponse,
                    headers: response == null ? void 0 : response.headers
                  },
                  warnings,
                  providerMetadata
                }));
              } catch (error2) {
                controller.enqueue({ type: "error", error: error2 });
              } finally {
                rootSpan.end();
              }
            }
          })
        );
        stitchableStream.addStream(transformedStream);
      }
    }).catch((error) => {
      stitchableStream.addStream(
        new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "error", error });
            controller.close();
          }
        })
      );
    }).finally(() => {
      stitchableStream.close();
    });
    this.outputStrategy = outputStrategy;
  }
  get object() {
    return this._object.promise;
  }
  get usage() {
    return this._usage.promise;
  }
  get providerMetadata() {
    return this._providerMetadata.promise;
  }
  get warnings() {
    return this._warnings.promise;
  }
  get request() {
    return this._request.promise;
  }
  get response() {
    return this._response.promise;
  }
  get finishReason() {
    return this._finishReason.promise;
  }
  get partialObjectStream() {
    return createAsyncIterableStream(
      this.baseStream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            switch (chunk.type) {
              case "object":
                controller.enqueue(chunk.object);
                break;
              case "text-delta":
              case "finish":
              case "error":
                break;
              default: {
                const _exhaustiveCheck = chunk;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          }
        })
      )
    );
  }
  get elementStream() {
    return this.outputStrategy.createElementStream(this.baseStream);
  }
  get textStream() {
    return createAsyncIterableStream(
      this.baseStream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            switch (chunk.type) {
              case "text-delta":
                controller.enqueue(chunk.textDelta);
                break;
              case "object":
              case "finish":
              case "error":
                break;
              default: {
                const _exhaustiveCheck = chunk;
                throw new Error(`Unsupported chunk type: ${_exhaustiveCheck}`);
              }
            }
          }
        })
      )
    );
  }
  get fullStream() {
    return createAsyncIterableStream(this.baseStream);
  }
  pipeTextStreamToResponse(response, init) {
    pipeTextStreamToResponse({
      response,
      textStream: this.textStream,
      ...init
    });
  }
  toTextStreamResponse(init) {
    return createTextStreamResponse({
      textStream: this.textStream,
      ...init
    });
  }
};
var DefaultGeneratedAudioFile = class extends DefaultGeneratedFile {
  constructor({
    data,
    mediaType
  }) {
    super({ data, mediaType });
    let format = "mp3";
    if (mediaType) {
      const mediaTypeParts = mediaType.split("/");
      if (mediaTypeParts.length === 2) {
        if (mediaType !== "audio/mpeg") {
          format = mediaTypeParts[1];
        }
      }
    }
    if (!format) {
      throw new Error(
        "Audio format must be provided or determinable from media type"
      );
    }
    this.format = format;
  }
};
async function generateSpeech({
  model,
  text: text2,
  voice,
  outputFormat,
  instructions,
  speed,
  language,
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers
}) {
  var _a21;
  const resolvedModel = resolveSpeechModel(model);
  if (!resolvedModel) {
    throw new Error("Model could not be resolved");
  }
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const result = await retry(
    () => resolvedModel.doGenerate({
      text: text2,
      voice,
      outputFormat,
      instructions,
      speed,
      language,
      abortSignal,
      headers: headersWithUserAgent,
      providerOptions
    })
  );
  if (!result.audio || result.audio.length === 0) {
    throw new NoSpeechGeneratedError({ responses: [result.response] });
  }
  logWarnings({
    warnings: result.warnings,
    provider: resolvedModel.provider,
    model: resolvedModel.modelId
  });
  return new DefaultSpeechResult({
    audio: new DefaultGeneratedAudioFile({
      data: result.audio,
      mediaType: (_a21 = detectMediaType({
        data: result.audio,
        signatures: audioMediaTypeSignatures
      })) != null ? _a21 : "audio/mp3"
    }),
    warnings: result.warnings,
    responses: [result.response],
    providerMetadata: result.providerMetadata
  });
}
var DefaultSpeechResult = class {
  constructor(options) {
    var _a21;
    this.audio = options.audio;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = (_a21 = options.providerMetadata) != null ? _a21 : {};
  }
};
function pruneMessages({
  messages,
  reasoning = "none",
  toolCalls = [],
  emptyMessages = "remove"
}) {
  if (reasoning === "all" || reasoning === "before-last-message") {
    messages = messages.map((message, messageIndex) => {
      if (message.role !== "assistant" || typeof message.content === "string" || reasoning === "before-last-message" && messageIndex === messages.length - 1) {
        return message;
      }
      return {
        ...message,
        content: message.content.filter((part) => part.type !== "reasoning")
      };
    });
  }
  if (toolCalls === "none") {
    toolCalls = [];
  } else if (toolCalls === "all") {
    toolCalls = [{ type: "all" }];
  } else if (toolCalls === "before-last-message") {
    toolCalls = [{ type: "before-last-message" }];
  } else if (typeof toolCalls === "string") {
    toolCalls = [{ type: toolCalls }];
  }
  for (const toolCall of toolCalls) {
    const keepLastMessagesCount = toolCall.type === "all" ? void 0 : toolCall.type === "before-last-message" ? 1 : Number(
      toolCall.type.slice("before-last-".length).slice(0, -"-messages".length)
    );
    const keptToolCallIds = /* @__PURE__ */ new Set();
    const keptApprovalIds = /* @__PURE__ */ new Set();
    if (keepLastMessagesCount != null) {
      for (const message of messages.slice(-keepLastMessagesCount)) {
        if ((message.role === "assistant" || message.role === "tool") && typeof message.content !== "string") {
          for (const part of message.content) {
            if (part.type === "tool-call" || part.type === "tool-result") {
              keptToolCallIds.add(part.toolCallId);
            } else if (part.type === "tool-approval-request" || part.type === "tool-approval-response") {
              keptApprovalIds.add(part.approvalId);
            }
          }
        }
      }
    }
    messages = messages.map((message, messageIndex) => {
      if (message.role !== "assistant" && message.role !== "tool" || typeof message.content === "string" || keepLastMessagesCount && messageIndex >= messages.length - keepLastMessagesCount) {
        return message;
      }
      const toolCallIdToToolName = {};
      const approvalIdToToolName = {};
      return {
        ...message,
        content: message.content.filter((part) => {
          if (part.type !== "tool-call" && part.type !== "tool-result" && part.type !== "tool-approval-request" && part.type !== "tool-approval-response") {
            return true;
          }
          if (part.type === "tool-call") {
            toolCallIdToToolName[part.toolCallId] = part.toolName;
          } else if (part.type === "tool-approval-request") {
            approvalIdToToolName[part.approvalId] = toolCallIdToToolName[part.toolCallId];
          }
          if ((part.type === "tool-call" || part.type === "tool-result") && keptToolCallIds.has(part.toolCallId) || (part.type === "tool-approval-request" || part.type === "tool-approval-response") && keptApprovalIds.has(part.approvalId)) {
            return true;
          }
          return toolCall.tools != null && !toolCall.tools.includes(
            part.type === "tool-call" || part.type === "tool-result" ? part.toolName : approvalIdToToolName[part.approvalId]
          );
        })
      };
    });
  }
  if (emptyMessages === "remove") {
    messages = messages.filter((message) => message.content.length > 0);
  }
  return messages;
}
var CHUNKING_REGEXPS = {
  word: /\S+\s+/m,
  line: /\n+/m
};
function smoothStream({
  delayInMs = 10,
  chunking = "word",
  _internal: { delay: delay2 = delay } = {}
} = {}) {
  let detectChunk;
  if (chunking != null && typeof chunking === "object" && "segment" in chunking && typeof chunking.segment === "function") {
    const segmenter = chunking;
    detectChunk = (buffer) => {
      if (buffer.length === 0)
        return null;
      const iterator = segmenter.segment(buffer)[Symbol.iterator]();
      const first = iterator.next().value;
      return (first == null ? void 0 : first.segment) || null;
    };
  } else if (typeof chunking === "function") {
    detectChunk = (buffer) => {
      const match = chunking(buffer);
      if (match == null) {
        return null;
      }
      if (!match.length) {
        throw new Error(`Chunking function must return a non-empty string.`);
      }
      if (!buffer.startsWith(match)) {
        throw new Error(
          `Chunking function must return a match that is a prefix of the buffer. Received: "${match}" expected to start with "${buffer}"`
        );
      }
      return match;
    };
  } else {
    const chunkingRegex = typeof chunking === "string" ? CHUNKING_REGEXPS[chunking] : chunking instanceof RegExp ? chunking : void 0;
    if (chunkingRegex == null) {
      throw new InvalidArgumentError$2({
        argument: "chunking",
        message: `Chunking must be "word", "line", a RegExp, an Intl.Segmenter, or a ChunkDetector function. Received: ${chunking}`
      });
    }
    detectChunk = (buffer) => {
      const match = chunkingRegex.exec(buffer);
      if (!match) {
        return null;
      }
      return buffer.slice(0, match.index) + (match == null ? void 0 : match[0]);
    };
  }
  return () => {
    let buffer = "";
    let id = "";
    let type = void 0;
    let providerMetadata = void 0;
    function flushBuffer(controller) {
      if (buffer.length > 0 && type !== void 0) {
        controller.enqueue({
          type,
          text: buffer,
          id,
          ...providerMetadata != null ? { providerMetadata } : {}
        });
        buffer = "";
        providerMetadata = void 0;
      }
    }
    return new TransformStream({
      async transform(chunk, controller) {
        if (chunk.type !== "text-delta" && chunk.type !== "reasoning-delta") {
          flushBuffer(controller);
          controller.enqueue(chunk);
          return;
        }
        if ((chunk.type !== type || chunk.id !== id) && buffer.length > 0) {
          flushBuffer(controller);
        }
        buffer += chunk.text;
        id = chunk.id;
        type = chunk.type;
        if (chunk.providerMetadata != null) {
          providerMetadata = chunk.providerMetadata;
        }
        let match;
        while ((match = detectChunk(buffer)) != null) {
          controller.enqueue({ type, text: match, id });
          buffer = buffer.slice(match.length);
          await delay2(delayInMs);
        }
      }
    });
  };
}
var defaultDownload = createDownload();
async function experimental_generateVideo({
  model: modelArg,
  prompt: promptArg,
  n = 1,
  maxVideosPerCall,
  aspectRatio,
  resolution,
  duration,
  fps,
  seed,
  providerOptions,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  download: downloadFn = defaultDownload
}) {
  var _a21;
  const model = resolveVideoModel(modelArg);
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const { prompt, image } = normalizePrompt2(promptArg);
  const maxVideosPerCallWithDefault = (_a21 = maxVideosPerCall != null ? maxVideosPerCall : await invokeModelMaxVideosPerCall(model)) != null ? _a21 : 1;
  const callCount = Math.ceil(n / maxVideosPerCallWithDefault);
  const callVideoCounts = Array.from({ length: callCount }, (_, index2) => {
    const remaining = n - index2 * maxVideosPerCallWithDefault;
    return Math.min(remaining, maxVideosPerCallWithDefault);
  });
  const results = await Promise.all(
    callVideoCounts.map(
      async (callVideoCount) => retry(
        () => model.doGenerate({
          prompt,
          n: callVideoCount,
          aspectRatio,
          resolution,
          duration,
          fps,
          seed,
          image,
          providerOptions: providerOptions != null ? providerOptions : {},
          headers: headersWithUserAgent,
          abortSignal
        })
      )
    )
  );
  const videos = [];
  const warnings = [];
  const responses = [];
  const providerMetadata = {};
  for (const result of results) {
    for (const videoData of result.videos) {
      switch (videoData.type) {
        case "url": {
          const { data, mediaType: downloadedMediaType } = await downloadFn({
            url: new URL(videoData.url),
            abortSignal
          });
          const isUsableMediaType = (type) => !!type && type !== "application/octet-stream";
          const mediaType = isUsableMediaType(videoData.mediaType) && videoData.mediaType || isUsableMediaType(downloadedMediaType) && downloadedMediaType || detectMediaType({
            data,
            signatures: videoMediaTypeSignatures
          }) || "video/mp4";
          videos.push(
            new DefaultGeneratedFile({
              data,
              mediaType
            })
          );
          break;
        }
        case "base64": {
          videos.push(
            new DefaultGeneratedFile({
              data: videoData.data,
              mediaType: videoData.mediaType || "video/mp4"
            })
          );
          break;
        }
        case "binary": {
          const mediaType = videoData.mediaType || detectMediaType({
            data: videoData.data,
            signatures: videoMediaTypeSignatures
          }) || "video/mp4";
          videos.push(
            new DefaultGeneratedFile({
              data: videoData.data,
              mediaType
            })
          );
          break;
        }
      }
    }
    warnings.push(...result.warnings);
    responses.push({
      timestamp: result.response.timestamp,
      modelId: result.response.modelId,
      headers: result.response.headers,
      providerMetadata: result.providerMetadata
    });
    if (result.providerMetadata != null) {
      for (const [providerName, metadata] of Object.entries(
        result.providerMetadata
      )) {
        const existingMetadata = providerMetadata[providerName];
        if (existingMetadata != null && typeof existingMetadata === "object") {
          providerMetadata[providerName] = {
            ...existingMetadata,
            ...metadata
          };
          if ("videos" in existingMetadata && Array.isArray(existingMetadata.videos) && "videos" in metadata && Array.isArray(metadata.videos)) {
            providerMetadata[providerName].videos = [
              ...existingMetadata.videos,
              ...metadata.videos
            ];
          }
        } else {
          providerMetadata[providerName] = metadata;
        }
      }
    }
  }
  if (videos.length === 0) {
    throw new NoVideoGeneratedError({ responses });
  }
  if (warnings.length > 0) {
    logWarnings({
      warnings,
      provider: model.provider,
      model: model.modelId
    });
  }
  return {
    video: videos[0],
    videos,
    warnings,
    responses,
    providerMetadata
  };
}
function normalizePrompt2(promptArg) {
  var _a21, _b15;
  if (typeof promptArg === "string") {
    return {
      prompt: promptArg,
      image: void 0
    };
  }
  let image;
  if (promptArg.image != null) {
    const dataContent = promptArg.image;
    if (typeof dataContent === "string") {
      if (dataContent.startsWith("http://") || dataContent.startsWith("https://")) {
        image = {
          type: "url",
          url: dataContent
        };
      } else if (dataContent.startsWith("data:")) {
        const { mediaType, base64Content } = splitDataUrl(dataContent);
        image = {
          type: "file",
          mediaType: mediaType != null ? mediaType : "image/png",
          data: convertBase64ToUint8Array$1(base64Content != null ? base64Content : "")
        };
      } else {
        const bytes = convertBase64ToUint8Array$1(dataContent);
        const mediaType = (_a21 = detectMediaType({
          data: bytes,
          signatures: imageMediaTypeSignatures
        })) != null ? _a21 : "image/png";
        image = {
          type: "file",
          mediaType,
          data: bytes
        };
      }
    } else if (dataContent instanceof Uint8Array) {
      const mediaType = (_b15 = detectMediaType({
        data: dataContent,
        signatures: imageMediaTypeSignatures
      })) != null ? _b15 : "image/png";
      image = {
        type: "file",
        mediaType,
        data: dataContent
      };
    }
  }
  return {
    prompt: promptArg.text,
    image
  };
}
async function invokeModelMaxVideosPerCall(model) {
  if (typeof model.maxVideosPerCall === "function") {
    return await model.maxVideosPerCall({ modelId: model.modelId });
  }
  return model.maxVideosPerCall;
}
function defaultEmbeddingSettingsMiddleware({
  settings
}) {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      return mergeObjects(settings, params);
    }
  };
}
function defaultSettingsMiddleware({
  settings
}) {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      return mergeObjects(settings, params);
    }
  };
}
function defaultTransform(text2) {
  return text2.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
}
function extractJsonMiddleware(options) {
  var _a21;
  const transform = (_a21 = options == null ? void 0 : options.transform) != null ? _a21 : defaultTransform;
  const hasCustomTransform = (options == null ? void 0 : options.transform) !== void 0;
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();
      const transformedContent = [];
      for (const part of content) {
        if (part.type !== "text") {
          transformedContent.push(part);
          continue;
        }
        transformedContent.push({
          ...part,
          text: transform(part.text)
        });
      }
      return { content: transformedContent, ...rest };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      const textBlocks = {};
      const SUFFIX_BUFFER_SIZE = 12;
      return {
        stream: stream.pipeThrough(
          new TransformStream({
            transform: (chunk, controller) => {
              if (chunk.type === "text-start") {
                textBlocks[chunk.id] = {
                  startEvent: chunk,
                  // Custom transforms need to buffer all content
                  phase: hasCustomTransform ? "buffering" : "prefix",
                  buffer: "",
                  prefixStripped: false
                };
                return;
              }
              if (chunk.type === "text-delta") {
                const block = textBlocks[chunk.id];
                if (!block) {
                  controller.enqueue(chunk);
                  return;
                }
                block.buffer += chunk.delta;
                if (block.phase === "buffering") {
                  return;
                }
                if (block.phase === "prefix") {
                  if (block.buffer.length > 0 && !block.buffer.startsWith("`")) {
                    block.phase = "streaming";
                    controller.enqueue(block.startEvent);
                  } else if (block.buffer.startsWith("```")) {
                    if (block.buffer.includes("\n")) {
                      const prefixMatch = block.buffer.match(/^```(?:json)?\s*\n/);
                      if (prefixMatch) {
                        block.buffer = block.buffer.slice(
                          prefixMatch[0].length
                        );
                        block.prefixStripped = true;
                        block.phase = "streaming";
                        controller.enqueue(block.startEvent);
                      } else {
                        block.phase = "streaming";
                        controller.enqueue(block.startEvent);
                      }
                    }
                  } else if (block.buffer.length >= 3 && !block.buffer.startsWith("```")) {
                    block.phase = "streaming";
                    controller.enqueue(block.startEvent);
                  }
                }
                if (block.phase === "streaming" && block.buffer.length > SUFFIX_BUFFER_SIZE) {
                  const toStream = block.buffer.slice(0, -SUFFIX_BUFFER_SIZE);
                  block.buffer = block.buffer.slice(-SUFFIX_BUFFER_SIZE);
                  controller.enqueue({
                    type: "text-delta",
                    id: chunk.id,
                    delta: toStream
                  });
                }
                return;
              }
              if (chunk.type === "text-end") {
                const block = textBlocks[chunk.id];
                if (block) {
                  if (block.phase === "prefix" || block.phase === "buffering") {
                    controller.enqueue(block.startEvent);
                  }
                  let remaining = block.buffer;
                  if (block.phase === "buffering") {
                    remaining = transform(remaining);
                  } else if (block.prefixStripped) {
                    remaining = remaining.replace(/\n?```\s*$/, "").trimEnd();
                  } else {
                    remaining = transform(remaining);
                  }
                  if (remaining.length > 0) {
                    controller.enqueue({
                      type: "text-delta",
                      id: chunk.id,
                      delta: remaining
                    });
                  }
                  controller.enqueue(chunk);
                  delete textBlocks[chunk.id];
                  return;
                }
              }
              controller.enqueue(chunk);
            }
          })
        ),
        ...rest
      };
    }
  };
}
function getPotentialStartIndex(text2, searchedText) {
  if (searchedText.length === 0) {
    return null;
  }
  const directIndex = text2.indexOf(searchedText);
  if (directIndex !== -1) {
    return directIndex;
  }
  for (let i = text2.length - 1; i >= 0; i--) {
    const suffix = text2.substring(i);
    if (searchedText.startsWith(suffix)) {
      return i;
    }
  }
  return null;
}
function extractReasoningMiddleware({
  tagName,
  separator = "\n",
  startWithReasoning = false
}) {
  const openingTag = `<${tagName}>`;
  const closingTag = `</${tagName}>`;
  return {
    specificationVersion: "v3",
    wrapGenerate: async ({ doGenerate }) => {
      const { content, ...rest } = await doGenerate();
      const transformedContent = [];
      for (const part of content) {
        if (part.type !== "text") {
          transformedContent.push(part);
          continue;
        }
        const text2 = startWithReasoning ? openingTag + part.text : part.text;
        const regexp = new RegExp(`${openingTag}(.*?)${closingTag}`, "gs");
        const matches = Array.from(text2.matchAll(regexp));
        if (!matches.length) {
          transformedContent.push(part);
          continue;
        }
        const reasoningText = matches.map((match) => match[1]).join(separator);
        let textWithoutReasoning = text2;
        for (let i = matches.length - 1; i >= 0; i--) {
          const match = matches[i];
          const beforeMatch = textWithoutReasoning.slice(0, match.index);
          const afterMatch = textWithoutReasoning.slice(
            match.index + match[0].length
          );
          textWithoutReasoning = beforeMatch + (beforeMatch.length > 0 && afterMatch.length > 0 ? separator : "") + afterMatch;
        }
        transformedContent.push({
          type: "reasoning",
          text: reasoningText
        });
        transformedContent.push({
          type: "text",
          text: textWithoutReasoning
        });
      }
      return { content: transformedContent, ...rest };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();
      const reasoningExtractions = {};
      let delayedTextStart;
      return {
        stream: stream.pipeThrough(
          new TransformStream({
            transform: (chunk, controller) => {
              if (chunk.type === "text-start") {
                delayedTextStart = chunk;
                return;
              }
              if (chunk.type === "text-end" && delayedTextStart) {
                controller.enqueue(delayedTextStart);
                delayedTextStart = void 0;
              }
              if (chunk.type !== "text-delta") {
                controller.enqueue(chunk);
                return;
              }
              if (reasoningExtractions[chunk.id] == null) {
                reasoningExtractions[chunk.id] = {
                  isFirstReasoning: true,
                  isFirstText: true,
                  afterSwitch: false,
                  isReasoning: startWithReasoning,
                  buffer: "",
                  idCounter: 0,
                  textId: chunk.id
                };
              }
              const activeExtraction = reasoningExtractions[chunk.id];
              activeExtraction.buffer += chunk.delta;
              function publish(text2) {
                if (text2.length > 0) {
                  const prefix = activeExtraction.afterSwitch && (activeExtraction.isReasoning ? !activeExtraction.isFirstReasoning : !activeExtraction.isFirstText) ? separator : "";
                  if (activeExtraction.isReasoning && (activeExtraction.afterSwitch || activeExtraction.isFirstReasoning)) {
                    controller.enqueue({
                      type: "reasoning-start",
                      id: `reasoning-${activeExtraction.idCounter}`
                    });
                  }
                  if (activeExtraction.isReasoning) {
                    controller.enqueue({
                      type: "reasoning-delta",
                      delta: prefix + text2,
                      id: `reasoning-${activeExtraction.idCounter}`
                    });
                  } else {
                    if (delayedTextStart) {
                      controller.enqueue(delayedTextStart);
                      delayedTextStart = void 0;
                    }
                    controller.enqueue({
                      type: "text-delta",
                      delta: prefix + text2,
                      id: activeExtraction.textId
                    });
                  }
                  activeExtraction.afterSwitch = false;
                  if (activeExtraction.isReasoning) {
                    activeExtraction.isFirstReasoning = false;
                  } else {
                    activeExtraction.isFirstText = false;
                  }
                }
              }
              do {
                const nextTag = activeExtraction.isReasoning ? closingTag : openingTag;
                const startIndex = getPotentialStartIndex(
                  activeExtraction.buffer,
                  nextTag
                );
                if (startIndex == null) {
                  publish(activeExtraction.buffer);
                  activeExtraction.buffer = "";
                  break;
                }
                publish(activeExtraction.buffer.slice(0, startIndex));
                const foundFullMatch = startIndex + nextTag.length <= activeExtraction.buffer.length;
                if (foundFullMatch) {
                  activeExtraction.buffer = activeExtraction.buffer.slice(
                    startIndex + nextTag.length
                  );
                  if (activeExtraction.isReasoning) {
                    if (activeExtraction.isFirstReasoning) {
                      controller.enqueue({
                        type: "reasoning-start",
                        id: `reasoning-${activeExtraction.idCounter}`
                      });
                    }
                    controller.enqueue({
                      type: "reasoning-end",
                      id: `reasoning-${activeExtraction.idCounter++}`
                    });
                  }
                  activeExtraction.isReasoning = !activeExtraction.isReasoning;
                  activeExtraction.afterSwitch = true;
                } else {
                  activeExtraction.buffer = activeExtraction.buffer.slice(startIndex);
                  break;
                }
              } while (true);
            }
          })
        ),
        ...rest
      };
    }
  };
}
function simulateStreamingMiddleware() {
  return {
    specificationVersion: "v3",
    wrapStream: async ({ doGenerate }) => {
      const result = await doGenerate();
      let id = 0;
      const simulatedStream = new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: "stream-start",
            warnings: result.warnings
          });
          controller.enqueue({ type: "response-metadata", ...result.response });
          for (const part of result.content) {
            switch (part.type) {
              case "text": {
                if (part.text.length > 0) {
                  controller.enqueue({ type: "text-start", id: String(id) });
                  controller.enqueue({
                    type: "text-delta",
                    id: String(id),
                    delta: part.text
                  });
                  controller.enqueue({ type: "text-end", id: String(id) });
                  id++;
                }
                break;
              }
              case "reasoning": {
                controller.enqueue({
                  type: "reasoning-start",
                  id: String(id),
                  providerMetadata: part.providerMetadata
                });
                controller.enqueue({
                  type: "reasoning-delta",
                  id: String(id),
                  delta: part.text
                });
                controller.enqueue({ type: "reasoning-end", id: String(id) });
                id++;
                break;
              }
              default: {
                controller.enqueue(part);
                break;
              }
            }
          }
          controller.enqueue({
            type: "finish",
            finishReason: result.finishReason,
            usage: result.usage,
            providerMetadata: result.providerMetadata
          });
          controller.close();
        }
      });
      return {
        stream: simulatedStream,
        request: result.request,
        response: result.response
      };
    }
  };
}
function defaultFormatExample(example) {
  return JSON.stringify(example.input);
}
function addToolInputExamplesMiddleware({
  prefix = "Input Examples:",
  format = defaultFormatExample,
  remove = true
} = {}) {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => {
      var _a21;
      if (!((_a21 = params.tools) == null ? void 0 : _a21.length)) {
        return params;
      }
      const transformedTools = params.tools.map((tool2) => {
        var _a22;
        if (tool2.type !== "function" || !((_a22 = tool2.inputExamples) == null ? void 0 : _a22.length)) {
          return tool2;
        }
        const formattedExamples = tool2.inputExamples.map((example, index2) => format(example, index2)).join("\n");
        const examplesSection = `${prefix}
${formattedExamples}`;
        const toolDescription = tool2.description ? `${tool2.description}

${examplesSection}` : examplesSection;
        return {
          ...tool2,
          description: toolDescription,
          inputExamples: remove ? void 0 : tool2.inputExamples
        };
      });
      return {
        ...params,
        tools: transformedTools
      };
    }
  };
}
var wrapLanguageModel = ({
  model,
  middleware: middlewareArg,
  modelId,
  providerId
}) => {
  return [...asArray(middlewareArg)].reverse().reduce((wrappedModel, middleware) => {
    return doWrap({ model: wrappedModel, middleware, modelId, providerId });
  }, model);
};
var doWrap = ({
  model,
  middleware: {
    transformParams,
    wrapGenerate,
    wrapStream,
    overrideProvider,
    overrideModelId,
    overrideSupportedUrls
  },
  modelId,
  providerId
}) => {
  var _a21, _b15, _c;
  async function doTransform({
    params,
    type
  }) {
    return transformParams ? await transformParams({ params, type, model }) : params;
  }
  return {
    specificationVersion: "v3",
    provider: (_a21 = providerId != null ? providerId : overrideProvider == null ? void 0 : overrideProvider({ model })) != null ? _a21 : model.provider,
    modelId: (_b15 = modelId != null ? modelId : overrideModelId == null ? void 0 : overrideModelId({ model })) != null ? _b15 : model.modelId,
    supportedUrls: (_c = overrideSupportedUrls == null ? void 0 : overrideSupportedUrls({ model })) != null ? _c : model.supportedUrls,
    async doGenerate(params) {
      const transformedParams = await doTransform({ params, type: "generate" });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapGenerate ? wrapGenerate({
        doGenerate,
        doStream,
        params: transformedParams,
        model
      }) : doGenerate();
    },
    async doStream(params) {
      const transformedParams = await doTransform({ params, type: "stream" });
      const doGenerate = async () => model.doGenerate(transformedParams);
      const doStream = async () => model.doStream(transformedParams);
      return wrapStream ? wrapStream({ doGenerate, doStream, params: transformedParams, model }) : doStream();
    }
  };
};
var wrapEmbeddingModel = ({
  model,
  middleware: middlewareArg,
  modelId,
  providerId
}) => {
  return [...asArray(middlewareArg)].reverse().reduce((wrappedModel, middleware) => {
    return doWrap2({ model: wrappedModel, middleware, modelId, providerId });
  }, model);
};
var doWrap2 = ({
  model,
  middleware: {
    transformParams,
    wrapEmbed,
    overrideProvider,
    overrideModelId,
    overrideMaxEmbeddingsPerCall,
    overrideSupportsParallelCalls
  },
  modelId,
  providerId
}) => {
  var _a21, _b15, _c, _d;
  async function doTransform({
    params
  }) {
    return transformParams ? await transformParams({ params, model }) : params;
  }
  return {
    specificationVersion: "v3",
    provider: (_a21 = providerId != null ? providerId : overrideProvider == null ? void 0 : overrideProvider({ model })) != null ? _a21 : model.provider,
    modelId: (_b15 = modelId != null ? modelId : overrideModelId == null ? void 0 : overrideModelId({ model })) != null ? _b15 : model.modelId,
    maxEmbeddingsPerCall: (_c = overrideMaxEmbeddingsPerCall == null ? void 0 : overrideMaxEmbeddingsPerCall({ model })) != null ? _c : model.maxEmbeddingsPerCall,
    supportsParallelCalls: (_d = overrideSupportsParallelCalls == null ? void 0 : overrideSupportsParallelCalls({ model })) != null ? _d : model.supportsParallelCalls,
    async doEmbed(params) {
      const transformedParams = await doTransform({ params });
      const doEmbed = async () => model.doEmbed(transformedParams);
      return wrapEmbed ? wrapEmbed({
        doEmbed,
        params: transformedParams,
        model
      }) : doEmbed();
    }
  };
};
var wrapImageModel = ({
  model,
  middleware: middlewareArg,
  modelId,
  providerId
}) => {
  return [...asArray(middlewareArg)].reverse().reduce((wrappedModel, middleware) => {
    return doWrap3({ model: wrappedModel, middleware, modelId, providerId });
  }, model);
};
var doWrap3 = ({
  model,
  middleware: {
    transformParams,
    wrapGenerate,
    overrideProvider,
    overrideModelId,
    overrideMaxImagesPerCall
  },
  modelId,
  providerId
}) => {
  var _a21, _b15, _c;
  async function doTransform({ params }) {
    return transformParams ? await transformParams({ params, model }) : params;
  }
  const maxImagesPerCallRaw = (_a21 = overrideMaxImagesPerCall == null ? void 0 : overrideMaxImagesPerCall({ model })) != null ? _a21 : model.maxImagesPerCall;
  const maxImagesPerCall = maxImagesPerCallRaw instanceof Function ? maxImagesPerCallRaw.bind(model) : maxImagesPerCallRaw;
  return {
    specificationVersion: "v3",
    provider: (_b15 = providerId != null ? providerId : overrideProvider == null ? void 0 : overrideProvider({ model })) != null ? _b15 : model.provider,
    modelId: (_c = modelId != null ? modelId : overrideModelId == null ? void 0 : overrideModelId({ model })) != null ? _c : model.modelId,
    maxImagesPerCall,
    async doGenerate(params) {
      const transformedParams = await doTransform({ params });
      const doGenerate = async () => model.doGenerate(transformedParams);
      return wrapGenerate ? wrapGenerate({
        doGenerate,
        params: transformedParams,
        model
      }) : doGenerate();
    }
  };
};
function asProviderV3(provider) {
  if ("specificationVersion" in provider && provider.specificationVersion === "v3") {
    return provider;
  }
  const v2Provider = provider;
  return {
    specificationVersion: "v3",
    languageModel: (modelId) => asLanguageModelV3(v2Provider.languageModel(modelId)),
    embeddingModel: (modelId) => asEmbeddingModelV3(v2Provider.textEmbeddingModel(modelId)),
    imageModel: (modelId) => asImageModelV3(v2Provider.imageModel(modelId)),
    transcriptionModel: v2Provider.transcriptionModel ? (modelId) => asTranscriptionModelV3(v2Provider.transcriptionModel(modelId)) : void 0,
    speechModel: v2Provider.speechModel ? (modelId) => asSpeechModelV3(v2Provider.speechModel(modelId)) : void 0,
    rerankingModel: void 0
    // v2 providers don't have reranking models
  };
}
function wrapProvider({
  provider,
  languageModelMiddleware,
  imageModelMiddleware
}) {
  const providerV3 = asProviderV3(provider);
  return {
    specificationVersion: "v3",
    languageModel: (modelId) => wrapLanguageModel({
      model: providerV3.languageModel(modelId),
      middleware: languageModelMiddleware
    }),
    embeddingModel: providerV3.embeddingModel,
    imageModel: (modelId) => {
      let model = providerV3.imageModel(modelId);
      if (imageModelMiddleware != null) {
        model = wrapImageModel({ model, middleware: imageModelMiddleware });
      }
      return model;
    },
    transcriptionModel: providerV3.transcriptionModel,
    speechModel: providerV3.speechModel,
    rerankingModel: providerV3.rerankingModel
  };
}
function customProvider({
  languageModels,
  embeddingModels,
  imageModels,
  transcriptionModels,
  speechModels,
  rerankingModels,
  videoModels,
  fallbackProvider: fallbackProviderArg
}) {
  const fallbackProvider = fallbackProviderArg ? asProviderV3(fallbackProviderArg) : void 0;
  return {
    specificationVersion: "v3",
    languageModel(modelId) {
      if (languageModels != null && modelId in languageModels) {
        return languageModels[modelId];
      }
      if (fallbackProvider) {
        return fallbackProvider.languageModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "languageModel" });
    },
    embeddingModel(modelId) {
      if (embeddingModels != null && modelId in embeddingModels) {
        return embeddingModels[modelId];
      }
      if (fallbackProvider) {
        return fallbackProvider.embeddingModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "embeddingModel" });
    },
    imageModel(modelId) {
      if (imageModels != null && modelId in imageModels) {
        return imageModels[modelId];
      }
      if (fallbackProvider == null ? void 0 : fallbackProvider.imageModel) {
        return fallbackProvider.imageModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "imageModel" });
    },
    transcriptionModel(modelId) {
      if (transcriptionModels != null && modelId in transcriptionModels) {
        return transcriptionModels[modelId];
      }
      if (fallbackProvider == null ? void 0 : fallbackProvider.transcriptionModel) {
        return fallbackProvider.transcriptionModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "transcriptionModel" });
    },
    speechModel(modelId) {
      if (speechModels != null && modelId in speechModels) {
        return speechModels[modelId];
      }
      if (fallbackProvider == null ? void 0 : fallbackProvider.speechModel) {
        return fallbackProvider.speechModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "speechModel" });
    },
    rerankingModel(modelId) {
      if (rerankingModels != null && modelId in rerankingModels) {
        return rerankingModels[modelId];
      }
      if (fallbackProvider == null ? void 0 : fallbackProvider.rerankingModel) {
        return fallbackProvider.rerankingModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "rerankingModel" });
    },
    videoModel(modelId) {
      if (videoModels != null && modelId in videoModels) {
        return videoModels[modelId];
      }
      const videoModel = fallbackProvider == null ? void 0 : fallbackProvider.videoModel;
      if (videoModel) {
        return videoModel(modelId);
      }
      throw new NoSuchModelError$1({ modelId, modelType: "videoModel" });
    }
  };
}
var experimental_customProvider = customProvider;
var name20 = "AI_NoSuchProviderError";
var marker20 = `vercel.ai.error.${name20}`;
var symbol20 = Symbol.for(marker20);
var _a20;
var NoSuchProviderError = class extends NoSuchModelError$1 {
  constructor({
    modelId,
    modelType,
    providerId,
    availableProviders,
    message = `No such provider: ${providerId} (available providers: ${availableProviders.join()})`
  }) {
    super({ errorName: name20, modelId, modelType, message });
    this[_a20] = true;
    this.providerId = providerId;
    this.availableProviders = availableProviders;
  }
  static isInstance(error) {
    return AISDKError$1.hasMarker(error, marker20);
  }
};
_a20 = symbol20;
function createProviderRegistry(providers, {
  separator = ":",
  languageModelMiddleware,
  imageModelMiddleware
} = {}) {
  const registry = new DefaultProviderRegistry({
    separator,
    languageModelMiddleware,
    imageModelMiddleware
  });
  for (const [id, provider] of Object.entries(providers)) {
    registry.registerProvider({ id, provider });
  }
  return registry;
}
var experimental_createProviderRegistry = createProviderRegistry;
var DefaultProviderRegistry = class {
  constructor({
    separator,
    languageModelMiddleware,
    imageModelMiddleware
  }) {
    this.providers = {};
    this.separator = separator;
    this.languageModelMiddleware = languageModelMiddleware;
    this.imageModelMiddleware = imageModelMiddleware;
  }
  registerProvider({
    id,
    provider
  }) {
    this.providers[id] = provider;
  }
  getProvider(id, modelType) {
    const provider = this.providers[id];
    if (provider == null) {
      throw new NoSuchProviderError({
        modelId: id,
        modelType,
        providerId: id,
        availableProviders: Object.keys(this.providers)
      });
    }
    return provider;
  }
  splitId(id, modelType) {
    const index2 = id.indexOf(this.separator);
    if (index2 === -1) {
      throw new NoSuchModelError$1({
        modelId: id,
        modelType,
        message: `Invalid ${modelType} id for registry: ${id} (must be in the format "providerId${this.separator}modelId")`
      });
    }
    return [id.slice(0, index2), id.slice(index2 + this.separator.length)];
  }
  languageModel(id) {
    var _a21, _b15;
    const [providerId, modelId] = this.splitId(id, "languageModel");
    let model = (_b15 = (_a21 = this.getProvider(providerId, "languageModel")).languageModel) == null ? void 0 : _b15.call(
      _a21,
      modelId
    );
    if (model == null) {
      throw new NoSuchModelError$1({ modelId: id, modelType: "languageModel" });
    }
    if (this.languageModelMiddleware != null) {
      model = wrapLanguageModel({
        model,
        middleware: this.languageModelMiddleware
      });
    }
    return model;
  }
  embeddingModel(id) {
    var _a21;
    const [providerId, modelId] = this.splitId(id, "embeddingModel");
    const provider = this.getProvider(providerId, "embeddingModel");
    const model = (_a21 = provider.embeddingModel) == null ? void 0 : _a21.call(provider, modelId);
    if (model == null) {
      throw new NoSuchModelError$1({
        modelId: id,
        modelType: "embeddingModel"
      });
    }
    return model;
  }
  imageModel(id) {
    var _a21;
    const [providerId, modelId] = this.splitId(id, "imageModel");
    const provider = this.getProvider(providerId, "imageModel");
    let model = (_a21 = provider.imageModel) == null ? void 0 : _a21.call(provider, modelId);
    if (model == null) {
      throw new NoSuchModelError$1({ modelId: id, modelType: "imageModel" });
    }
    if (this.imageModelMiddleware != null) {
      model = wrapImageModel({
        model,
        middleware: this.imageModelMiddleware
      });
    }
    return model;
  }
  transcriptionModel(id) {
    var _a21;
    const [providerId, modelId] = this.splitId(id, "transcriptionModel");
    const provider = this.getProvider(providerId, "transcriptionModel");
    const model = (_a21 = provider.transcriptionModel) == null ? void 0 : _a21.call(provider, modelId);
    if (model == null) {
      throw new NoSuchModelError$1({
        modelId: id,
        modelType: "transcriptionModel"
      });
    }
    return model;
  }
  speechModel(id) {
    var _a21;
    const [providerId, modelId] = this.splitId(id, "speechModel");
    const provider = this.getProvider(providerId, "speechModel");
    const model = (_a21 = provider.speechModel) == null ? void 0 : _a21.call(provider, modelId);
    if (model == null) {
      throw new NoSuchModelError$1({ modelId: id, modelType: "speechModel" });
    }
    return model;
  }
  rerankingModel(id) {
    var _a21;
    const [providerId, modelId] = this.splitId(id, "rerankingModel");
    const provider = this.getProvider(providerId, "rerankingModel");
    const model = (_a21 = provider.rerankingModel) == null ? void 0 : _a21.call(provider, modelId);
    if (model == null) {
      throw new NoSuchModelError$1({ modelId: id, modelType: "rerankingModel" });
    }
    return model;
  }
};
async function rerank({
  model,
  documents,
  query,
  topN,
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  providerOptions,
  experimental_telemetry: telemetry
}) {
  if (documents.length === 0) {
    return new DefaultRerankResult({
      originalDocuments: [],
      ranking: [],
      providerMetadata: void 0,
      response: {
        timestamp: /* @__PURE__ */ new Date(),
        modelId: model.modelId
      }
    });
  }
  const { maxRetries, retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const documentsToSend = typeof documents[0] === "string" ? { type: "text", values: documents } : { type: "object", values: documents };
  const baseTelemetryAttributes = getBaseTelemetryAttributes({
    model,
    telemetry,
    headers,
    settings: { maxRetries }
  });
  const tracer = getTracer(telemetry);
  return recordSpan({
    name: "ai.rerank",
    attributes: selectTelemetryAttributes({
      telemetry,
      attributes: {
        ...assembleOperationName({ operationId: "ai.rerank", telemetry }),
        ...baseTelemetryAttributes,
        "ai.documents": {
          input: () => documents.map((document) => JSON.stringify(document))
        }
      }
    }),
    tracer,
    fn: async () => {
      var _a21, _b15;
      const { ranking, response, providerMetadata, warnings } = await retry(
        () => recordSpan({
          name: "ai.rerank.doRerank",
          attributes: selectTelemetryAttributes({
            telemetry,
            attributes: {
              ...assembleOperationName({
                operationId: "ai.rerank.doRerank",
                telemetry
              }),
              ...baseTelemetryAttributes,
              // specific settings that only make sense on the outer level:
              "ai.documents": {
                input: () => documents.map((document) => JSON.stringify(document))
              }
            }
          }),
          tracer,
          fn: async (doRerankSpan) => {
            const modelResponse = await model.doRerank({
              documents: documentsToSend,
              query,
              topN,
              providerOptions,
              abortSignal,
              headers
            });
            const ranking2 = modelResponse.ranking;
            doRerankSpan.setAttributes(
              await selectTelemetryAttributes({
                telemetry,
                attributes: {
                  "ai.ranking.type": documentsToSend.type,
                  "ai.ranking": {
                    output: () => ranking2.map((ranking3) => JSON.stringify(ranking3))
                  }
                }
              })
            );
            return {
              ranking: ranking2,
              providerMetadata: modelResponse.providerMetadata,
              response: modelResponse.response,
              warnings: modelResponse.warnings
            };
          }
        })
      );
      logWarnings({
        warnings: warnings != null ? warnings : [],
        provider: model.provider,
        model: model.modelId
      });
      return new DefaultRerankResult({
        originalDocuments: documents,
        ranking: ranking.map((ranking2) => ({
          originalIndex: ranking2.index,
          score: ranking2.relevanceScore,
          document: documents[ranking2.index]
        })),
        providerMetadata,
        response: {
          id: response == null ? void 0 : response.id,
          timestamp: (_a21 = response == null ? void 0 : response.timestamp) != null ? _a21 : /* @__PURE__ */ new Date(),
          modelId: (_b15 = response == null ? void 0 : response.modelId) != null ? _b15 : model.modelId,
          headers: response == null ? void 0 : response.headers,
          body: response == null ? void 0 : response.body
        }
      });
    }
  });
}
var DefaultRerankResult = class {
  constructor(options) {
    this.originalDocuments = options.originalDocuments;
    this.ranking = options.ranking;
    this.response = options.response;
    this.providerMetadata = options.providerMetadata;
  }
  get rerankedDocuments() {
    return this.ranking.map((ranking) => ranking.document);
  }
};
var defaultDownload2 = createDownload();
async function transcribe({
  model,
  audio,
  providerOptions = {},
  maxRetries: maxRetriesArg,
  abortSignal,
  headers,
  download: downloadFn = defaultDownload2
}) {
  const resolvedModel = resolveTranscriptionModel(model);
  if (!resolvedModel) {
    throw new Error("Model could not be resolved");
  }
  const { retry } = prepareRetries({
    maxRetries: maxRetriesArg,
    abortSignal
  });
  const headersWithUserAgent = withUserAgentSuffix$1(
    headers != null ? headers : {},
    `ai/${VERSION}`
  );
  const audioData = audio instanceof URL ? (await downloadFn({ url: audio, abortSignal })).data : convertDataContentToUint8Array(audio);
  const result = await retry(
    () => {
      var _a21;
      return resolvedModel.doGenerate({
        audio: audioData,
        abortSignal,
        headers: headersWithUserAgent,
        providerOptions,
        mediaType: (_a21 = detectMediaType({
          data: audioData,
          signatures: audioMediaTypeSignatures
        })) != null ? _a21 : "audio/wav"
      });
    }
  );
  logWarnings({
    warnings: result.warnings,
    provider: resolvedModel.provider,
    model: resolvedModel.modelId
  });
  if (!result.text) {
    throw new NoTranscriptGeneratedError({ responses: [result.response] });
  }
  return new DefaultTranscriptionResult({
    text: result.text,
    segments: result.segments,
    language: result.language,
    durationInSeconds: result.durationInSeconds,
    warnings: result.warnings,
    responses: [result.response],
    providerMetadata: result.providerMetadata
  });
}
var DefaultTranscriptionResult = class {
  constructor(options) {
    var _a21;
    this.text = options.text;
    this.segments = options.segments;
    this.language = options.language;
    this.durationInSeconds = options.durationInSeconds;
    this.warnings = options.warnings;
    this.responses = options.responses;
    this.providerMetadata = (_a21 = options.providerMetadata) != null ? _a21 : {};
  }
};
async function processTextStream({
  stream,
  onTextPart
}) {
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    await onTextPart(value);
  }
}
var getOriginalFetch = () => fetch;
async function callCompletionApi({
  api,
  prompt,
  credentials,
  headers,
  body,
  streamProtocol = "data",
  setCompletion,
  setLoading,
  setError,
  setAbortController,
  onFinish,
  onError,
  fetch: fetch2 = getOriginalFetch()
}) {
  var _a21;
  try {
    setLoading(true);
    setError(void 0);
    const abortController = new AbortController();
    setAbortController(abortController);
    setCompletion("");
    const response = await fetch2(api, {
      method: "POST",
      body: JSON.stringify({
        prompt,
        ...body
      }),
      credentials,
      headers: withUserAgentSuffix$1(
        {
          "Content-Type": "application/json",
          ...headers
        },
        `ai-sdk/${VERSION}`,
        getRuntimeEnvironmentUserAgent$1()
      ),
      signal: abortController.signal
    }).catch((err) => {
      throw err;
    });
    if (!response.ok) {
      throw new Error(
        (_a21 = await response.text()) != null ? _a21 : "Failed to fetch the chat response."
      );
    }
    if (!response.body) {
      throw new Error("The response body is empty.");
    }
    let result = "";
    switch (streamProtocol) {
      case "text": {
        await processTextStream({
          stream: response.body,
          onTextPart: (chunk) => {
            result += chunk;
            setCompletion(result);
          }
        });
        break;
      }
      case "data": {
        await consumeStream({
          stream: parseJsonEventStream$1({
            stream: response.body,
            schema: uiMessageChunkSchema
          }).pipeThrough(
            new TransformStream({
              async transform(part) {
                if (!part.success) {
                  throw part.error;
                }
                const streamPart = part.value;
                if (streamPart.type === "text-delta") {
                  result += streamPart.delta;
                  setCompletion(result);
                } else if (streamPart.type === "error") {
                  throw new Error(streamPart.errorText);
                }
              }
            })
          ),
          onError: (error) => {
            throw error;
          }
        });
        break;
      }
      default: {
        const exhaustiveCheck = streamProtocol;
        throw new Error(`Unknown stream protocol: ${exhaustiveCheck}`);
      }
    }
    if (onFinish) {
      onFinish(prompt, result);
    }
    setAbortController(null);
    return result;
  } catch (err) {
    if (err.name === "AbortError") {
      setAbortController(null);
      return null;
    }
    if (err instanceof Error) {
      if (onError) {
        onError(err);
      }
    }
    setError(err);
  } finally {
    setLoading(false);
  }
}
async function convertFileListToFileUIParts(files) {
  if (files == null) {
    return [];
  }
  if (!globalThis.FileList || !(files instanceof globalThis.FileList)) {
    throw new Error("FileList is not supported in the current environment");
  }
  return Promise.all(
    Array.from(files).map(async (file) => {
      const { name: name21, type } = file;
      const dataUrl = await new Promise((resolve3, reject) => {
        const reader = new FileReader();
        reader.onload = (readerEvent) => {
          var _a21;
          resolve3((_a21 = readerEvent.target) == null ? void 0 : _a21.result);
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
      });
      return {
        type: "file",
        mediaType: type,
        filename: name21,
        url: dataUrl
      };
    })
  );
}
var HttpChatTransport = class {
  constructor({
    api = "/api/chat",
    credentials,
    headers,
    body,
    fetch: fetch2,
    prepareSendMessagesRequest,
    prepareReconnectToStreamRequest
  }) {
    this.api = api;
    this.credentials = credentials;
    this.headers = headers;
    this.body = body;
    this.fetch = fetch2;
    this.prepareSendMessagesRequest = prepareSendMessagesRequest;
    this.prepareReconnectToStreamRequest = prepareReconnectToStreamRequest;
  }
  async sendMessages({
    abortSignal,
    ...options
  }) {
    var _a21, _b15, _c, _d, _e;
    const resolvedBody = await resolve$1(this.body);
    const resolvedHeaders = await resolve$1(this.headers);
    const resolvedCredentials = await resolve$1(this.credentials);
    const baseHeaders = {
      ...normalizeHeaders$1(resolvedHeaders),
      ...normalizeHeaders$1(options.headers)
    };
    const preparedRequest = await ((_a21 = this.prepareSendMessagesRequest) == null ? void 0 : _a21.call(this, {
      api: this.api,
      id: options.chatId,
      messages: options.messages,
      body: { ...resolvedBody, ...options.body },
      headers: baseHeaders,
      credentials: resolvedCredentials,
      requestMetadata: options.metadata,
      trigger: options.trigger,
      messageId: options.messageId
    }));
    const api = (_b15 = preparedRequest == null ? void 0 : preparedRequest.api) != null ? _b15 : this.api;
    const headers = (preparedRequest == null ? void 0 : preparedRequest.headers) !== void 0 ? normalizeHeaders$1(preparedRequest.headers) : baseHeaders;
    const body = (preparedRequest == null ? void 0 : preparedRequest.body) !== void 0 ? preparedRequest.body : {
      ...resolvedBody,
      ...options.body,
      id: options.chatId,
      messages: options.messages,
      trigger: options.trigger,
      messageId: options.messageId
    };
    const credentials = (_c = preparedRequest == null ? void 0 : preparedRequest.credentials) != null ? _c : resolvedCredentials;
    const fetch2 = (_d = this.fetch) != null ? _d : globalThis.fetch;
    const response = await fetch2(api, {
      method: "POST",
      headers: withUserAgentSuffix$1(
        {
          "Content-Type": "application/json",
          ...headers
        },
        `ai-sdk/${VERSION}`,
        getRuntimeEnvironmentUserAgent$1()
      ),
      body: JSON.stringify(body),
      credentials,
      signal: abortSignal
    });
    if (!response.ok) {
      throw new Error(
        (_e = await response.text()) != null ? _e : "Failed to fetch the chat response."
      );
    }
    if (!response.body) {
      throw new Error("The response body is empty.");
    }
    return this.processResponseStream(response.body);
  }
  async reconnectToStream(options) {
    var _a21, _b15, _c, _d, _e;
    const resolvedBody = await resolve$1(this.body);
    const resolvedHeaders = await resolve$1(this.headers);
    const resolvedCredentials = await resolve$1(this.credentials);
    const baseHeaders = {
      ...normalizeHeaders$1(resolvedHeaders),
      ...normalizeHeaders$1(options.headers)
    };
    const preparedRequest = await ((_a21 = this.prepareReconnectToStreamRequest) == null ? void 0 : _a21.call(this, {
      api: this.api,
      id: options.chatId,
      body: { ...resolvedBody, ...options.body },
      headers: baseHeaders,
      credentials: resolvedCredentials,
      requestMetadata: options.metadata
    }));
    const api = (_b15 = preparedRequest == null ? void 0 : preparedRequest.api) != null ? _b15 : `${this.api}/${options.chatId}/stream`;
    const headers = (preparedRequest == null ? void 0 : preparedRequest.headers) !== void 0 ? normalizeHeaders$1(preparedRequest.headers) : baseHeaders;
    const credentials = (_c = preparedRequest == null ? void 0 : preparedRequest.credentials) != null ? _c : resolvedCredentials;
    const fetch2 = (_d = this.fetch) != null ? _d : globalThis.fetch;
    const response = await fetch2(api, {
      method: "GET",
      headers: withUserAgentSuffix$1(
        headers,
        `ai-sdk/${VERSION}`,
        getRuntimeEnvironmentUserAgent$1()
      ),
      credentials
    });
    if (response.status === 204) {
      return null;
    }
    if (!response.ok) {
      throw new Error(
        (_e = await response.text()) != null ? _e : "Failed to fetch the chat response."
      );
    }
    if (!response.body) {
      throw new Error("The response body is empty.");
    }
    return this.processResponseStream(response.body);
  }
};
var DefaultChatTransport = class extends HttpChatTransport {
  constructor(options = {}) {
    super(options);
  }
  processResponseStream(stream) {
    return parseJsonEventStream$1({
      stream,
      schema: uiMessageChunkSchema
    }).pipeThrough(
      new TransformStream({
        async transform(chunk, controller) {
          if (!chunk.success) {
            throw chunk.error;
          }
          controller.enqueue(chunk.value);
        }
      })
    );
  }
};
var AbstractChat = class {
  constructor({
    generateId: generateId2 = generateId$1,
    id = generateId2(),
    transport = new DefaultChatTransport(),
    messageMetadataSchema,
    dataPartSchemas,
    state,
    onError,
    onToolCall,
    onFinish,
    onData,
    sendAutomaticallyWhen
  }) {
    this.activeResponse = void 0;
    this.jobExecutor = new SerialJobExecutor();
    this.sendMessage = async (message, options) => {
      var _a21, _b15, _c, _d;
      if (message == null) {
        await this.makeRequest({
          trigger: "submit-message",
          messageId: (_a21 = this.lastMessage) == null ? void 0 : _a21.id,
          ...options
        });
        return;
      }
      let uiMessage;
      if ("text" in message || "files" in message) {
        const fileParts = Array.isArray(message.files) ? message.files : await convertFileListToFileUIParts(message.files);
        uiMessage = {
          parts: [
            ...fileParts,
            ..."text" in message && message.text != null ? [{ type: "text", text: message.text }] : []
          ]
        };
      } else {
        uiMessage = message;
      }
      if (message.messageId != null) {
        const messageIndex = this.state.messages.findIndex(
          (m) => m.id === message.messageId
        );
        if (messageIndex === -1) {
          throw new Error(`message with id ${message.messageId} not found`);
        }
        if (this.state.messages[messageIndex].role !== "user") {
          throw new Error(
            `message with id ${message.messageId} is not a user message`
          );
        }
        this.state.messages = this.state.messages.slice(0, messageIndex + 1);
        this.state.replaceMessage(messageIndex, {
          ...uiMessage,
          id: message.messageId,
          role: (_b15 = uiMessage.role) != null ? _b15 : "user",
          metadata: message.metadata
        });
      } else {
        this.state.pushMessage({
          ...uiMessage,
          id: (_c = uiMessage.id) != null ? _c : this.generateId(),
          role: (_d = uiMessage.role) != null ? _d : "user",
          metadata: message.metadata
        });
      }
      await this.makeRequest({
        trigger: "submit-message",
        messageId: message.messageId,
        ...options
      });
    };
    this.regenerate = async ({
      messageId,
      ...options
    } = {}) => {
      const messageIndex = messageId == null ? this.state.messages.length - 1 : this.state.messages.findIndex((message) => message.id === messageId);
      if (messageIndex === -1) {
        throw new Error(`message ${messageId} not found`);
      }
      this.state.messages = this.state.messages.slice(
        0,
        // if the message is a user message, we need to include it in the request:
        this.messages[messageIndex].role === "assistant" ? messageIndex : messageIndex + 1
      );
      await this.makeRequest({
        trigger: "regenerate-message",
        messageId,
        ...options
      });
    };
    this.resumeStream = async (options = {}) => {
      await this.makeRequest({ trigger: "resume-stream", ...options });
    };
    this.clearError = () => {
      if (this.status === "error") {
        this.state.error = void 0;
        this.setStatus({ status: "ready" });
      }
    };
    this.addToolApprovalResponse = async ({
      id: id2,
      approved,
      reason
    }) => this.jobExecutor.run(async () => {
      const messages = this.state.messages;
      const lastMessage = messages[messages.length - 1];
      const updatePart = (part) => isToolUIPart(part) && part.state === "approval-requested" && part.approval.id === id2 ? {
        ...part,
        state: "approval-responded",
        approval: { id: id2, approved, reason }
      } : part;
      this.state.replaceMessage(messages.length - 1, {
        ...lastMessage,
        parts: lastMessage.parts.map(updatePart)
      });
      if (this.activeResponse) {
        this.activeResponse.state.message.parts = this.activeResponse.state.message.parts.map(updatePart);
      }
      if (this.status !== "streaming" && this.status !== "submitted" && this.sendAutomaticallyWhen) {
        this.shouldSendAutomatically().then((shouldSend) => {
          var _a21;
          if (shouldSend) {
            this.makeRequest({
              trigger: "submit-message",
              messageId: (_a21 = this.lastMessage) == null ? void 0 : _a21.id
            });
          }
        });
      }
    });
    this.addToolOutput = async ({
      state: state2 = "output-available",
      tool: tool2,
      toolCallId,
      output,
      errorText
    }) => this.jobExecutor.run(async () => {
      const messages = this.state.messages;
      const lastMessage = messages[messages.length - 1];
      const updatePart = (part) => isToolUIPart(part) && part.toolCallId === toolCallId ? { ...part, state: state2, output, errorText } : part;
      this.state.replaceMessage(messages.length - 1, {
        ...lastMessage,
        parts: lastMessage.parts.map(updatePart)
      });
      if (this.activeResponse) {
        this.activeResponse.state.message.parts = this.activeResponse.state.message.parts.map(updatePart);
      }
      if (this.status !== "streaming" && this.status !== "submitted" && this.sendAutomaticallyWhen) {
        this.shouldSendAutomatically().then((shouldSend) => {
          var _a21;
          if (shouldSend) {
            this.makeRequest({
              trigger: "submit-message",
              messageId: (_a21 = this.lastMessage) == null ? void 0 : _a21.id
            });
          }
        });
      }
    });
    this.addToolResult = this.addToolOutput;
    this.stop = async () => {
      var _a21;
      if (this.status !== "streaming" && this.status !== "submitted")
        return;
      if ((_a21 = this.activeResponse) == null ? void 0 : _a21.abortController) {
        this.activeResponse.abortController.abort();
      }
    };
    this.id = id;
    this.transport = transport;
    this.generateId = generateId2;
    this.messageMetadataSchema = messageMetadataSchema;
    this.dataPartSchemas = dataPartSchemas;
    this.state = state;
    this.onError = onError;
    this.onToolCall = onToolCall;
    this.onFinish = onFinish;
    this.onData = onData;
    this.sendAutomaticallyWhen = sendAutomaticallyWhen;
  }
  /**
   * Hook status:
   *
   * - `submitted`: The message has been sent to the API and we're awaiting the start of the response stream.
   * - `streaming`: The response is actively streaming in from the API, receiving chunks of data.
   * - `ready`: The full response has been received and processed; a new user message can be submitted.
   * - `error`: An error occurred during the API request, preventing successful completion.
   */
  get status() {
    return this.state.status;
  }
  setStatus({
    status,
    error
  }) {
    if (this.status === status)
      return;
    this.state.status = status;
    this.state.error = error;
  }
  get error() {
    return this.state.error;
  }
  get messages() {
    return this.state.messages;
  }
  get lastMessage() {
    return this.state.messages[this.state.messages.length - 1];
  }
  set messages(messages) {
    this.state.messages = messages;
  }
  async shouldSendAutomatically() {
    if (!this.sendAutomaticallyWhen)
      return false;
    const result = this.sendAutomaticallyWhen({
      messages: this.state.messages
    });
    if (result && typeof result === "object" && "then" in result) {
      return await result;
    }
    return result;
  }
  async makeRequest({
    trigger,
    metadata,
    headers,
    body,
    messageId
  }) {
    var _a21, _b15, _c;
    let resumeStream;
    if (trigger === "resume-stream") {
      try {
        const reconnect = await this.transport.reconnectToStream({
          chatId: this.id,
          metadata,
          headers,
          body
        });
        if (reconnect == null) {
          return;
        }
        resumeStream = reconnect;
      } catch (err) {
        if (this.onError && err instanceof Error) {
          this.onError(err);
        }
        this.setStatus({ status: "error", error: err });
        return;
      }
    }
    this.setStatus({ status: "submitted", error: void 0 });
    const lastMessage = this.lastMessage;
    let isAbort = false;
    let isDisconnect = false;
    let isError = false;
    try {
      const activeResponse = {
        state: createStreamingUIMessageState({
          lastMessage: this.state.snapshot(lastMessage),
          messageId: this.generateId()
        }),
        abortController: new AbortController()
      };
      activeResponse.abortController.signal.addEventListener("abort", () => {
        isAbort = true;
      });
      this.activeResponse = activeResponse;
      let stream;
      if (trigger === "resume-stream") {
        stream = resumeStream;
      } else {
        stream = await this.transport.sendMessages({
          chatId: this.id,
          messages: this.state.messages,
          abortSignal: activeResponse.abortController.signal,
          metadata,
          headers,
          body,
          trigger,
          messageId
        });
      }
      const runUpdateMessageJob = (job) => (
        // serialize the job execution to avoid race conditions:
        this.jobExecutor.run(
          () => job({
            state: activeResponse.state,
            write: () => {
              var _a22;
              this.setStatus({ status: "streaming" });
              const replaceLastMessage = activeResponse.state.message.id === ((_a22 = this.lastMessage) == null ? void 0 : _a22.id);
              if (replaceLastMessage) {
                this.state.replaceMessage(
                  this.state.messages.length - 1,
                  activeResponse.state.message
                );
              } else {
                this.state.pushMessage(activeResponse.state.message);
              }
            }
          })
        )
      );
      await consumeStream({
        stream: processUIMessageStream({
          stream,
          onToolCall: this.onToolCall,
          onData: this.onData,
          messageMetadataSchema: this.messageMetadataSchema,
          dataPartSchemas: this.dataPartSchemas,
          runUpdateMessageJob,
          onError: (error) => {
            throw error;
          }
        }),
        onError: (error) => {
          throw error;
        }
      });
      this.setStatus({ status: "ready" });
    } catch (err) {
      if (isAbort || err.name === "AbortError") {
        isAbort = true;
        this.setStatus({ status: "ready" });
        return null;
      }
      isError = true;
      if (err instanceof TypeError && (err.message.toLowerCase().includes("fetch") || err.message.toLowerCase().includes("network"))) {
        isDisconnect = true;
      }
      if (this.onError && err instanceof Error) {
        this.onError(err);
      }
      this.setStatus({ status: "error", error: err });
    } finally {
      try {
        (_b15 = this.onFinish) == null ? void 0 : _b15.call(this, {
          message: this.activeResponse.state.message,
          messages: this.state.messages,
          isAbort,
          isDisconnect,
          isError,
          finishReason: (_a21 = this.activeResponse) == null ? void 0 : _a21.state.finishReason
        });
      } catch (err) {
        console.error(err);
      }
      this.activeResponse = void 0;
    }
    if (!isError && await this.shouldSendAutomatically()) {
      await this.makeRequest({
        trigger: "submit-message",
        messageId: (_c = this.lastMessage) == null ? void 0 : _c.id,
        metadata,
        headers,
        body
      });
    }
  }
};
var DirectChatTransport = class {
  constructor({
    agent,
    options,
    ...uiMessageStreamOptions
  }) {
    this.agent = agent;
    this.agentOptions = options;
    this.uiMessageStreamOptions = uiMessageStreamOptions;
  }
  async sendMessages({
    messages,
    abortSignal
  }) {
    const validatedMessages = await validateUIMessages({
      messages,
      tools: this.agent.tools
    });
    const modelMessages = await convertToModelMessages(validatedMessages, {
      tools: this.agent.tools
    });
    const result = await this.agent.stream({
      prompt: modelMessages,
      abortSignal,
      ...this.agentOptions !== void 0 ? { options: this.agentOptions } : {}
    });
    return result.toUIMessageStream(this.uiMessageStreamOptions);
  }
  /**
   * Direct transport does not support reconnection since there is no
   * persistent server-side stream to reconnect to.
   *
   * @returns Always returns `null`
   */
  async reconnectToStream(_options) {
    return null;
  }
};
function lastAssistantMessageIsCompleteWithApprovalResponses({
  messages
}) {
  const message = messages[messages.length - 1];
  if (!message) {
    return false;
  }
  if (message.role !== "assistant") {
    return false;
  }
  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index2) => {
    return part.type === "step-start" ? index2 : lastIndex;
  }, -1);
  const lastStepToolInvocations = message.parts.slice(lastStepStartIndex + 1).filter(isToolUIPart).filter((part) => !part.providerExecuted);
  return (
    // has at least one tool approval response
    lastStepToolInvocations.filter((part) => part.state === "approval-responded").length > 0 && // all tool approvals must have a response
    lastStepToolInvocations.every(
      (part) => part.state === "output-available" || part.state === "output-error" || part.state === "approval-responded"
    )
  );
}
function lastAssistantMessageIsCompleteWithToolCalls({
  messages
}) {
  const message = messages[messages.length - 1];
  if (!message) {
    return false;
  }
  if (message.role !== "assistant") {
    return false;
  }
  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index2) => {
    return part.type === "step-start" ? index2 : lastIndex;
  }, -1);
  const lastStepToolInvocations = message.parts.slice(lastStepStartIndex + 1).filter(isToolUIPart).filter((part) => !part.providerExecuted);
  return lastStepToolInvocations.length > 0 && lastStepToolInvocations.every(
    (part) => part.state === "output-available" || part.state === "output-error"
  );
}
function transformTextToUiMessageStream({
  stream
}) {
  return stream.pipeThrough(
    new TransformStream({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "start-step" });
        controller.enqueue({ type: "text-start", id: "text-1" });
      },
      async transform(part, controller) {
        controller.enqueue({ type: "text-delta", id: "text-1", delta: part });
      },
      async flush(controller) {
        controller.enqueue({ type: "text-end", id: "text-1" });
        controller.enqueue({ type: "finish-step" });
        controller.enqueue({ type: "finish" });
      }
    })
  );
}
var TextStreamChatTransport = class extends HttpChatTransport {
  constructor(options = {}) {
    super(options);
  }
  processResponseStream(stream) {
    return transformTextToUiMessageStream({
      stream: stream.pipeThrough(new TextDecoderStream())
    });
  }
};
const index = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  AISDKError: AISDKError$1,
  APICallError: APICallError$1,
  AbstractChat,
  DefaultChatTransport,
  DefaultGeneratedFile,
  DirectChatTransport,
  DownloadError: DownloadError$1,
  EmptyResponseBodyError: EmptyResponseBodyError$1,
  Experimental_Agent: ToolLoopAgent,
  HttpChatTransport,
  InvalidArgumentError: InvalidArgumentError3,
  InvalidDataContentError,
  InvalidMessageRoleError,
  InvalidPromptError,
  InvalidResponseDataError: InvalidResponseDataError$1,
  InvalidStreamPartError,
  InvalidToolApprovalError,
  InvalidToolInputError,
  JSONParseError: JSONParseError$1,
  JsonToSseTransformStream,
  LoadAPIKeyError: LoadAPIKeyError$1,
  LoadSettingError,
  MessageConversionError,
  MissingToolResultsError,
  NoContentGeneratedError,
  NoImageGeneratedError,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  NoSpeechGeneratedError,
  NoSuchModelError: NoSuchModelError$1,
  NoSuchProviderError,
  NoSuchToolError,
  NoTranscriptGeneratedError,
  NoVideoGeneratedError,
  Output: output_exports,
  RetryError,
  SerialJobExecutor,
  TextStreamChatTransport,
  TooManyEmbeddingValuesForCallError,
  ToolCallNotFoundForApprovalError,
  ToolCallRepairError,
  ToolLoopAgent,
  TypeValidationError: TypeValidationError$1,
  UIMessageStreamError,
  UI_MESSAGE_STREAM_HEADERS,
  UnsupportedFunctionalityError: UnsupportedFunctionalityError$1,
  UnsupportedModelVersionError,
  addToolInputExamplesMiddleware,
  asSchema: asSchema$1,
  assistantModelMessageSchema,
  bindTelemetryIntegration,
  callCompletionApi,
  consumeStream,
  convertFileListToFileUIParts,
  convertToModelMessages,
  cosineSimilarity,
  createAgentUIStream,
  createAgentUIStreamResponse,
  createDownload,
  createGateway: createGatewayProvider,
  createIdGenerator: createIdGenerator$1,
  createProviderRegistry,
  createTextStreamResponse,
  createUIMessageStream,
  createUIMessageStreamResponse,
  customProvider,
  defaultEmbeddingSettingsMiddleware,
  defaultSettingsMiddleware,
  dynamicTool,
  embed,
  embedMany,
  experimental_createProviderRegistry,
  experimental_customProvider,
  experimental_generateImage,
  experimental_generateSpeech: generateSpeech,
  experimental_generateVideo,
  experimental_transcribe: transcribe,
  extractJsonMiddleware,
  extractReasoningMiddleware,
  gateway,
  generateId: generateId$1,
  generateImage,
  generateObject,
  generateText,
  getStaticToolName,
  getTextFromDataUrl,
  getToolName,
  getToolOrDynamicToolName,
  hasToolCall,
  isDataUIPart,
  isDeepEqualData,
  isFileUIPart,
  isReasoningUIPart,
  isStaticToolUIPart,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  isToolUIPart,
  jsonSchema: jsonSchema$1,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
  modelMessageSchema,
  parseJsonEventStream: parseJsonEventStream$1,
  parsePartialJson,
  pipeAgentUIStreamToResponse,
  pipeTextStreamToResponse,
  pipeUIMessageStreamToResponse,
  pruneMessages,
  readUIMessageStream,
  registerTelemetryIntegration,
  rerank,
  safeValidateUIMessages,
  simulateReadableStream,
  simulateStreamingMiddleware,
  smoothStream,
  stepCountIs,
  streamObject,
  streamText,
  systemModelMessageSchema,
  tool: tool$1,
  toolModelMessageSchema,
  uiMessageChunkSchema,
  userModelMessageSchema,
  validateUIMessages,
  wrapEmbeddingModel,
  wrapImageModel,
  wrapLanguageModel,
  wrapProvider,
  zodSchema: zodSchema$1
}, Symbol.toStringTag, { value: "Module" }));
export {
  AISDKError$1 as A,
  loadOptionalSetting$1 as B,
  isParsableJson as C,
  postFormDataToApi as D,
  convertToFormData as E,
  convertBase64ToUint8Array$1 as F,
  downloadBlob as G,
  mediaTypeToExtension as H,
  InvalidResponseDataError$1 as I,
  InvalidPromptError as J,
  createToolNameMapping$1 as K,
  APICallError$1 as L,
  createBinaryResponseHandler as M,
  validateTypes$1 as N,
  isNonNullable$1 as O,
  index as P,
  TooManyEmbeddingValuesForCallError as T,
  UnsupportedFunctionalityError$1 as U,
  withoutTrailingSlash$1 as a,
  generateId$1 as b,
  createAnthropic as c,
  combineHeaders$1 as d,
  extractJsonMiddleware as e,
  postJsonToApi$1 as f,
  generateText as g,
  createJsonResponseHandler$1 as h,
  createEventSourceResponseHandler$1 as i,
  jsonSchema$1 as j,
  withUserAgentSuffix$1 as k,
  loadApiKey$1 as l,
  lazySchema$1 as m,
  convertToBase64$1 as n,
  output_exports as o,
  parseProviderOptions$1 as p,
  createJsonErrorResponseHandler$1 as q,
  resolve$1 as r,
  streamText as s,
  createProviderToolFactoryWithOutputSchema$1 as t,
  createProviderToolFactory$1 as u,
  convertUint8ArrayToBase64$1 as v,
  wrapLanguageModel as w,
  delay as x,
  getFromApi as y,
  zodSchema$1 as z
};

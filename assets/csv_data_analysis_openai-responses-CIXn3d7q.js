import { s as shortHash, O as OpenAI, c as clampOpenAIPromptCacheKey } from "./csv_data_analysis_hash-DDWnRGIJ.js";
import { el as parseStreamingJson, em as resolveTranscript, en as resolveTranscriptTools, ek as getSystemMessageText, eo as renderSystemMessageUpdate, eh as calculateCost, eg as AssistantMessageEventStream, ep as getDeclaredTools, ef as clampThinkingLevel, eq as getProviderEnvValue } from "./csv_data_analysis_app-agent-CnlZuZOy.js";
import { f as formatProviderError, n as normalizeProviderError } from "./csv_data_analysis_error-body-b8mSBG88.js";
import { t as transformMessages, s as sanitizeSurrogates, d as getGrammarToolInput, e as resolveGrammarConstrainedSampling, a as resolveJsonSchemaStrictSampling, g as getJsonSchemaToolParameters, f as appendGrammarToolInputJsonDelta, h as createGrammarToolInputProperties, r as retryProviderRequest, i as headersToRecord, b as buildBaseOptions, c as getPiUserAgent } from "./csv_data_analysis_simple-options-BzKODjrb.js";
import { h as hasCopilotVisionInput, b as buildCopilotDynamicHeaders } from "./csv_data_analysis_github-copilot-headers-eBo5GwLf.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-CWgo4xjO.js";
import "./csv_data_analysis_vendor-ai-shared-L1egyVJx.js";
import "./csv_data_analysis_vendor-ai-google-CzQrQhPa.js";
import "./csv_data_analysis_vendor-ai-openai-XLZ2hpY0.js";
function encodeTextSignatureV1(id, phase) {
  const payload = { v: 1, id };
  if (phase)
    payload.phase = phase;
  return JSON.stringify(payload);
}
function parseTextSignature(signature) {
  if (!signature)
    return void 0;
  if (signature.startsWith("{")) {
    try {
      const parsed = JSON.parse(signature);
      if (parsed.v === 1 && typeof parsed.id === "string") {
        if (parsed.phase === "commentary" || parsed.phase === "final_answer") {
          return { id: parsed.id, phase: parsed.phase };
        }
        return { id: parsed.id };
      }
    } catch {
    }
  }
  return { id: signature };
}
function convertToolResultOutput(model, content) {
  const textResult = content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const images = content.filter((c) => c.type === "image");
  const hasText = textResult.length > 0;
  if (images.length === 0 || !model.input.includes("image")) {
    return sanitizeSurrogates(hasText ? textResult : images.length > 0 ? "(see attached image)" : "(no tool output)");
  }
  const output = [];
  if (hasText) {
    output.push({ type: "input_text", text: sanitizeSurrogates(textResult) });
  }
  for (const image of images) {
    output.push({
      type: "input_image",
      detail: "auto",
      image_url: `data:${image.mimeType};base64,${image.data}`
    });
  }
  return output;
}
function convertResponsesMessages(model, context, allowedToolCallProviders, options) {
  var _a, _b;
  const normalizedContext = resolveTranscript(context, options == null ? void 0 : options.supportsMidConvoSystemMessages);
  const messages = [];
  const normalizeIdPart = (part) => {
    const sanitized = part.replace(/[^a-zA-Z0-9_-]/g, "_");
    const normalized = sanitized.length > 64 ? sanitized.slice(0, 64) : sanitized;
    return normalized.replace(/_+$/, "");
  };
  const buildForeignResponsesItemId = (itemId) => {
    const normalized = `fc_${shortHash(itemId)}`;
    return normalized.length > 64 ? normalized.slice(0, 64) : normalized;
  };
  const normalizeToolCallId = (id, _targetModel, source) => {
    if (!allowedToolCallProviders.has(model.provider))
      return normalizeIdPart(id);
    if (!id.includes("|"))
      return normalizeIdPart(id);
    const [callId, itemId] = id.split("|");
    const normalizedCallId = normalizeIdPart(callId);
    const isForeignToolCall = source.provider !== model.provider || source.api !== model.api;
    let normalizedItemId = isForeignToolCall ? buildForeignResponsesItemId(itemId) : normalizeIdPart(itemId);
    if (!normalizedItemId.startsWith("fc_")) {
      normalizedItemId = normalizeIdPart(`fc_${normalizedItemId}`);
    }
    return `${normalizedCallId}|${normalizedItemId}`;
  };
  const transformedMessages = transformMessages(normalizedContext.messages, model, normalizeToolCallId);
  const transcriptTools = resolveTranscriptTools(normalizedContext.messages, ((options == null ? void 0 : options.supportsAdditionalTools) ?? false) || ((options == null ? void 0 : options.supportsToolSearch) ?? false));
  const appendSystemToolAdditions = (message, seed) => {
    const tools = transcriptTools.anchorsAdditions ? message.toolsAdded ?? [] : [];
    if (tools.length === 0)
      return;
    if (options == null ? void 0 : options.supportsAdditionalTools) {
      messages.push({
        type: "additional_tools",
        role: "developer",
        tools: convertResponsesTools(tools, options.toolOptions)
      });
      return;
    }
    if (!(options == null ? void 0 : options.supportsToolSearch))
      return;
    const names = tools.map((tool) => tool.name);
    const callId = `pi_tool_load_${shortHash(`${seed}:${names.join(",")}`)}`;
    messages.push({
      type: "tool_search_call",
      call_id: callId,
      execution: "client",
      status: "completed",
      arguments: { query: names.join(" "), limit: names.length }
    });
    messages.push({
      type: "tool_search_output",
      call_id: callId,
      execution: "client",
      status: "completed",
      tools: convertResponsesTools(tools, { ...options.toolOptions, toolSearchResult: true })
    });
  };
  const includeInitialSystemMessage = (options == null ? void 0 : options.includeSystemPrompt) ?? true;
  const compat = model.compat;
  const instructionRole = model.reasoning && (compat == null ? void 0 : compat.supportsDeveloperRole) !== false ? "developer" : "system";
  let msgIndex = 0;
  let sourceIndex = 0;
  for (const msg of transformedMessages) {
    const isLeadingSystemMessage = sourceIndex++ === 0 && msg.role === "system";
    if (msg.role === "system") {
      if (!isLeadingSystemMessage)
        appendSystemToolAdditions(msg, `system:${msgIndex}`);
      if (!isLeadingSystemMessage || includeInitialSystemMessage) {
        const text = isLeadingSystemMessage ? getSystemMessageText(msg) : renderSystemMessageUpdate(msg);
        if (text.length > 0) {
          messages.push({ role: instructionRole, content: sanitizeSurrogates(text) });
        }
      }
    } else if (msg.role === "user") {
      if (typeof msg.content === "string") {
        messages.push({
          role: "user",
          content: [{ type: "input_text", text: sanitizeSurrogates(msg.content) }]
        });
      } else {
        const content = msg.content.map((item) => {
          if (item.type === "text") {
            return {
              type: "input_text",
              text: sanitizeSurrogates(item.text)
            };
          }
          return {
            type: "input_image",
            detail: "auto",
            image_url: `data:${item.mimeType};base64,${item.data}`
          };
        });
        if (content.length === 0)
          continue;
        messages.push({
          role: "user",
          content
        });
      }
    } else if (msg.role === "assistant") {
      const output = [];
      const assistantMsg = msg;
      const isSameProviderAndApi = assistantMsg.provider === model.provider && assistantMsg.api === model.api;
      const isSameModel = isSameProviderAndApi && assistantMsg.model === model.id;
      const isDifferentModel = isSameProviderAndApi && assistantMsg.model !== model.id;
      let textBlockIndex = 0;
      for (const block of msg.content) {
        if (block.type === "thinking") {
          if (block.thinkingSignature) {
            const reasoningItem = JSON.parse(block.thinkingSignature);
            output.push(reasoningItem);
          }
        } else if (block.type === "text") {
          const textBlock = block;
          const parsedSignature = parseTextSignature(textBlock.textSignature);
          const fallbackMessageId = textBlockIndex === 0 ? `msg_pi_${msgIndex}` : `msg_pi_${msgIndex}_${textBlockIndex}`;
          textBlockIndex++;
          let msgId = parsedSignature == null ? void 0 : parsedSignature.id;
          if (!msgId) {
            msgId = fallbackMessageId;
          } else if (msgId.length > 64) {
            msgId = `msg_${shortHash(msgId)}`;
          }
          output.push({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: sanitizeSurrogates(textBlock.text), annotations: [] }],
            status: "completed",
            id: msgId,
            phase: parsedSignature == null ? void 0 : parsedSignature.phase
          });
        } else if (block.type === "toolCall") {
          const toolCall = block;
          const [callId, itemIdRaw] = toolCall.id.split("|");
          const customInputProperty = (_a = options == null ? void 0 : options.grammarToolInputProperties) == null ? void 0 : _a.get(toolCall.name);
          let itemId = itemIdRaw;
          if (isDifferentModel && (itemId == null ? void 0 : itemId.startsWith("fc_")) || customInputProperty === void 0 && !(itemId == null ? void 0 : itemId.startsWith("fc_"))) {
            itemId = void 0;
          }
          if (customInputProperty !== void 0) {
            output.push({
              type: "custom_tool_call",
              id: itemId,
              call_id: callId,
              name: toolCall.name,
              input: sanitizeSurrogates(getGrammarToolInput(toolCall.name, toolCall.arguments, customInputProperty)),
              ...isSameModel && toolCall.namespace !== void 0 ? { namespace: toolCall.namespace } : {}
            });
          } else {
            output.push({
              type: "function_call",
              id: itemId,
              call_id: callId,
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments),
              ...isSameModel && toolCall.namespace !== void 0 ? { namespace: toolCall.namespace } : {}
            });
          }
        }
      }
      if (output.length === 0)
        continue;
      messages.push(...output);
    } else if (msg.role === "toolResult") {
      const [callId] = msg.toolCallId.split("|");
      const output = convertToolResultOutput(model, msg.content);
      if ((_b = options == null ? void 0 : options.grammarToolInputProperties) == null ? void 0 : _b.has(msg.toolName)) {
        messages.push({
          type: "custom_tool_call_output",
          call_id: callId,
          output
        });
      } else {
        messages.push({
          type: "function_call_output",
          call_id: callId,
          output
        });
      }
    }
    if (!isLeadingSystemMessage)
      msgIndex++;
  }
  return messages;
}
function convertResponsesTools(tools, options) {
  const defaultStrict = (options == null ? void 0 : options.strict) === void 0 ? false : options.strict;
  const supportsStrictMode = (options == null ? void 0 : options.supportsStrictMode) ?? true;
  const supportsOpenAIGrammarTools = (options == null ? void 0 : options.supportsOpenAIGrammarTools) ?? false;
  return tools.map((tool) => {
    const grammar = resolveGrammarConstrainedSampling(tool, supportsOpenAIGrammarTools);
    if (grammar) {
      return {
        type: "custom",
        name: tool.name,
        description: tool.description,
        format: {
          type: "grammar",
          syntax: grammar.format,
          definition: grammar.definition
        },
        ...(options == null ? void 0 : options.toolSearchResult) ? { defer_loading: true } : {}
      };
    }
    const constrainedStrict = resolveJsonSchemaStrictSampling(tool, supportsStrictMode);
    const strict = constrainedStrict ?? defaultStrict;
    const functionTool = {
      type: "function",
      name: tool.name,
      description: tool.description,
      parameters: getJsonSchemaToolParameters(tool, strict === true),
      ...(options == null ? void 0 : options.toolSearchResult) ? { defer_loading: true } : {}
    };
    if (supportsStrictMode) {
      functionTool.strict = strict;
    }
    return functionTool;
  });
}
function getCustomToolCallInput(block) {
  var _a;
  const property = (_a = block.customInput) == null ? void 0 : _a.property;
  if (property === void 0)
    return "";
  const value = block.arguments[property];
  return typeof value === "string" ? value : "";
}
function appendCustomToolCallInput(block, nextInput, close) {
  const customInput = block.customInput;
  if (!customInput)
    return void 0;
  const delta = appendGrammarToolInputJsonDelta(customInput.jsonBuffer, customInput.property, nextInput, close);
  block.arguments = { [customInput.property]: nextInput };
  return delta;
}
async function processResponsesStream(openaiStream, output, stream2, model, options) {
  var _a, _b, _c, _d, _e, _f;
  let sawTerminalResponseEvent = false;
  const outputSlots = /* @__PURE__ */ new Map();
  const reasoningBlocksById = /* @__PURE__ */ new Map();
  const applyMessagePhaseStopReason = (item) => {
    if (item.type === "message" && item.phase === "final_answer") {
      output.stopReason = "stop";
    }
  };
  const getSlot = (outputIndex, type) => {
    const slot = outputSlots.get(outputIndex);
    return (slot == null ? void 0 : slot.type) === type ? slot : void 0;
  };
  const pushToolCallDelta = (slot, delta) => {
    if (delta === void 0)
      return;
    stream2.push({
      type: "toolcall_delta",
      contentIndex: slot.contentIndex,
      delta,
      partial: output
    });
  };
  const createSlot = (outputIndex, item) => {
    var _a2;
    if (item.type === "reasoning") {
      const block = { type: "thinking", thinking: "" };
      output.content.push(block);
      const slot = {
        type: "thinking",
        block,
        contentIndex: output.content.length - 1
      };
      outputSlots.set(outputIndex, slot);
      stream2.push({ type: "thinking_start", contentIndex: slot.contentIndex, partial: output });
      return slot;
    }
    if (item.type === "message") {
      applyMessagePhaseStopReason(item);
      const block = { type: "text", text: "" };
      output.content.push(block);
      const slot = { type: "text", block, contentIndex: output.content.length - 1 };
      outputSlots.set(outputIndex, slot);
      stream2.push({ type: "text_start", contentIndex: slot.contentIndex, partial: output });
      return slot;
    }
    if (item.type === "function_call") {
      const block = {
        type: "toolCall",
        id: `${item.call_id}|${item.id}`,
        name: item.name,
        arguments: {},
        ...item.namespace !== void 0 ? { namespace: item.namespace } : {},
        partialJson: item.arguments || ""
      };
      output.content.push(block);
      const slot = {
        type: "toolCall",
        block,
        contentIndex: output.content.length - 1
      };
      outputSlots.set(outputIndex, slot);
      stream2.push({ type: "toolcall_start", contentIndex: slot.contentIndex, partial: output });
      return slot;
    }
    if (item.type === "custom_tool_call") {
      const inputProperty = ((_a2 = options == null ? void 0 : options.grammarToolInputProperties) == null ? void 0 : _a2.get(item.name)) ?? "input";
      const input = item.input || "";
      const block = {
        type: "toolCall",
        id: `${item.call_id}|${item.id}`,
        name: item.name,
        arguments: { [inputProperty]: input },
        ...item.namespace !== void 0 ? { namespace: item.namespace } : {},
        customInput: {
          property: inputProperty,
          jsonBuffer: { input: "", started: false, closed: false }
        }
      };
      output.content.push(block);
      const slot = {
        type: "toolCall",
        block,
        contentIndex: output.content.length - 1
      };
      outputSlots.set(outputIndex, slot);
      stream2.push({ type: "toolcall_start", contentIndex: slot.contentIndex, partial: output });
      return slot;
    }
    return void 0;
  };
  const getOrCreateSlot = (outputIndex, item) => {
    return outputSlots.get(outputIndex) ?? createSlot(outputIndex, item);
  };
  const backfillReasoningSignatures = (responseOutput) => {
    for (const item of responseOutput) {
      if (item.type !== "reasoning" || !item.encrypted_content)
        continue;
      const block = reasoningBlocksById.get(item.id);
      if (!(block == null ? void 0 : block.thinkingSignature))
        continue;
      const storedItem = JSON.parse(block.thinkingSignature);
      if (storedItem.encrypted_content)
        continue;
      block.thinkingSignature = JSON.stringify({
        ...storedItem,
        encrypted_content: item.encrypted_content
      });
    }
  };
  const finalizeResponse = (response) => {
    var _a2;
    sawTerminalResponseEvent = true;
    backfillReasoningSignatures(response.output ?? []);
    if (response == null ? void 0 : response.id) {
      output.responseId = response.id;
    }
    if (response == null ? void 0 : response.usage) {
      const inputDetails = response.usage.input_tokens_details;
      const cachedTokens = (inputDetails == null ? void 0 : inputDetails.cached_tokens) || 0;
      const cacheWriteTokens = (inputDetails == null ? void 0 : inputDetails.cache_write_tokens) || 0;
      output.usage = {
        // OpenAI includes cached and cache-write tokens in input_tokens, so subtract both.
        input: Math.max(0, (response.usage.input_tokens || 0) - cachedTokens - cacheWriteTokens),
        output: response.usage.output_tokens || 0,
        cacheRead: cachedTokens,
        cacheWrite: cacheWriteTokens,
        reasoning: ((_a2 = response.usage.output_tokens_details) == null ? void 0 : _a2.reasoning_tokens) || 0,
        totalTokens: response.usage.total_tokens || 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      };
    }
    calculateCost(model, output.usage);
    if (options == null ? void 0 : options.applyServiceTierPricing) {
      const serviceTier = options.resolveServiceTier ? options.resolveServiceTier(response == null ? void 0 : response.service_tier, options.serviceTier) : (response == null ? void 0 : response.service_tier) ?? options.serviceTier;
      options.applyServiceTierPricing(output.usage, serviceTier);
    }
    const status = response == null ? void 0 : response.status;
    const incompleteDetails = response == null ? void 0 : response.incomplete_details;
    const incompleteReason = typeof (incompleteDetails == null ? void 0 : incompleteDetails.reason) === "string" ? incompleteDetails.reason : void 0;
    output.rawStopReason = incompleteReason ? `${status}.${incompleteReason}` : status;
    const mappedStop = mapStopReason(status, incompleteReason);
    output.stopReason = mappedStop.stopReason;
    if (mappedStop.errorMessage === void 0)
      delete output.errorMessage;
    else
      output.errorMessage = mappedStop.errorMessage;
    if (output.content.some((b) => b.type === "toolCall") && output.stopReason === "stop") {
      output.stopReason = "toolUse";
    }
  };
  for await (const event of openaiStream) {
    if (event.type === "response.created") {
      output.responseId = event.response.id;
    } else if (event.type === "response.output_item.added") {
      createSlot(event.output_index, event.item);
    } else if (event.type === "response.reasoning_summary_text.delta") {
      const slot = getSlot(event.output_index, "thinking");
      if (!slot)
        continue;
      slot.block.thinking += event.delta;
      stream2.push({
        type: "thinking_delta",
        contentIndex: slot.contentIndex,
        delta: event.delta,
        partial: output
      });
    } else if (event.type === "response.reasoning_summary_part.done") {
      const slot = getSlot(event.output_index, "thinking");
      if (!slot)
        continue;
      slot.block.thinking += "\n\n";
      stream2.push({
        type: "thinking_delta",
        contentIndex: slot.contentIndex,
        delta: "\n\n",
        partial: output
      });
    } else if (event.type === "response.reasoning_text.delta") {
      const slot = getSlot(event.output_index, "thinking");
      if (!slot)
        continue;
      slot.block.thinking += event.delta;
      stream2.push({
        type: "thinking_delta",
        contentIndex: slot.contentIndex,
        delta: event.delta,
        partial: output
      });
    } else if (event.type === "response.output_text.delta") {
      const slot = getSlot(event.output_index, "text");
      if (!slot)
        continue;
      slot.block.text += event.delta;
      stream2.push({
        type: "text_delta",
        contentIndex: slot.contentIndex,
        delta: event.delta,
        partial: output
      });
    } else if (event.type === "response.refusal.delta") {
      const slot = getSlot(event.output_index, "text");
      if (!slot)
        continue;
      slot.block.text += event.delta;
      stream2.push({
        type: "text_delta",
        contentIndex: slot.contentIndex,
        delta: event.delta,
        partial: output
      });
    } else if (event.type === "response.function_call_arguments.delta") {
      const slot = getSlot(event.output_index, "toolCall");
      if (!slot || slot.block.partialJson === void 0)
        continue;
      slot.block.partialJson += event.delta;
      slot.block.arguments = parseStreamingJson(slot.block.partialJson);
      pushToolCallDelta(slot, event.delta);
    } else if (event.type === "response.function_call_arguments.done") {
      const slot = getSlot(event.output_index, "toolCall");
      if (!slot || slot.block.partialJson === void 0)
        continue;
      const previousPartialJson = slot.block.partialJson;
      slot.block.partialJson = event.arguments;
      slot.block.arguments = parseStreamingJson(slot.block.partialJson);
      if (event.arguments.startsWith(previousPartialJson)) {
        const delta = event.arguments.slice(previousPartialJson.length);
        if (delta.length > 0)
          pushToolCallDelta(slot, delta);
      }
    } else if (event.type === "response.custom_tool_call_input.delta") {
      const slot = getSlot(event.output_index, "toolCall");
      if (!slot || !slot.block.customInput)
        continue;
      pushToolCallDelta(slot, appendCustomToolCallInput(slot.block, getCustomToolCallInput(slot.block) + event.delta, false));
    } else if (event.type === "response.custom_tool_call_input.done") {
      const slot = getSlot(event.output_index, "toolCall");
      if (!slot || !slot.block.customInput)
        continue;
      pushToolCallDelta(slot, appendCustomToolCallInput(slot.block, event.input, true));
    } else if (event.type === "response.output_item.done") {
      const item = event.item;
      applyMessagePhaseStopReason(item);
      const slot = getOrCreateSlot(event.output_index, item);
      if (item.type === "reasoning" && (slot == null ? void 0 : slot.type) === "thinking") {
        const summaryText = ((_a = item.summary) == null ? void 0 : _a.map((s) => s.text).join("\n\n")) || "";
        const contentText = ((_b = item.content) == null ? void 0 : _b.map((c) => c.text).join("\n\n")) || "";
        slot.block.thinking = summaryText || contentText || slot.block.thinking;
        slot.block.thinkingSignature = JSON.stringify(item);
        reasoningBlocksById.set(item.id, slot.block);
        stream2.push({
          type: "thinking_end",
          contentIndex: slot.contentIndex,
          content: slot.block.thinking,
          partial: output
        });
        outputSlots.delete(event.output_index);
      } else if (item.type === "message" && (slot == null ? void 0 : slot.type) === "text") {
        slot.block.text = ((_c = item.content) == null ? void 0 : _c.map((c) => c.type === "output_text" ? c.text : c.refusal).join("")) || "";
        slot.block.textSignature = encodeTextSignatureV1(item.id, item.phase ?? void 0);
        stream2.push({
          type: "text_end",
          contentIndex: slot.contentIndex,
          content: slot.block.text,
          partial: output
        });
        outputSlots.delete(event.output_index);
      } else if (item.type === "function_call" && (slot == null ? void 0 : slot.type) === "toolCall" && slot.block.partialJson !== void 0) {
        slot.block.arguments = parseStreamingJson(item.arguments || slot.block.partialJson || "{}");
        if (item.namespace !== void 0)
          slot.block.namespace = item.namespace;
        delete slot.block.partialJson;
        stream2.push({
          type: "toolcall_end",
          contentIndex: slot.contentIndex,
          toolCall: slot.block,
          partial: output
        });
        outputSlots.delete(event.output_index);
      } else if (item.type === "custom_tool_call" && (slot == null ? void 0 : slot.type) === "toolCall" && slot.block.customInput) {
        pushToolCallDelta(slot, appendCustomToolCallInput(slot.block, item.input ?? getCustomToolCallInput(slot.block), true));
        if (item.namespace !== void 0)
          slot.block.namespace = item.namespace;
        delete slot.block.customInput;
        stream2.push({
          type: "toolcall_end",
          contentIndex: slot.contentIndex,
          toolCall: slot.block,
          partial: output
        });
        outputSlots.delete(event.output_index);
      }
    } else if (event.type === "response.completed" || event.type === "response.incomplete") {
      finalizeResponse(event.response);
    } else if (event.type === "error") {
      throw new Error(`Error Code ${event.code}: ${event.message}` || "Unknown error");
    } else if (event.type === "response.failed") {
      sawTerminalResponseEvent = true;
      output.rawStopReason = (_d = event.response) == null ? void 0 : _d.status;
      const error = (_e = event.response) == null ? void 0 : _e.error;
      const details = (_f = event.response) == null ? void 0 : _f.incomplete_details;
      const msg = error ? `${error.code || "unknown"}: ${error.message || "no message"}` : (details == null ? void 0 : details.reason) ? `incomplete: ${details.reason}` : "Unknown error (no error details in response)";
      throw new Error(msg);
    }
  }
  if (!sawTerminalResponseEvent) {
    throw new Error("OpenAI Responses stream ended before a terminal response event");
  }
}
function mapStopReason(status, incompleteReason) {
  if (!status)
    return { stopReason: "stop" };
  switch (status) {
    case "completed":
      return { stopReason: "stop" };
    case "incomplete":
      if (incompleteReason === "max_output_tokens") {
        return { stopReason: "length" };
      }
      return {
        stopReason: "error",
        errorMessage: incompleteReason ? `Response incomplete: ${incompleteReason}` : "Response incomplete without a provider reason"
      };
    case "failed":
    case "cancelled":
      return { stopReason: "error" };
    // These two are wonky ...
    case "in_progress":
    case "queued":
      return { stopReason: "stop" };
    default: {
      const _exhaustive = status;
      throw new Error(`Unhandled stop reason: ${_exhaustive}`);
    }
  }
}
const OPENAI_TOOL_CALL_PROVIDERS = /* @__PURE__ */ new Set(["openai", "openai-codex", "opencode"]);
const OPENAI_RESPONSES_MIN_OUTPUT_TOKENS = 16;
function hasHeader(headers, name) {
  if (!headers)
    return false;
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === expected && value !== null && value.trim().length > 0)
      return true;
  }
  return false;
}
function getClientApiKey(provider, apiKey, headers) {
  if (apiKey)
    return apiKey;
  if (hasHeader(headers, "authorization") || hasHeader(headers, "cf-aig-authorization"))
    return "unused";
  throw new Error(`No API key for provider: ${provider}`);
}
function detectSessionAffinityFormat(model) {
  return model.provider === "openrouter" || model.baseUrl.includes("openrouter.ai") ? "openrouter" : "openai";
}
function resolveCacheRetention(cacheRetention, env) {
  if (cacheRetention) {
    return cacheRetention;
  }
  if (getProviderEnvValue("PI_CACHE_RETENTION", env) === "long") {
    return "long";
  }
  return "short";
}
function getCompat(model) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  return {
    supportsDeveloperRole: ((_a = model.compat) == null ? void 0 : _a.supportsDeveloperRole) ?? true,
    supportsMidConvoSystemMessages: ((_b = model.compat) == null ? void 0 : _b.supportsMidConvoSystemMessages) ?? false,
    sessionAffinityFormat: ((_c = model.compat) == null ? void 0 : _c.sessionAffinityFormat) ?? detectSessionAffinityFormat(model),
    supportsLongCacheRetention: ((_d = model.compat) == null ? void 0 : _d.supportsLongCacheRetention) ?? true,
    supportsStrictMode: ((_e = model.compat) == null ? void 0 : _e.supportsStrictMode) ?? false,
    supportsOpenAIGrammarTools: ((_f = model.compat) == null ? void 0 : _f.supportsOpenAIGrammarTools) ?? false,
    supportsAdditionalTools: ((_g = model.compat) == null ? void 0 : _g.supportsAdditionalTools) ?? false,
    supportsToolSearch: ((_h = model.compat) == null ? void 0 : _h.supportsToolSearch) ?? false,
    supportsExplicitPromptCacheMode: ((_i = model.compat) == null ? void 0 : _i.supportsExplicitPromptCacheMode) ?? false,
    supportsMaxOutputTokens: ((_j = model.compat) == null ? void 0 : _j.supportsMaxOutputTokens) ?? true
  };
}
function getPromptCacheRetention(compat, cacheRetention) {
  return cacheRetention === "long" && compat.supportsLongCacheRetention && !compat.supportsExplicitPromptCacheMode ? "24h" : void 0;
}
function getPromptCacheOptions(compat, cacheRetention) {
  if (!compat.supportsExplicitPromptCacheMode)
    return void 0;
  if (cacheRetention === "none")
    return { mode: "explicit" };
  if (cacheRetention === "long" && compat.supportsLongCacheRetention)
    return { ttl: "30m" };
  return void 0;
}
const stream = (model, context, options) => {
  const stream2 = new AssistantMessageEventStream();
  const normalizedContext = resolveTranscript(context, getCompat(model).supportsMidConvoSystemMessages);
  (async () => {
    var _a, _b, _c, _d;
    const output = {
      role: "assistant",
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
      },
      stopReason: "pending",
      timestamp: Date.now()
    };
    try {
      const apiKey = getClientApiKey(model.provider, options == null ? void 0 : options.apiKey, options == null ? void 0 : options.headers);
      const cacheRetention = resolveCacheRetention(options == null ? void 0 : options.cacheRetention, options == null ? void 0 : options.env);
      const cacheSessionId = cacheRetention === "none" ? void 0 : options == null ? void 0 : options.sessionId;
      const compat = getCompat(model);
      const grammarToolInputProperties = createGrammarToolInputProperties(getDeclaredTools(normalizedContext.messages), compat.supportsOpenAIGrammarTools);
      const client = createClient(model, normalizedContext, apiKey, options == null ? void 0 : options.headers, options == null ? void 0 : options.fetch, cacheSessionId);
      let params = buildParams(model, normalizedContext, options, compat, grammarToolInputProperties);
      const nextParams = await ((_a = options == null ? void 0 : options.onPayload) == null ? void 0 : _a.call(options, params, model));
      if (nextParams !== void 0) {
        params = nextParams;
      }
      const requestOptions = {
        ...(options == null ? void 0 : options.signal) ? { signal: options.signal } : {},
        ...(options == null ? void 0 : options.timeoutMs) !== void 0 ? { timeout: options.timeoutMs } : {},
        maxRetries: 0
      };
      const { data: openaiStream, response } = await retryProviderRequest(() => client.responses.create(params, requestOptions).withResponse(), {
        maxRetries: options == null ? void 0 : options.maxRetries,
        maxRetryDelayMs: options == null ? void 0 : options.maxRetryDelayMs,
        signal: options == null ? void 0 : options.signal
      });
      await ((_b = options == null ? void 0 : options.onResponse) == null ? void 0 : _b.call(options, { status: response.status, headers: headersToRecord(response.headers) }, model));
      stream2.push({ type: "start", partial: output });
      await processResponsesStream(openaiStream, output, stream2, model, {
        serviceTier: options == null ? void 0 : options.serviceTier,
        grammarToolInputProperties,
        applyServiceTierPricing: (usage, serviceTier) => applyServiceTierPricing(usage, serviceTier, model)
      });
      if ((_c = options == null ? void 0 : options.signal) == null ? void 0 : _c.aborted) {
        throw new Error("Request was aborted");
      }
      if (output.stopReason === "pending") {
        throw new Error("OpenAI Responses stream ended without a stop reason");
      }
      if (output.stopReason === "aborted" || output.stopReason === "error") {
        throw new Error(output.errorMessage || "An unknown error occurred");
      }
      stream2.push({ type: "done", reason: output.stopReason, message: output });
      stream2.end();
    } catch (error) {
      for (const block of output.content) {
        delete block.index;
        delete block.partialJson;
        delete block.customInput;
      }
      output.stopReason = ((_d = options == null ? void 0 : options.signal) == null ? void 0 : _d.aborted) ? "aborted" : "error";
      output.errorMessage = formatProviderError(normalizeProviderError(error), `${model.provider === "openai" ? "OpenAI" : model.provider} API error`);
      stream2.push({ type: "error", reason: output.stopReason, error: output });
      stream2.end();
    }
  })();
  return stream2;
};
const streamSimple = (model, context, options) => {
  getClientApiKey(model.provider, options == null ? void 0 : options.apiKey, options == null ? void 0 : options.headers);
  const base = {
    ...buildBaseOptions(model, context, options, options == null ? void 0 : options.apiKey),
    toolChoice: options == null ? void 0 : options.toolChoice
  };
  const clampedReasoning = (options == null ? void 0 : options.reasoning) ? clampThinkingLevel(model, options.reasoning) : void 0;
  const reasoningEffort = clampedReasoning === "off" ? void 0 : clampedReasoning;
  return stream(model, context, {
    ...base,
    reasoningEffort
  });
};
function createClient(model, context, apiKey, optionsHeaders, fetch, sessionId) {
  const compat = getCompat(model);
  const headers = { "User-Agent": getPiUserAgent(), ...model.headers };
  if (model.provider === "github-copilot") {
    const hasImages = hasCopilotVisionInput(context.messages);
    const copilotHeaders = buildCopilotDynamicHeaders({
      messages: context.messages,
      hasImages
    });
    Object.assign(headers, copilotHeaders);
  }
  if (sessionId) {
    if (compat.sessionAffinityFormat === "openrouter") {
      headers["x-session-id"] = sessionId;
    } else {
      if (compat.sessionAffinityFormat === "openai") {
        headers.session_id = sessionId;
      }
      headers["x-client-request-id"] = sessionId;
    }
  }
  if (optionsHeaders) {
    Object.assign(headers, optionsHeaders);
  }
  return new OpenAI({
    apiKey,
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    fetch,
    defaultHeaders: headers
  });
}
function buildParams(model, context, options, compat = getCompat(model), grammarToolInputProperties = createGrammarToolInputProperties(getDeclaredTools(context.messages), compat.supportsOpenAIGrammarTools)) {
  var _a, _b, _c;
  const transcriptTools = resolveTranscriptTools(context.messages, compat.supportsAdditionalTools || compat.supportsToolSearch);
  const messages = convertResponsesMessages(model, context, OPENAI_TOOL_CALL_PROVIDERS, {
    grammarToolInputProperties,
    supportsMidConvoSystemMessages: compat.supportsMidConvoSystemMessages,
    supportsAdditionalTools: compat.supportsAdditionalTools,
    supportsToolSearch: compat.supportsToolSearch,
    toolOptions: {
      supportsStrictMode: compat.supportsStrictMode,
      supportsOpenAIGrammarTools: compat.supportsOpenAIGrammarTools
    }
  });
  const cacheRetention = resolveCacheRetention(options == null ? void 0 : options.cacheRetention, options == null ? void 0 : options.env);
  const params = {
    model: model.id,
    input: messages,
    stream: true,
    prompt_cache_key: cacheRetention === "none" ? void 0 : clampOpenAIPromptCacheKey(options == null ? void 0 : options.sessionId),
    prompt_cache_retention: getPromptCacheRetention(compat, cacheRetention),
    prompt_cache_options: getPromptCacheOptions(compat, cacheRetention),
    store: false
  };
  if ((options == null ? void 0 : options.maxTokens) && compat.supportsMaxOutputTokens) {
    params.max_output_tokens = Math.max(options.maxTokens, OPENAI_RESPONSES_MIN_OUTPUT_TOKENS);
  }
  if ((options == null ? void 0 : options.temperature) !== void 0) {
    params.temperature = options == null ? void 0 : options.temperature;
  }
  if ((options == null ? void 0 : options.serviceTier) !== void 0) {
    params.service_tier = options.serviceTier;
  }
  if (transcriptTools.requestTools.length > 0) {
    params.tools = convertResponsesTools(transcriptTools.requestTools, {
      supportsStrictMode: compat.supportsStrictMode,
      supportsOpenAIGrammarTools: compat.supportsOpenAIGrammarTools
    });
  }
  if ((options == null ? void 0 : options.toolChoice) !== void 0) {
    params.tool_choice = options.toolChoice;
  }
  if (model.reasoning) {
    if ((options == null ? void 0 : options.reasoningEffort) || (options == null ? void 0 : options.reasoningSummary)) {
      const effort = (options == null ? void 0 : options.reasoningEffort) ? ((_a = model.thinkingLevelMap) == null ? void 0 : _a[options.reasoningEffort]) ?? options.reasoningEffort : "medium";
      params.reasoning = {
        effort,
        summary: (options == null ? void 0 : options.reasoningSummary) || "auto"
      };
      params.include = ["reasoning.encrypted_content"];
    } else if (model.provider !== "github-copilot" && ((_b = model.thinkingLevelMap) == null ? void 0 : _b.off) !== null) {
      params.reasoning = {
        effort: ((_c = model.thinkingLevelMap) == null ? void 0 : _c.off) ?? "none"
      };
    }
    if (model.provider === "xai")
      params.include = ["reasoning.encrypted_content"];
  }
  if (options == null ? void 0 : options.samplingParams) {
    Object.assign(params, options.samplingParams);
  }
  return params;
}
function getServiceTierCostMultiplier(model, serviceTier) {
  switch (serviceTier) {
    case "flex":
      return 0.5;
    case "priority":
      return model.id === "gpt-5.5" ? 2.5 : 2;
    default:
      return 1;
  }
}
function applyServiceTierPricing(usage, serviceTier, model) {
  const multiplier = getServiceTierCostMultiplier(model, serviceTier);
  if (multiplier === 1)
    return;
  usage.cost.input *= multiplier;
  usage.cost.output *= multiplier;
  usage.cost.cacheRead *= multiplier;
  usage.cost.cacheWrite *= multiplier;
  usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
export {
  stream,
  streamSimple
};

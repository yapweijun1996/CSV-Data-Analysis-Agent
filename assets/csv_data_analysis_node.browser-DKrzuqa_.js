import { A as AnthropicError } from "./csv_data_analysis_anthropic-messages-DP9RNsQY.js";
import "./csv_data_analysis_app-agent-CnlZuZOy.js";
import "./csv_data_analysis_vendor-storage-Dda2oZrY.js";
import "./csv_data_analysis_vendor-data-CIO9Xlwr.js";
import "./csv_data_analysis_vendor-react-core-DlbdMisc.js";
import "./csv_data_analysis_vendor-ai-sdk-CWgo4xjO.js";
import "./csv_data_analysis_vendor-ai-shared-L1egyVJx.js";
import "./csv_data_analysis_vendor-ai-google-CzQrQhPa.js";
import "./csv_data_analysis_vendor-ai-openai-XLZ2hpY0.js";
import "./csv_data_analysis_simple-options-BzKODjrb.js";
import "./csv_data_analysis_github-copilot-headers-eBo5GwLf.js";
function unavailable(module) {
  return new Proxy({}, {
    get(_target, property) {
      if (typeof property === "symbol")
        return void 0;
      throw new AnthropicError(`\`${module}.${property}\` is not available in this environment; it needs a Node.js-compatible runtime`);
    }
  });
}
unavailable("child_process");
unavailable("crypto");
const fs = unavailable("fs");
unavailable("os");
const path = unavailable("path");
unavailable("stream");
unavailable("util");
export {
  fs,
  path
};

import {
  ENSURE_CONTENT_SCRIPT_MESSAGE,
  type EnsureContentScriptResponse,
  type JudolRuntimeMessage,
} from "../shared/messaging";

chrome.runtime.onMessage.addListener(
  (
    message: JudolRuntimeMessage,
    _sender,
    sendResponse: (response: EnsureContentScriptResponse) => void,
  ) => {
    if (message?.type !== ENSURE_CONTENT_SCRIPT_MESSAGE) {
      return false;
    }

    void ensureContentScript(message.tabId).then(sendResponse);
    return true;
  },
);

async function ensureContentScript(tabId: number): Promise<EnsureContentScriptResponse> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

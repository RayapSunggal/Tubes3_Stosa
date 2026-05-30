import {
  FETCH_IMAGE_MESSAGE,
  OFFSCREEN_RECOGNIZE_IMAGE_MESSAGE,
  RECOGNIZE_IMAGE_MESSAGE,
  type FetchImageResponse,
  type JudolRuntimeMessage,
  type RecognizeImageResponse,
} from "../shared/messaging";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const OFFSCREEN_DOCUMENT_PATH = "offscreen.html";

let creatingOffscreenDocument: Promise<void> | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: JudolRuntimeMessage,
    _sender,
    sendResponse: (response: FetchImageResponse | RecognizeImageResponse) => void,
  ) => {
    if (message?.type === FETCH_IMAGE_MESSAGE) {
      void fetchImage(message.url)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error, "Unable to fetch image"),
          });
        });

      return true;
    }

    if (message?.type === RECOGNIZE_IMAGE_MESSAGE) {
      void recognizeImage(message)
        .then(sendResponse)
        .catch((error: unknown) => {
          sendResponse({
            ok: false,
            error: getErrorMessage(error, "Unable to recognize image"),
          });
        });

      return true;
    }

    return false;
  },
);

async function recognizeImage(
  message: Extract<JudolRuntimeMessage, { type: typeof RECOGNIZE_IMAGE_MESSAGE }>,
): Promise<RecognizeImageResponse> {
  const dataUrl = message.dataUrl ?? await fetchImageAsDataUrl(message.url);
  await ensureOffscreenDocument();
  return sendRecognitionToOffscreen(dataUrl);
}

async function fetchImage(url: string): Promise<FetchImageResponse> {
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      error: "Unsupported image URL",
    };
  }

  const response = await fetch(parsedUrl.href, {
    credentials: "include",
    redirect: "follow",
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `Image request failed with ${response.status}`,
    };
  }

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return {
      ok: false,
      error: "URL does not point to an image",
    };
  }

  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: "Image is too large for OCR",
    };
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: "Image is too large for OCR",
    };
  }

  return {
    ok: true,
    contentType,
    base64: arrayBufferToBase64(buffer),
  };
}

async function fetchImageAsDataUrl(url: string | undefined): Promise<string> {
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("Missing OCR image URL");
  }

  const response = await fetchImage(url);
  if (!response.ok) {
    throw new Error(response.error);
  }

  return `data:${response.contentType};base64,${response.base64}`;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (!chrome.offscreen) {
    throw new Error("Chrome offscreen API is unavailable");
  }

  if (await hasOffscreenDocument()) {
    return;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [chrome.offscreen.Reason.WORKERS, chrome.offscreen.Reason.BLOBS],
        justification: "Run Tesseract OCR in an extension document.",
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
}

async function hasOffscreenDocument(): Promise<boolean> {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
    });

    return contexts.length > 0;
  }

  return chrome.offscreen.hasDocument();
}

function sendRecognitionToOffscreen(dataUrl: string): Promise<RecognizeImageResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: OFFSCREEN_RECOGNIZE_IMAGE_MESSAGE,
        dataUrl,
      } satisfies JudolRuntimeMessage,
      (response?: RecognizeImageResponse) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        if (!response) {
          reject(new Error("No offscreen OCR response"));
          return;
        }

        resolve(response);
      },
    );
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

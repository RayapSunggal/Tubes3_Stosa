import {
  FETCH_IMAGE_MESSAGE,
  type FetchImageResponse,
  type JudolRuntimeMessage,
} from "../shared/messaging";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

chrome.runtime.onMessage.addListener(
  (
    message: JudolRuntimeMessage,
    _sender,
    sendResponse: (response: FetchImageResponse) => void,
  ) => {
    if (message?.type !== FETCH_IMAGE_MESSAGE) {
      return false;
    }

    void fetchImage(message.url)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unable to fetch image",
        });
      });

    return true;
  },
);

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

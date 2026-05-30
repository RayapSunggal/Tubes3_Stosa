import Tesseract from "tesseract.js";
import {
  OFFSCREEN_RECOGNIZE_IMAGE_MESSAGE,
  type JudolRuntimeMessage,
  type RecognizeImageResponse,
} from "../shared/messaging";

let workerPromise: Promise<Tesseract.Worker> | null = null;

chrome.runtime.onMessage.addListener(
  (
    message: JudolRuntimeMessage,
    _sender,
    sendResponse: (response: RecognizeImageResponse) => void,
  ) => {
    if (message?.type !== OFFSCREEN_RECOGNIZE_IMAGE_MESSAGE) {
      return false;
    }

    void recognizeImageDataUrl(message.dataUrl)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: getErrorMessage(error),
        });
      });

    return true;
  },
);

async function recognizeImageDataUrl(
  dataUrl: string,
): Promise<RecognizeImageResponse> {
  const startedAt = now();
  const worker = await getOcrWorker();
  const result = await worker.recognize(dataUrl);

  return {
    ok: true,
    text: normalizeOcrText(result.data.text),
    executionTimeMs: now() - startedAt,
  };
}

async function getOcrWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = createOcrWorker().catch((error: unknown) => {
      workerPromise = null;
      throw error;
    });
  }

  return workerPromise;
}

async function createOcrWorker(): Promise<Tesseract.Worker> {
  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    workerPath: chrome.runtime.getURL("tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("tesseract/tesseract-core-lstm.wasm.js"),
    langPath: chrome.runtime.getURL("tessdata/4.0.0_best_int"),
    cachePath: "judol-detector-ocr",
    workerBlobURL: false,
    gzip: true,
    logger: () => {},
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
      user_defined_dpi: "96",
    });
  } catch (error) {
    void worker.terminate();
    throw error;
  }

  return worker;
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/[|\u00a6]/gu, "I")
    .replace(/\s+/gu, " ")
    .trim();
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function now(): number {
  return globalThis.performance?.now() ?? Date.now();
}

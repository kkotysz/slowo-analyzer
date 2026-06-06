import type { WorkerAnalyzeRequest, WorkerAnalyzeResponse } from "../types/wordle";

export function createAnalysisWorker(): Worker {
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
}

export type AnalysisWorkerMessageHandler = (message: WorkerAnalyzeResponse) => void;

export function postRankRequest(worker: Worker, request: WorkerAnalyzeRequest): void {
  worker.postMessage(request);
}

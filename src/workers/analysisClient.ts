import type {
  WorkerAnalyzeResponse,
  WorkerCancelRequest,
  WorkerEvaluateTurnsRequest,
  WorkerRankRequest,
  WorkerSolveRequest,
} from "../types/wordle";

export function createAnalysisWorker(): Worker {
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
}

export type AnalysisWorkerMessageHandler = (message: WorkerAnalyzeResponse) => void;

export function postRankRequest(worker: Worker, request: WorkerRankRequest): void {
  worker.postMessage(request);
}

export function postEvaluateTurnsRequest(worker: Worker, request: WorkerEvaluateTurnsRequest): void {
  worker.postMessage(request);
}

export function postSolveRequest(worker: Worker, request: WorkerSolveRequest): void {
  worker.postMessage(request);
}

export function postCancelRequest(worker: Worker, request: WorkerCancelRequest): void {
  worker.postMessage(request);
}

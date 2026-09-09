export type AnalysisStatus = "answered" | "uncertain";

export interface AnalysisResult {
  question: string;
  options: string[];
  answer: string;
  confidence: number;
  status: AnalysisStatus;
}

export type ImageSource = "camera" | "upload" | "paste";

export interface CapturedImage {
  dataUrl: string;
  source: ImageSource;
}

export interface HistoryItem {
  id: string;
  createdAt: number;
  title: string;
  result: AnalysisResult;
}

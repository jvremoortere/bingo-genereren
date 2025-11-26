export interface BingoItem {
  id: string;
  problem: string; // The question/clue read aloud
  answer: string;  // The content on the card
}

export interface BingoCardData {
  id: number;
  cells: (BingoItem | 'GRATIS')[];
}

export interface SubjectContext {
  subject: string;
  isMath: boolean; // True if it involves formulas/LaTeX, false for text/trivia
}

export enum GeneratorStatus {
  IDLE = 'IDLE',
  DETECTING = 'DETECTING',
  CONFIRMING = 'CONFIRMING',
  GENERATING = 'GENERATING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
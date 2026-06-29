declare module 'word-extractor' {
  interface WordExtractorDocument {
    getBody(): string;
    getFootnotes(): string;
    getEndnotes(): string;
    getHeaders(options?: { includeFooters?: boolean }): string;
    getFooters(): string;
    getAnnotations(): string;
    getTextboxes(options?: { includeHeadersAndFooters?: boolean; includeBody?: boolean }): string;
  }

  class WordExtractor {
    extract(input: string | Buffer): Promise<WordExtractorDocument>;
  }

  export = WordExtractor;
}


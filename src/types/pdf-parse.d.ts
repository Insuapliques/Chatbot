declare module 'pdf-parse' {
  interface PDFMetadata {
    info?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }

  interface PDFParseResult {
    text: string;
    info?: PDFMetadata['info'];
    metadata?: PDFMetadata['metadata'];
    version?: string;
    numpages?: number;
  }

  function pdfParse(data: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PDFParseResult>;

  export default pdfParse;
}

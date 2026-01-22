// Custom error classes for PDF processing

export class PDFProcessingError extends Error {
  constructor(message: string, public context?: unknown) {
    super(message);
    this.name = 'PDFProcessingError';
  }
}

export class PDFLoadError extends PDFProcessingError {
  constructor(message: string, filePath?: string) {
    super(`Failed to load PDF${filePath ? ` from ${filePath}` : ''}: ${message}`);
    this.name = 'PDFLoadError';
  }
}

export class UnsupportedEncodingError extends PDFProcessingError {
  constructor(encoding: string, fontName: string) {
    super(`Unsupported font encoding: ${encoding} in font ${fontName}`);
    this.name = 'UnsupportedEncodingError';
  }
}

export class FontNotFoundError extends PDFProcessingError {
  constructor(fontName: string, page: number) {
    super(`Font ${fontName} not found on page ${page + 1}`);
    this.name = 'FontNotFoundError';
  }
}

export class CharacterNotInFontError extends PDFProcessingError {
  constructor(char: string, fontName: string) {
    super(`Character "${char}" (U+${char.charCodeAt(0).toString(16).toUpperCase()}) not available in font ${fontName}`);
    this.name = 'CharacterNotInFontError';
  }
}

export class ContentStreamParseError extends PDFProcessingError {
  constructor(message: string, page?: number) {
    super(`Failed to parse content stream${page !== undefined ? ` on page ${page + 1}` : ''}: ${message}`);
    this.name = 'ContentStreamParseError';
  }
}

/**
 * Format an error for user-friendly display
 */
export function formatErrorForUser(error: Error): string {
  if (error instanceof PDFLoadError) {
    return 'Unable to open the PDF file. The file may be corrupted or password-protected.';
  }

  if (error instanceof UnsupportedEncodingError) {
    return 'The PDF uses a font encoding that is not yet supported. Some text could not be replaced.';
  }

  if (error instanceof CharacterNotInFontError) {
    return 'Some replacement text contains characters not available in the PDF\'s fonts. Replacements were partially completed where possible.';
  }

  if (error instanceof ContentStreamParseError) {
    return 'Unable to process some pages of the PDF. The document may use advanced features not yet supported.';
  }

  if (error instanceof PDFProcessingError) {
    return `PDF processing error: ${error.message}`;
  }

  return `An unexpected error occurred: ${error.message}`;
}

export type CodeToken = { text: string; light: string; dark: string };
export type CodeLines = CodeToken[][];
export type HighlightRequest = { id: number; source: string; language: string };
export type HighlightResponse = { id: number; lines?: CodeLines; error?: string };
export type SourcePreview = { content: string; byteSize: number | null; truncated: boolean; binary: boolean; contentType: string };

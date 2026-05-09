declare namespace PDFKit {
  interface PDFDocument {
    page: {
      width: number;
      height: number;
      margins: {
        top: number;
        bottom: number;
        left: number;
        right: number;
      };
    };
    y: number;
    on(event: string, listener: (...args: any[]) => void): this;
    addPage(): this;
    rect(x: number, y: number, width: number, height: number): this;
    roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
    fill(color?: string): this;
    fillAndStroke(fillColor?: string, strokeColor?: string): this;
    strokeColor(color: string): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(color?: string): this;
    image(src: string, x: number, y: number, options?: Record<string, unknown>): this;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string, options?: Record<string, unknown>): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
    moveDown(lines?: number): this;
    end(): void;
  }
}

declare module 'pdfkit' {
  export default class PDFDocument implements PDFKit.PDFDocument {
    constructor(options?: Record<string, unknown>);
    page: PDFKit.PDFDocument['page'];
    y: number;
    on(event: string, listener: (...args: any[]) => void): this;
    addPage(): this;
    rect(x: number, y: number, width: number, height: number): this;
    roundedRect(x: number, y: number, width: number, height: number, radius: number): this;
    fill(color?: string): this;
    fillAndStroke(fillColor?: string, strokeColor?: string): this;
    strokeColor(color: string): this;
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    stroke(color?: string): this;
    image(src: string, x: number, y: number, options?: Record<string, unknown>): this;
    font(name: string): this;
    fontSize(size: number): this;
    fillColor(color: string): this;
    text(text: string, options?: Record<string, unknown>): this;
    text(text: string, x?: number, y?: number, options?: Record<string, unknown>): this;
    moveDown(lines?: number): this;
    end(): void;
  }
}

/**
 * `pdfmake` va uning shrift fayllari (`vfs_fonts`) o'z tip ta'rifini
 * bermaydi va biz `@types/pdfmake` ni qo'shmaymiz (u har doim aynan shu
 * versiyaga mos tushmaydi). Bizga kerak bo'lgani —
 * `createPdf(dd).download(name)` va `addVirtualFileSystem(vfs)`.
 * To'liqroq foydalanish `src/lib/result-pdf.ts` da.
 */
declare module 'pdfmake/build/pdfmake' {
  type PdfDoc = {
    download(filename?: string): void;
    open(): void;
    getBlob(cb: (blob: Blob) => void): void;
  };
  type PdfMake = {
    vfs: Record<string, string>;
    addVirtualFileSystem(vfs: Record<string, string>): void;
    createPdf(docDefinition: unknown): PdfDoc;
  };
  const pdfMake: PdfMake;
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: Record<string, string>;
  export default vfs;
}

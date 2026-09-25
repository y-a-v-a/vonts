import type { GlyphData } from '../glyphs/glyph';

/**
 * Installs the latest generated alphabet as a real web font (via the FontFace API)
 * so the specimen is live, editable text rather than a picture of text.
 */
export class LiveFont {
  private face: FontFace | null = null;
  private n = 0;
  /** The OTF bytes of the installed font, reused for export. */
  buffer: ArrayBuffer | null = null;

  constructor(private readonly target: HTMLElement) {}

  async install(glyphs: GlyphData[], familyName: string): Promise<string> {
    const { fontToArrayBuffer } = await import('../export/otf');
    const buffer = fontToArrayBuffer(glyphs, { familyName });
    const family = `VontsLive${++this.n}`;
    const face = new FontFace(family, buffer.slice(0));
    await face.load();
    document.fonts.add(face);
    if (this.face) document.fonts.delete(this.face);
    this.face = face;
    this.buffer = buffer;
    this.target.style.setProperty('--live-font', `"${family}"`);
    this.target.dataset.liveFont = family;
    return family;
  }

  clear(): void {
    if (this.face) document.fonts.delete(this.face);
    this.face = null;
    this.buffer = null;
    this.target.style.removeProperty('--live-font');
    delete this.target.dataset.liveFont;
  }
}

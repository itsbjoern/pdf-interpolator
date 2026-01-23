// Font registry for cross-font character fallback

import { FontInfo } from './types';

/**
 * Font family grouping fonts by BaseFont
 */
export interface FontFamily {
  baseFont: string; // Normalized base font name
  fonts: Map<string, FontInfo>; // Font reference name → FontInfo
}

/**
 * Registry for managing font families and fallback lookups
 */
export class FontRegistry {
  private families: Map<string, FontFamily> = new Map();

  /**
   * Add a font to the registry, grouping by normalized BaseFont
   */
  addFont(fontInfo: FontInfo): void {
    const normalizedBase = normalizeBaseFont(fontInfo.baseFont);

    let family = this.families.get(normalizedBase);
    if (!family) {
      family = {
        baseFont: normalizedBase,
        fonts: new Map()
      };
      this.families.set(normalizedBase, family);
    }

    family.fonts.set(fontInfo.name, fontInfo);
  }

  /**
   * Find a fallback font in the same family that has the given character
   * Returns null if no suitable font found
   */
  findFallbackFont(char: string, preferredFont: FontInfo): FontInfo | null {
    const normalizedBase = normalizeBaseFont(preferredFont.baseFont);
    const family = this.families.get(normalizedBase);

    if (!family) {
      return null;
    }

    // Search all fonts in the same family
    for (const font of family.fonts.values()) {
      // Skip the preferred font (already tried)
      if (font.name === preferredFont.name) {
        continue;
      }

      // Check if this font has the character
      if (font.reverseMap.has(char)) {
        return font;
      }
    }

    return null;
  }

  /**
   * Get all font families for debugging
   */
  getFamilies(): Map<string, FontFamily> {
    return this.families;
  }
}

/**
 * Normalize BaseFont name by removing subset prefix and style suffix
 * Examples:
 * - "ABCDEF+Helvetica" → "Helvetica"
 * - "Helvetica-Bold" → "Helvetica"
 * - "Times-BoldItalic" → "Times"
 */
export function normalizeBaseFont(baseFont: string): string {
  // Remove subset prefix (6 uppercase letters + plus sign)
  let normalized = baseFont.replace(/^[A-Z]{6}\+/, '');

  // Remove style suffix
  normalized = normalized.replace(/-(Bold|Italic|Oblique|BoldItalic|Regular)$/i, '');

  return normalized;
}

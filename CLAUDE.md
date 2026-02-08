# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PDF Interpolator** is an Electron desktop application that replaces text in PDF files using data from spreadsheets (Excel/CSV). The app allows users to map spreadsheet columns (source → target) and performs text replacement operations on PDF content while preserving the original PDF structure, fonts, and formatting.

**Key Capability**: The core PDF processing engine can handle complex PDFs with mixed fonts, encodings (WinAnsiEncoding, MacRomanEncoding, custom), and implements cross-font character fallback for special characters like € that may exist in different fonts within the same font family.

## Development Commands

```bash
# Development
npm run dev              # Start Electron app in development mode with hot reload
npm run build            # Type check and build for production
npm run typecheck        # Run TypeScript type checking for both main and renderer

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier

# Building Release Versions
npm run build:win        # Build Windows installer (.exe) and publish
npm run build:mac        # Build macOS DMG and publish (requires notarization)
npm run build:linux      # Build Linux packages (AppImage, snap, deb) and publish
npm run build:unpack     # Build unpacked directory (for testing)
```

**Note**: Working directory for all commands is `/Users/bjoern/code/pdf-spreadsheet-rewriter/src/pdf-spreadsheet-rewriter`

## Architecture Overview

### Three-Process Electron Architecture

The application follows Electron's security model with three isolated processes:

1. **Main Process** (`src/main/index.ts`)
   - Electron lifecycle management
   - File system access (spreadsheet/PDF reading)
   - IPC handlers for renderer communication
   - Auto-updater integration (electron-updater)
   - Settings persistence (electron-store)

2. **Renderer Process** (`src/renderer/`)
   - React 19 + TypeScript UI
   - Material-UI (MUI) components
   - Zustand state management with persistence
   - i18next internationalization (en/de)
   - Communicates with main via IPC bridge

3. **Preload Script** (`src/preload/index.ts`)
   - Context bridge between main and renderer
   - Exposes secure API to renderer via `window.electron`
   - All IPC communication flows through here

**Important**: Direct Node.js APIs are NOT available in renderer. All file operations, PDF processing, and system access must go through IPC channels defined in `src/shared/constants.ts`.

### Core PDF Processing Pipeline

The PDF text replacement happens in `src/core/pdf/` with a multi-stage surgical approach:

1. **Load PDF** (`pdf-handler.ts`): Read PDF using pdf-lib, preserve all structure
2. **Parse Content Streams** (`content-stream-parser.ts`): Extract PDF operations with byte-level positions
   - Preserves ALL operations (graphics, paths, images, text)
   - Identifies text blocks (`BT...ET`) separately
3. **Font Extraction** (`font-handler.ts`): Extract font dictionaries and build character mappings
   - Handles WinAnsiEncoding, MacRomanEncoding, and custom encodings
   - Maps font code points to Unicode characters
4. **Font Registry** (`font-registry.ts`): Cross-font character fallback system
   - Groups fonts by family (Arial, Arial-Bold → "Arial" family)
   - Enables finding € in Arial-Bold when current font is Arial
5. **Text Decoding** (`text-decoder.ts`): Convert PDF text operators to readable strings
   - Handles Tj, TJ, ', " operators
   - Processes escape sequences and hex strings
6. **Text Replacement** (`text-replacer.ts`): Perform actual replacements with re-encoding
   - Tries to encode replacement text in current font
   - Falls back to other fonts in same family if character unavailable
   - Preserves original text operators (Tj vs TJ) and spacing
7. **Surgical Patching** (`content-stream-writer.ts`): Rebuild only modified text blocks
   - Preserves graphics operations unchanged
   - Only rewrites modified BT...ET blocks
   - Maintains original byte positions for unchanged blocks

**Critical Design**: The pipeline preserves 100% of non-text PDF operations (graphics, paths, images) and only surgically modifies text blocks where replacements occur. This prevents corruption of complex PDFs.

### State Management

**Zustand Store** (`src/renderer/src/store/useAppStore.ts`):
- Global app state with localStorage persistence
- Stores: spreadsheet path/data, sheet mappings, PDF path/info, output path, processing state
- One mapping per sheet: `sheetName` → `{sourceColumn, targetColumn}`
- Processing state is NOT persisted (progress, isProcessing)

**IPC Communication Flow**:
```
Renderer → window.electron.processPDF() → Preload → IPC → Main Process → Core PDF Logic
Main Process → IPC_CHANNELS.PROCESS_PROGRESS → Preload → onProcessProgress callback → Renderer
```

### Internationalization

- i18next with translations in `src/renderer/src/i18n/locales/`
- Supported: English (en), German (de)
- Settings stored in electron-store
- Translation keys used throughout UI components

## Auto-Update System

The app uses **electron-updater** with **GitHub Releases** as the update server:

- Repository: `itsbjoern/pdf-interpolator`
- Checks for updates 3 seconds after app startup
- User-initiated download (not automatic)
- Update notifications via Material-UI Snackbar component
- macOS builds require notarization (see `scripts/notarize.js`)

**GitHub Secrets Required**:
- `APPLE_ID`: Apple ID email
- `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password
- `APPLE_TEAM_ID`: Apple Developer Team ID

**Release Process**:
```bash
# Update version in package.json, then:
git tag v0.2.0
git push origin main
git push origin v0.2.0
# GitHub Actions automatically builds and publishes release
```

## Project Structure

```
src/
├── main/              # Main Electron process
│   └── index.ts       # App lifecycle, IPC handlers, auto-updater
├── preload/           # Preload script (context bridge)
│   └── index.ts       # Exposes window.electron API
├── renderer/          # React renderer process
│   ├── src/
│   │   ├── components/    # React components (SpreadsheetSelector, PDFSelector, etc.)
│   │   ├── store/         # Zustand state management
│   │   ├── i18n/          # i18next translations
│   │   ├── App.tsx        # Main React component
│   │   └── main.tsx       # React entry point
├── core/              # Core business logic (runs in main process)
│   ├── pdf/           # PDF processing pipeline
│   │   ├── index.ts           # Main entry point (processPDF)
│   │   ├── loader.ts          # PDF loading/saving
│   │   ├── content-stream-parser.ts   # Parse PDF operations
│   │   ├── font-handler.ts    # Extract fonts and encodings
│   │   ├── font-registry.ts   # Cross-font character fallback
│   │   ├── text-decoder.ts    # Decode PDF text
│   │   ├── text-replacer.ts   # Perform replacements
│   │   ├── content-stream-writer.ts  # Rebuild content streams
│   │   └── font-encodings.ts  # Standard encoding tables
│   └── spreadsheet/
│       └── reader.ts      # XLSX/CSV reading (uses xlsx library)
├── shared/            # Shared types and constants
│   ├── types.ts       # TypeScript interfaces
│   └── constants.ts   # IPC channel names, file extensions
├── scripts/           # Build-time scripts
│   └── notarize.js    # macOS notarization script
└── build/             # Build resources
    └── entitlements.mac.plist  # macOS hardened runtime entitlements
```

## TypeScript Configuration

The project uses TypeScript project references with two separate configs:
- `tsconfig.node.json`: Main process and preload (Node.js environment)
- `tsconfig.web.json`: Renderer process (browser environment)

**Path Aliases** (defined in electron.vite.config.ts):
- `@main/*` → `src/main/*`
- `@preload/*` → `src/preload/*`
- `@renderer/*` → `src/renderer/src/*`
- `@core/*` → `src/core/*`
- `@shared/*` → `src/shared/*`

## Common Development Patterns

### Adding a New IPC Channel

1. Define constant in `src/shared/constants.ts`:
   ```typescript
   export const IPC_CHANNELS = {
     NEW_OPERATION: 'new-operation',
     // ...
   }
   ```

2. Add handler in `src/main/index.ts`:
   ```typescript
   ipcMain.handle(IPC_CHANNELS.NEW_OPERATION, async (event, ...args) => {
     // Implementation
   });
   ```

3. Expose in preload bridge `src/preload/index.ts`:
   ```typescript
   contextBridge.exposeInMainWorld('electron', {
     newOperation: (...args) => ipcRenderer.invoke(IPC_CHANNELS.NEW_OPERATION, ...args),
     // ...
   });
   ```

4. Add TypeScript types in preload:
   ```typescript
   declare global {
     interface Window {
       electron: {
         newOperation: (...args) => Promise<Result>;
       };
     }
   }
   ```

### PDF Processing Flow

When modifying PDF processing logic:
- Text extraction happens in `text-decoder.ts` - handles Tj, TJ, ', " operators
- Font character mapping in `font-handler.ts` - handles encodings
- Cross-font fallback in `font-registry.ts` - for missing characters
- Replacements in `text-replacer.ts` - preserves operator types and spacing
- Stream rebuilding in `content-stream-writer.ts` - surgical patching only

**Testing PDFs**: Test with complex PDFs containing:
- Multiple fonts (mixed Arial, Times, etc.)
- Special characters (€, ñ, ü, etc.)
- Mixed encodings (WinAnsi, MacRoman, custom)
- Graphics and images (to ensure they're preserved)

## Build and Distribution

Electron-builder configuration in `electron-builder.yml`:
- **macOS**: DMG with notarization (requires Apple Developer account)
- **Windows**: NSIS installer (.exe)
- **Linux**: AppImage, snap, deb packages
- Output directory: `release/`

**Auto-publish**: All build commands include `--publish always` flag, which automatically uploads to GitHub Releases when `GH_TOKEN` environment variable is set.

## Known Constraints

1. **PDF Limitations**:
   - Cannot replace text that spans multiple text operators without breaking spacing
   - Replacement text must be encodable in available fonts (uses fallback within font family)
   - Preserves original text operator types (Tj vs TJ)

2. **Spreadsheet Mapping**:
   - One mapping per sheet (source column → target column)
   - Empty cells in spreadsheet are skipped
   - Values are trimmed before comparison

3. **Auto-updates**:
   - macOS notarization required for auto-updates to work on macOS 10.14.5+
   - Windows users may see SmartScreen warnings without code signing certificate
   - Linux auto-updates work without signing

4. **Character Encoding**:
   - Font registry fallback only works within the same font family
   - If character doesn't exist in any font of the family, replacement may fail
   - Custom PDF encodings are partially supported (common encodings work)

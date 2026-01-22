# PDF Spreadsheet Replacer - Implementation Plan

## Technology Stack

### Core Technologies
- **Desktop Framework**: Electron (cross-platform Windows/macOS support)
- **Language**: TypeScript (type safety and better developer experience)
- **UI Framework**: React (component-based architecture)
- **UI Library**: Material-UI or Ant Design (pre-built components, dropdowns, file choosers)
- **Build Tool**: Vite (fast development and building)
- **Package Manager**: npm or pnpm

### Key Libraries
- **PDF Manipulation**: pdf-lib (foundation for PDF structure manipulation)
- **Custom PDF Parser**: Built on top of pdf-lib to handle text extraction, encoding, and replacement
- **Spreadsheet Reading**: xlsx (SheetJS) for .xlsx and .csv support
- **State Management**: React Context API or Zustand (lightweight state management)
- **i18n**: i18next + react-i18next (internationalization for English/German)
- **Auto-Update**: electron-updater (GitHub releases integration)
- **Persistence**: electron-store (remember last used files)

## Architecture Overview

### Application Structure
```
pdf-spreadsheet-rewriter/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts         # Main entry point
│   │   ├── updater.ts       # Auto-update logic
│   │   └── fileHandlers.ts  # File system operations
│   ├── renderer/            # Electron renderer process (UI)
│   │   ├── App.tsx         # Main React component
│   │   ├── components/     # React components
│   │   │   ├── SpreadsheetSelector.tsx
│   │   │   ├── ColumnMapping.tsx
│   │   │   ├── PDFSelector.tsx
│   │   │   └── ProcessButton.tsx
│   │   ├── hooks/          # Custom React hooks
│   │   ├── i18n/           # Translation files
│   │   └── store/          # State management
│   ├── core/               # Core business logic
│   │   ├── pdf/
│   │   │   ├── parser.ts       # PDF text extraction
│   │   │   ├── encoder.ts      # PDF encoding handling
│   │   │   ├── replacer.ts     # Text replacement logic
│   │   │   └── writer.ts       # PDF output generation
│   │   └── spreadsheet/
│   │       ├── reader.ts       # Spreadsheet parsing
│   │       └── mapper.ts       # Column mapping logic
│   └── shared/             # Shared types and utilities
│       ├── types.ts
│       └── constants.ts
├── resources/              # App icons, assets
└── dist/                  # Build output
```

## Implementation Phases

### Phase 1: Project Setup and Foundation (Days 1-2)
1. Initialize Electron + Vite + React + TypeScript project
   - Use electron-vite or electron-forge as boilerplate
   - Configure TypeScript strict mode
   - Set up ESLint and Prettier

2. Set up basic Electron architecture
   - Main process window creation
   - IPC (Inter-Process Communication) channels
   - Development and production build configurations

3. Implement i18n infrastructure
   - Configure i18next with English and German translations
   - Detect system language
   - Create translation files structure

4. Set up UI framework and basic layout
   - Install Material-UI or Ant Design
   - Create main application layout with step-by-step flow
   - Implement navigation/state management for wizard-like interface

### Phase 2: Spreadsheet Handling (Days 3-4)
1. Implement spreadsheet file selection
   - Native file dialog for .xlsx and .csv files
   - File validation and error handling

2. Build spreadsheet reader
   - Parse .xlsx files with xlsx library
   - Support multiple sheets (dropdown to select sheet)
   - Extract column headers and data

3. Create column mapping UI
   - Searchable dropdown components for column selection
   - Dynamic mapping rows (add/remove mappings)
   - Validation to ensure both columns are selected per mapping
   - Preview of selected columns data

4. Implement state persistence
   - Save last used spreadsheet path
   - Remember column mappings

### Phase 3: PDF Text Parsing and Encoding (Days 5-8)
This is the most complex part requiring custom implementation.

#### 3.1 PDF Structure Understanding
- Research PDF content stream structure
- Understand text operators: Tj, TJ, ', ", Td, TD, Tm, T*
- Study font encoding types: StandardEncoding, WinAnsiEncoding, MacRomanEncoding, Identity-H (CID fonts), etc.
- Handle font subsetting and ToUnicode CMaps

#### 3.2 Build PDF Parser Module
```typescript
// Core components needed:

1. Content Stream Parser
   - Extract content streams from PDF pages
   - Parse PDF operators and operands
   - Identify text showing operators

2. Font Decoder
   - Load font dictionaries from PDF
   - Read Encoding entries
   - Parse ToUnicode CMaps for CID fonts
   - Handle built-in fonts vs embedded fonts
   - Convert character codes to Unicode

3. Text Extractor
   - Walk through content stream operators
   - Track text state (font, size, position)
   - Decode text strings using font encoding
   - Build searchable text representation with position info

4. Text Replacer
   - Search for target strings in extracted text
   - Calculate replacement text in proper encoding
   - Handle font encoding differences
   - Update content stream with new text
   - Maintain text positioning and formatting

5. PDF Writer
   - Use pdf-lib to load original PDF
   - Replace modified content streams
   - Ensure cross-reference table consistency
   - Save new PDF to output location
```

#### 3.3 Technical Considerations
- **Multi-byte encodings**: Handle CJK and special character encodings
- **Ligatures**: Some fonts combine characters (fi, fl) into single glyphs
- **Font subsetting**: Embedded fonts may only include used characters
- **Text positioning**: Maintain layout after replacement
- **String length changes**: Handle cases where replacement is longer/shorter
- **Encoding limitations**: Warn if replacement text contains characters not in font

### Phase 4: PDF Selection and Processing (Days 9-10)
1. Implement PDF file selection
   - Native file dialog for PDF files
   - PDF validation
   - Preview basic PDF info (pages, size)

2. Build replacement engine
   - Integrate spreadsheet mappings with PDF parser
   - Process all pages in PDF
   - Apply all mapping replacements
   - Track statistics (replacements made per mapping)

3. Create progress feedback
   - Progress bar for PDF processing
   - Status messages for each step
   - Completion summary with statistics

4. Implement output PDF generation
   - Native save dialog for output location
   - Generate new PDF with replacements
   - Verify PDF integrity
   - Success/error messages

### Phase 5: Error Handling and UX Polish (Days 11-12)
1. Comprehensive error handling
   - Graceful handling of corrupted PDFs
   - Clear error messages for unsupported encodings
   - Validation at each step

2. UI/UX improvements
   - Gray out unavailable options until prerequisites met
   - Highlight next available step
   - Add tooltips and help text
   - Keyboard shortcuts
   - Loading states

3. Edge case handling
   - Empty spreadsheets
   - Spreadsheets with no headers
   - PDFs with no text content
   - Very large files (performance optimization)

### Phase 6: Auto-Update Mechanism (Day 13)
1. Integrate electron-updater
   - Configure for GitHub releases
   - Implement update check on app start
   - Show update notification dialog
   - Download and install updates

2. Create release workflow
   - GitHub Actions for automated builds
   - Code signing for Windows and macOS
   - Generate installers (NSIS for Windows, DMG for macOS)

### Phase 7: Testing and Packaging (Days 14-15)
1. Testing
   - Unit tests for core logic (PDF parser, spreadsheet reader)
   - Integration tests for complete workflows
   - Manual testing on Windows and macOS
   - Test with various PDF encodings and spreadsheet formats

2. Build and package
   - Configure electron-builder
   - Generate installers for both platforms
   - Test installation process
   - Create initial GitHub release

## Technical Deep Dive: PDF Text Replacement

### Challenge
PDFs encode text in complex ways that make simple string replacement impossible:
- Text is stored in content streams using PDF operators
- Characters are encoded using font-specific encodings
- Fonts may be embedded and subsetted
- Text positioning is explicit, not flow-based

### Approach
1. **Parse PDF Structure** (using pdf-lib)
   - Load PDF document
   - Access page objects and content streams
   - Preserve PDF structure and references

2. **Extract Content Streams**
   - Get raw content stream data for each page
   - Decompress if needed (FlateDecode, etc.)

3. **Parse Content Stream Operators**
   ```
   Example PDF content stream:
   BT                        % Begin text
   /F1 12 Tf                 % Set font and size
   100 700 Td                % Set text position
   (Hello World) Tj          % Show text
   ET                        % End text
   ```

4. **Decode Text with Font Information**
   - Read font dictionary (/Font resource)
   - Get encoding (/Encoding or /ToUnicode)
   - Convert byte codes to Unicode strings
   - Track position for each text element

5. **Perform Replacements**
   - Search decoded text for target strings
   - Encode replacement text using same font encoding
   - Replace in content stream while maintaining structure
   - Handle encoding errors (character not in font)

6. **Write Modified PDF**
   - Update content streams in PDF structure
   - Use pdf-lib to save modified PDF

### Libraries and Utilities
```typescript
// Key utility functions to implement:

function parseContentStream(stream: Uint8Array): PDFOperation[]
function decodePDFString(bytes: Uint8Array, font: PDFFont): string
function encodePDFString(text: string, font: PDFFont): Uint8Array
function findAndReplace(operations: PDFOperation[], mapping: Mapping): PDFOperation[]
function rebuildContentStream(operations: PDFOperation[]): Uint8Array
```

## Dependencies (package.json preview)
```json
{
  "dependencies": {
    "electron-store": "^8.x",
    "electron-updater": "^6.x",
    "i18next": "^23.x",
    "react-i18next": "^13.x",
    "pdf-lib": "^1.17.x",
    "xlsx": "^0.18.x",
    "react": "^18.x",
    "react-dom": "^18.x",
    "zustand": "^4.x",
    "@mui/material": "^5.x"
  },
  "devDependencies": {
    "electron": "^28.x",
    "electron-builder": "^24.x",
    "vite": "^5.x",
    "typescript": "^5.x",
    "@types/react": "^18.x",
    "eslint": "^8.x",
    "prettier": "^3.x"
  }
}
```

## Development Workflow

1. **Initial Setup**
   - Clone/create repository
   - Run `npm install`
   - Start development: `npm run dev`

2. **Development Process**
   - Hot reload for renderer (React) changes
   - Restart for main process changes
   - Use Chrome DevTools for debugging

3. **Building**
   - `npm run build` - Build application
   - `npm run package` - Create distributable packages

4. **Release**
   - Tag version in git
   - GitHub Actions builds for Windows/macOS
   - Creates GitHub release with installers
   - electron-updater checks for new releases

## Risk Mitigation

### High-Risk Areas
1. **PDF Text Replacement Complexity**
   - Risk: PDF encoding variations may not be fully supported
   - Mitigation: Start with common encodings, add support iteratively based on testing
   - Fallback: Provide clear error messages when encoding is not supported

2. **Cross-Platform Compatibility**
   - Risk: Differences between Windows and macOS behavior
   - Mitigation: Test regularly on both platforms, use Electron's cross-platform APIs

3. **Large File Performance**
   - Risk: PDFs with many pages or large spreadsheets may be slow
   - Mitigation: Implement streaming/chunked processing, show progress feedback

## Success Criteria
- [ ] Application runs on Windows 10/11 and macOS 10.15+
- [ ] Can read .xlsx and .csv files with multiple sheets
- [ ] Can perform text replacements in common PDF encodings (WinAnsi, MacRoman, UTF-16)
- [ ] UI is intuitive for non-technical users
- [ ] Supports English and German languages
- [ ] Auto-update works from GitHub releases
- [ ] Original PDF remains unmodified
- [ ] Clear error messages for all failure cases
- [ ] Performance acceptable for PDFs up to 100 pages and spreadsheets with 10,000 rows

## Timeline Estimate
- **Total**: ~15 working days for initial release
- **Phase 1-2**: 4 days (Foundation + Spreadsheet)
- **Phase 3**: 4 days (PDF handling - most complex)
- **Phase 4-5**: 4 days (Integration + Polish)
- **Phase 6-7**: 3 days (Updates + Packaging)

Note: Timeline assumes full-time development by experienced developer. PDF text replacement may require additional time depending on encoding complexity encountered during implementation.

# PDF Interpolator

A desktop application for replacing text in PDF files using data from spreadsheets designed to be used with static templated PDFs, such as pricing lists or invoices.

![GitHub Release](https://img.shields.io/github/v/release/itsbjoern/pdf-interpolator)

PDF Interpolator reads a spreadsheet (Excel or CSV) and replaces matching text in a PDF document. You define which columns to use: one column contains the text to find, another contains the replacement text. Any matching text will be automatically replaced and all other content will be preserved.

## Features

- Fully offline application to ensure your sensitive data stays private, no data is ever stored or transferred.
- Ensures compatibility with notoriously finnicky PDF readers such as Adobe Acrobat Reader.
- Aims to maintain the original PDF accessibility features, such as bookmarks, annotations and any additional marked content.
- Preserves the original PDF formatting, fonts, and layout while performing the replacements.
- Inbuilt internationalisation when replacing numbers from spreadsheets. Easily exstensible to correctly recognise decimal and thousands separators. Currently supports English and German. 

## Known Limitations
If a replacement cannot be made it will be skipped, the original text will be preserved and a warning will be shown. In those cases ensure the following:

- For embedded fonts all characters in replacement text must be available in the PDF's fonts. To ensure proper replacement each page should already contain all characters in the replacement text. These characters can be invisible, but they must be present.
- Text spanning multiple lines or text segments may not be replaced correctly.


## Screenshots
|||
|-|-|
|![PDF Interpolator Screenshot](./readme/preview.png)|![PDF Interpolator Screenshot](./readme/success.png)|

## [Download](https://github.com/itsbjoern/pdf-interpolator/releases/latest)

Download the latest version for your operating system from the [releases page](https://github.com/itsbjoern/pdf-interpolator/releases/latest).

**Available for:**
- Windows (.exe installer)
- macOS (DMG)
- Linux (AppImage, snap, deb)

## How to Use

### 1. Select a Spreadsheet

Click "Select Spreadsheet" and choose your Excel or CSV file. If your spreadsheet has multiple sheets, select which ones you want to use.

### 2. Set Up Column Mappings

For each sheet, specify two columns:
- **Source Column**: Contains the text to search for in the PDF
- **Target Column**: Contains the replacement text

Example: If your spreadsheet has "Old Name" and "New Name" columns, the app will find each "Old Name" value in the PDF and replace it with the corresponding "New Name" value.

### 3. Select the PDF

Choose the PDF file you want to process.

### 4. Choose Output Location

Select where to save the modified PDF.

### 5. Process

Click "Process PDF" to start. The application will show a detailed results window with:
- Total matches found
- Successful replacements
- Any encoding issues (if characters in your replacement text are not available in the PDF's fonts)


## Building from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Build platform-specific installers
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

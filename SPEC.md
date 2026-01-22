# PDF Spreadsheet Replacer Specification

## Outline
This application is meant to take the data from a spreadsheet and use it as a lookup table to replace strings within a PDF document. For this, the user will select two columns from the spreadsheet: one column will contain the strings to be replaced, and the other column will contain the replacement strings. The user will also select a PDF document in which the replacements will be made. The application will then generate a new PDF document with the specified replacements made.
The application has to be very user friendly as it will be used by non-technical users. The application has to work totally offline without requiring an internet connection.

The rough steps the application will take are as follows:
1. Select a spreadsheet & set up the mappings between spreadsheet columns
2. Select a PDF document
3. Generate a new PDF document with the replacements made

## Requirements
- The application must be compatible with Windows and macOS.
- The application must have an inbuilt mechanism to update itself when a new version is available. The repository will be a public GitHub repository, so the application could check if there is new releases, but another mechanism is fine if easier to implement.
- The application must support common spreadsheet formats such as .xlsx and .csv. This includes the ability to read spreadsheets with multiple sheets.
- The application must allow multiple mappings to be set up at once (i.e., multiple pairs of columns can be selected for replacement).
- The application must support English and German translations for the user interface. This should be automatically detected based on the user's system language settings.
- The application must ensure that the original PDF document remains unaltered; a new PDF document should be created with the replacements.
- Once selected, the application should remember the last used spreadsheet and PDF document paths for convenience.

## Considerations
- PDFs may be encoded by different methods, so the application must be able to handle various PDF encodings.
- The application should provide feedback to the user during the replacement process, such as a progress bar or status messages.
- The application should handle errors gracefully, providing clear messages to the user if something goes wrong
- At every step the application should guide the user with clear instructions on what to do next. Perhaps by gray out options that are not yet available until previous steps are completed or highlighting the next step to take.

## User Interface
- Possible selections for mapping columns should be read from the spreadsheet and be selectable from a searchable dropdown
- When a spreadsheet is first selected, an initial mapping with no selections should be shown, with the ability to add more mappings as needed
- Native file choosers should be used for selecting the spreadsheet, PDF document and to select the output location for the new PDF document

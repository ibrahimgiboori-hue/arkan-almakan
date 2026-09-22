# Excel-owned print families

This branch introduces the migration contract for Arkan printing. It does **not** allow the application to invent headings, column labels, spacing, or document wording.

## Source of truth

Every print family is one Excel workbook. A new model is a new worksheet inside that workbook, and the worksheet name is the model name shown to the application.

Every family workbook contains these governed system sheets:

- `_INDEX`
- `_VARIABLES`
- `_DRESS_CODE`
- `_BASE_A4_PORTRAIT_SAFE`

Any worksheet whose name does not start with `_` is a printable model.

## Variables

`_VARIABLES` is mandatory for every family, regardless of document type. It is the contract between the workbook and application data. A value not declared there is not an approved variable.

The application must not use old database labels to decide what a heading or column is called. The workbook owns visible text.

## Dress code

`_DRESS_CODE` is the workbook's visual language. Cell roles include main title, section title, column header, dynamic field, repeating row, formula cell, static data, letterhead-reserved area, and absolute no-go area.

Merged cells remain one semantic element.

## Safe A4 portrait canvas

The starter template uses a protected A4 portrait canvas. The absolute side no-go zone is exactly **3 columns on each side**:

- left: B:D
- right: AM:AO
- safe content starts at E and ends at AL

Letterhead zones are protected independently from the absolute no-go area.

## Migration order

1. Quotations
2. Treasury vouchers
3. HR
4. Projects & finance
5. Attendance & timesheets
6. Approvals & reports
7. General documents

Each family is migrated and tested on the working branch. Production `main` stays untouched until every family is ready and the full audit/test/build gate passes. Then the migration is merged once.

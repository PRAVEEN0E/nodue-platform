/**
 * Lightweight, zero-dependency CSV parser for bulk import routes.
 * Handles: quoted fields, comma/newline within quotes, leading/trailing whitespace.
 * Does NOT handle multi-line quoted fields (institutional data never needs them).
 */

/**
 * Parse a CSV string into a 2D array of strings.
 * - Skips blank rows and rows that start with '#' (comments).
 * - Trims whitespace from unquoted fields.
 * - Strips surrounding double-quotes from quoted fields.
 */
export function parseCsv(text: string): string[][] {
  const result: string[][] = [];
  // Normalize line endings
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const row: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const next = line[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          // Escaped double-quote inside a quoted field
          current += '"';
          i++;
        } else if (ch === '"') {
          // End of quoted field
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }

    row.push(current.trim());
    result.push(row);
  }

  return result;
}

/**
 * Convert an array of header+data rows to typed objects.
 * First row is treated as column headers (lowercase, trimmed).
 */
export function csvToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((h) => h.toLowerCase().trim().replace(/\s+/g, "_"));

  return dataRows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i]?.trim() ?? "";
    });
    return obj;
  });
}

/**
 * Serialize a row array and column headers into a CSV string.
 * Automatically quotes fields that contain commas, quotes, or newlines.
 */
export function toCsvString(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const escape = (v: string | number | boolean | null | undefined): string => {
    let s = v == null ? "" : String(v);
    // Prevent CSV Formula Injection (CWE-1236)
    if (/^[=+\-@\t\r]/.test(s)) {
      s = `'${s}`;
    }
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines: string[] = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n");
}

// ─── Sample CSV Templates ────────────────────────────────────────────────────

export const STUDENT_CSV_TEMPLATE = `# NDCP Student Bulk Import Template
# Lines starting with '#' are ignored.
# Required: firstName, lastName, email, password, registerNumber, admissionYear, classroomId
# Optional: rollNumber
firstName,lastName,email,password,registerNumber,rollNumber,admissionYear,classroomId
John,Doe,john.doe@college.edu,SecurePass1,RA2011003010001,101,2020,<classroom-uuid>
Jane,Smith,jane.smith@college.edu,SecurePass1,RA2011003010002,,2021,<classroom-uuid>
`;

export const STAFF_CSV_TEMPLATE = `# NDCP Staff Bulk Import Template
# Lines starting with '#' are ignored.
# Required: firstName, lastName, email, password, employeeCode, designation, departmentId
firstName,lastName,email,password,employeeCode,designation,departmentId
Alice,Kumar,alice.kumar@college.edu,SecurePass1,EMP001,Associate Professor,<department-uuid>
Bob,Raj,bob.raj@college.edu,SecurePass1,EMP002,Assistant Professor,<department-uuid>
`;

export const SUBJECT_CSV_TEMPLATE = `# NDCP Subject Bulk Import Template (Advisor scope)
# Lines starting with '#' are ignored.
# Required: code, name, semester
# Optional: credits (default 3)
code,name,credits,semester
CS3001,Data Structures,4,3
CS3002,Operating Systems,3,3
CS4001,Machine Learning,3,4
`;

export const ADVISOR_STUDENT_CSV_TEMPLATE = `# NDCP Advisor Student Bulk Import Template (Classroom scope)
# Lines starting with '#' are ignored.
# Required: firstName, lastName, email, password, registerNumber, admissionYear
# Optional: rollNumber
firstName,lastName,email,password,registerNumber,rollNumber,admissionYear
John,Doe,john.doe@college.edu,SecurePass1,RA2011003010001,101,2020
Jane,Smith,jane.smith@college.edu,SecurePass1,RA2011003010002,,2021
`;

import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.join(rootDir, "data", "generated", "candidate-evaluation.json");
const outputDir = path.join(rootDir, "outputs");
const outputPath = path.join(outputDir, "650分以上学校专业交流表.xlsx");
const excelOutputPath = path.join(outputDir, "650分以上学校专业交流表.xls");
const htmlOutputPath = path.join(outputDir, "650分以上学校专业交流打印表.html");
const csvOutputPath = path.join(outputDir, "650分以上学校专业交流表.csv");

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let number = index + 1;
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function cellRef(rowIndex, columnIndex) {
  return `${columnName(columnIndex)}${rowIndex}`;
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function cell(rowIndex, columnIndex, value, style = 0) {
  const ref = cellRef(rowIndex, columnIndex);
  const numeric = numberValue(value);
  if (numeric !== null && value !== "") {
    return `<c r="${ref}" s="${style}" t="n"><v>${numeric}</v></c>`;
  }
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function row(rowIndex, values, styleForColumn = () => 0, height = null) {
  const heightAttrs = height ? ` ht="${height}" customHeight="1"` : "";
  return `<row r="${rowIndex}"${heightAttrs}>${values.map((value, index) => cell(rowIndex, index, value, styleForColumn(index))).join("")}</row>`;
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function scoreText(value) {
  return value === null || value === undefined || value === "" ? "缺失" : value;
}

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const rows = (source.rows || source.candidates || source.items || [])
  .filter((item) => Number(item.minScore ?? item.score) >= 650)
  .sort((a, b) => {
    const focusA = a.focusRank ?? 999;
    const focusB = b.focusRank ?? 999;
    return focusA - focusB
      || Number(b.minScore ?? b.score ?? 0) - Number(a.minScore ?? a.score ?? 0)
      || Number(b.expertScore ?? 0) - Number(a.expertScore ?? 0);
  })
  .map((item) => [
    cleanText(item.school),
    cleanText(item.majorName || item.major),
    scoreText(item.minScore ?? item.score),
    scoreText(item.avgScore),
    scoreText(item.maxScore),
    scoreText(item.minRank ?? item.rank),
    scoreText(item.plan ?? item.plan2026Count),
    cleanText(item.recommendation || item.suggestion),
    scoreText(item.expertScore),
    cleanText(item.matchedTrack || item.track),
    cleanText((item.riskTags || []).join("；")),
    ""
  ]);

const headers = ["学校", "专业/专业类", "最低分", "平均分", "最高分", "位次", "2026计划", "建议", "专家分", "匹配方向", "风险提示", "交流记录"];
const allRows = [headers, ...rows];
const lastRow = allRows.length;
const lastCol = columnName(headers.length - 1);

const colWidths = [18, 34, 9, 9, 9, 11, 11, 12, 9, 22, 22, 30];
const sheetRows = allRows.map((values, index) => {
  const rowIndex = index + 1;
  if (rowIndex === 1) return row(rowIndex, values, () => 1, 26);
  return row(rowIndex, values, (columnIndex) => {
    if ([2, 3, 4, 5, 6, 8].includes(columnIndex)) return 2;
    if ([1, 9, 10, 11].includes(columnIndex)) return 3;
    return 0;
  }, 36);
}).join("");

const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colWidths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:${lastCol}${lastRow}"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="10"/><name val="Microsoft YaHei"/></font><font><b/><sz val="10"/><name val="Microsoft YaHei"/><color rgb="FFFFFFFF"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245B5B"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD0D5DD"/></left><right style="thin"><color rgb="FFD0D5DD"/></right><top style="thin"><color rgb="FFD0D5DD"/></top><bottom style="thin"><color rgb="FFD0D5DD"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="650分以上候选" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const now = new Date().toISOString();
const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>650分以上学校专业交流表</dc:title>
  <dc:creator>GKZY</dc:creator>
  <cp:lastModifiedBy>GKZY</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>GKZY</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>650分以上候选</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimeDate(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function uint16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { dosTime, dosDate } = dosTimeDate();
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.content, "utf8");
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      name
    ]);
    localParts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(data.length),
      uint32(data.length),
      uint16(name.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      name
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const centralOffset = offset;
  const end = Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.length),
    uint32(centralOffset),
    uint16(0)
  ]);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

await mkdir(outputDir, { recursive: true });
if (existsSync(outputPath)) await rm(outputPath, { force: true });
if (existsSync(excelOutputPath)) await rm(excelOutputPath, { force: true });
if (existsSync(htmlOutputPath)) await rm(htmlOutputPath, { force: true });
if (existsSync(csvOutputPath)) await rm(csvOutputPath, { force: true });

function htmlCell(value, tag = "td") {
  return `<${tag}>${escapeXml(value)}</${tag}>`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

const htmlRows = allRows.map((values, index) => {
  const tag = index === 0 ? "th" : "td";
  return `<tr>${values.map((value) => htmlCell(value, tag)).join("")}</tr>`;
}).join("\n");

const excelHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; font-size: 10pt; }
    h1 { margin: 0 0 10px; font-size: 18px; }
    .note { margin: 0 0 10px; color: #475467; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d0d5dd; padding: 6px 7px; vertical-align: top; mso-number-format:"\\@"; }
    th { background: #245b5b; color: #fff; font-weight: 700; text-align: center; }
    td:nth-child(3), td:nth-child(4), td:nth-child(5), td:nth-child(6), td:nth-child(7), td:nth-child(9) { text-align: center; white-space: nowrap; }
    td:nth-child(12) { min-width: 220px; height: 42px; }
  </style>
</head>
<body>
  <h1>650分以上学校专业交流表</h1>
  <p class="note">按当前主候选池筛选，保留交流打印需要字段；最后一列用于现场记录。</p>
  <table>
    ${htmlRows}
  </table>
</body>
</html>`;

const csv = `\uFEFF${allRows.map((values) => values.map(csvCell).join(",")).join("\r\n")}`;

await writeFile(htmlOutputPath, excelHtml, "utf8");
await writeFile(csvOutputPath, csv, "utf8");

console.log(`Wrote ${path.relative(rootDir, htmlOutputPath)} (${rows.length} rows)`);
console.log(`Wrote ${path.relative(rootDir, csvOutputPath)} (${rows.length} rows)`);

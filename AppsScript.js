function doGet() {
  try {
    var wb = SpreadsheetApp.getActiveSpreadsheet();
    var sheets = wb.getSheets();
    var responseData = {
      sheets: {},
      generalInfo: { date: "Tuesday, June 30th 2026" } // Fallback default
    };
    
    sheets.forEach(function(sheet) {
      var sheetName = sheet.getName();
      if (sheetName === "General Info") {
        responseData.generalInfo = parseGeneralInfo(sheet);
      } else {
        responseData.sheets[sheetName] = parseSheetStructure(sheet);
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var wb = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var sheet = wb.getSheetByName(data.tab);
    
    if (!sheet) {
      return makeJSONResponse({ status: "error", message: "Tab not found: " + data.tab });
    }
    
    var slotName = data.slot;
    var type = data.type; // "main", "wait", or "helpers"
    var entries = data.entries; // Array of strings (names)
    
    if (!slotName || !type || !entries || entries.length === 0) {
      return makeJSONResponse({ status: "error", message: "Missing required signup details." });
    }
    
    var structure = parseSheetStructure(sheet);
    var slotInfo = structure.slots.find(function(s) { return s.time === slotName; });
    
    if (!slotInfo) {
      return makeJSONResponse({ status: "error", message: "Time slot not found: " + slotName });
    }
    
    // Determine row range to search for empty slots
    var startRow, endRow;
    if (type === "main") {
      startRow = slotInfo.mainStartRow;
      endRow = slotInfo.mainEndRow;
    } else if (type === "wait") {
      startRow = slotInfo.waitStartRow;
      endRow = slotInfo.waitEndRow;
    } else if (type === "helpers") {
      startRow = slotInfo.helpersStartRow;
      endRow = slotInfo.helpersEndRow;
    }
    
    if (!startRow || !endRow) {
      return makeJSONResponse({ status: "error", message: "Section " + type + " not available for slot " + slotName });
    }
    
    var colIndex = slotInfo.colIndex;
    var colValues = sheet.getRange(1, colIndex, sheet.getMaxRows(), 1).getValues();
    
    // Find empty rows in the selected section
    var emptyRowIndices = [];
    for (var r = startRow; r <= endRow; r++) {
      var val = colValues[r - 1][0]; // 0-based array index corresponds to r-1
      if (!val || val.toString().trim() === "") {
        emptyRowIndices.push(r);
      }
    }
    
    if (emptyRowIndices.length < entries.length) {
      return makeJSONResponse({ status: "error", message: "Not enough slots available in " + type + "." });
    }
    
    // Write names to sheet
    for (var i = 0; i < entries.length; i++) {
      var rowToWrite = emptyRowIndices[i];
      sheet.getRange(rowToWrite, colIndex).setValue(entries[i]);
    }
    
    return makeJSONResponse({ status: "success", message: "Successfully signed up!" });
    
  } catch (err) {
    return makeJSONResponse({ status: "error", message: err.toString() });
  }
}

function makeJSONResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Parses general info tab to find the event date
function parseGeneralInfo(sheet) {
  var values = sheet.getDataRange().getDisplayValues();
  var dateStr = "Tuesday, June 30th 2026"; // Fallback
  for (var r = 0; r < values.length; r++) {
    var colA = values[r][0] ? values[r][0].toString().trim() : "";
    if (colA.toLowerCase().indexOf("temple day") !== -1) {
      var colB = values[r][1] ? values[r][1].toString().trim() : "";
      if (colB) {
        dateStr = colB;
        break;
      }
    }
  }
  return { date: dateStr };
}

// Dynamically detects Wait Lists and Helper rows for a sheet
function parseSheetStructure(sheet) {
  var sheetName = sheet.getName();
  var lastRow = sheet.getMaxRows();
  var lastCol = sheet.getLastColumn();
  
  // Determine header configuration dynamically
  var headerRow = 2;
  var dataStartRow = 3;
  if (sheetName === "Baptistry") {
    headerRow = 3;
    dataStartRow = 4;
  } else if (sheetName === "Primary Drop Off") {
    headerRow = 2;
    dataStartRow = 4; // Skip the "Name and Age of child" subheader
  }
  
  var headers = sheet.getRange(headerRow, 1, 1, lastCol).getValues()[0];
  
  // Row 2 may contain column-group labels (like "Adult/YSA Only (18+)")
  var row2Values = [];
  if (headerRow === 3) {
    // Read row 2 cell values, resolving merged cells if any
    var row2Range = sheet.getRange(2, 1, 1, lastCol);
    for (var c = 1; c <= lastCol; c++) {
      var cell = row2Range.getCell(1, c);
      var val = "";
      if (cell.isPartOfMerge()) {
        val = cell.getMergedRanges()[0].getCell(1, 1).getValue().toString().trim();
      } else {
        val = cell.getValue().toString().trim();
      }
      row2Values.push(val);
    }
  }
  
  var slots = [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  
  for (var c = 0; c < lastCol; c++) {
    var timeSlot = headers[c] ? headers[c].toString().trim() : "";
    if (timeSlot === "") continue;
    
    var colValues = [];
    for (var r = 0; r < lastRow; r++) {
      colValues.push(values[r][c] ? values[r][c].toString().trim() : "");
    }
    
    var mainStartRow = dataStartRow;
    var mainEndRow = lastRow;
    
    var waitStartRow = null;
    var waitEndRow = null;
    
    var helpersStartRow = null;
    var helpersEndRow = null;
    
    // Scan down the column starting from dataStartRow to find separator rows
    for (var r_idx = dataStartRow - 1; r_idx < lastRow; r_idx++) {
      var val = colValues[r_idx];
      
      // Check for Wait List header
      if (val.toLowerCase().includes("wait list") || val.toLowerCase().includes("waiting list")) {
        mainEndRow = r_idx; // Previous row was the last main slot
        waitStartRow = r_idx + 2; // Row after header
        waitEndRow = lastRow;
      }
      
      // Check for Helpers header (Baptistry specific)
      if (val.toLowerCase().includes("priesthood helpers")) {
        if (waitStartRow !== null) {
          waitEndRow = r_idx; // Previous row was last wait list slot
        } else {
          mainEndRow = r_idx;
        }
        helpersStartRow = r_idx + 2;
        helpersEndRow = lastRow;
      }
    }
    
    // Parse individual entries
    var mainEntries = [];
    var waitEntries = [];
    var helperEntries = [];
    
    for (var r = mainStartRow; r <= mainEndRow; r++) {
      var val = colValues[r - 1];
      if (val !== "") mainEntries.push(val);
    }
    
    if (waitStartRow !== null && waitEndRow !== null) {
      for (var r = waitStartRow; r <= waitEndRow; r++) {
        var val = colValues[r - 1];
        if (val !== "") waitEntries.push(val);
      }
    }
    
    if (helpersStartRow !== null && helpersEndRow !== null) {
      for (var r = helpersStartRow; r <= helpersEndRow; r++) {
        var val = colValues[r - 1];
        if (val !== "") helperEntries.push(val);
      }
    }
    
    slots.push({
      time: timeSlot,
      colIndex: c + 1,
      mainCapacity: (mainEndRow - mainStartRow + 1),
      mainSignedUp: mainEntries,
      
      waitCapacity: waitStartRow ? (waitEndRow - waitStartRow + 1) : 0,
      waitSignedUp: waitEntries,
      
      helpersCapacity: helpersStartRow ? (helpersEndRow - helpersStartRow + 1) : 0,
      helpersSignedUp: helperEntries,
      
      // Dynamic column group info label from Row 2
      customNotice: row2Values[c] || "",
      
      // Row boundaries
      mainStartRow: mainStartRow,
      mainEndRow: mainEndRow,
      waitStartRow: waitStartRow,
      waitEndRow: waitEndRow,
      helpersStartRow: helpersStartRow,
      helpersEndRow: helpersEndRow
    });
  }
  
  return {
    sheetName: sheetName,
    slots: slots
  };
}

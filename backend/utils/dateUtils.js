/**
 * Normalizes a date string to ISO format (YYYY-MM-DD) for Xero API compatibility.
 * Supports common date formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * Also handles two-digit years (e.g., 20/11/25 -> 2025-11-20).
 * 
 * @param {string} dateStr - The date string to normalize.
 * @returns {string} - The normalized date in YYYY-MM-DD format, or the original string if parsing fails.
 */
function formatDateForXero(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    return dateStr;
  }

  const trimmedDate = dateStr.trim();
  
  // Check if already in ISO format (YYYY-MM-DD)
  const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = trimmedDate.match(isoPattern);
  if (isoMatch) {
    return trimmedDate; // Already in correct format
  }

  // Try to parse DD/MM/YYYY, DD-MM-YYYY, or DD.MM.YYYY formats
  const ddmmyyyyPattern = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;
  const ddmmyyyyMatch = trimmedDate.match(ddmmyyyyPattern);
  
  if (ddmmyyyyMatch) {
    let day = ddmmyyyyMatch[1].padStart(2, '0');
    let month = ddmmyyyyMatch[2].padStart(2, '0');
    let year = ddmmyyyyMatch[3];
    
    // Handle two-digit years (assume 2000s for years 00-99)
    if (year.length === 2) {
      const yearNum = parseInt(year, 10);
      // Assume years 00-99 are 2000-2099
      year = (2000 + yearNum).toString();
    }
    
    const normalizedDate = `${year}-${month}-${day}`;
    console.info(`[dateUtils] Normalized date: "${dateStr}" -> "${normalizedDate}"`);
    return normalizedDate;
  }

  // Fallback: try to parse using Date constructor and extract components
  // This is a last resort and may have timezone issues, so we avoid using toISOString
  try {
    const parsed = new Date(trimmedDate);
    if (!isNaN(parsed.getTime())) {
      // Use toISOString and slice to get YYYY-MM-DD (UTC date)
      const normalizedDate = parsed.toISOString().slice(0, 10);
      console.info(`[dateUtils] Normalized date (fallback): "${dateStr}" -> "${normalizedDate}"`);
      return normalizedDate;
    }
  } catch {
    // Parsing failed
  }

  // If all parsing attempts fail, log a warning and return original
  console.warn(`[dateUtils] Could not normalize date: "${dateStr}". Proceeding with original value.`);
  return dateStr;
}

module.exports = { formatDateForXero };

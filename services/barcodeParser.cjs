class BarcodeParser {
  /**
   * Parses a specific field from a barcode string based on fields configuration
   * @param {string} barcode - The barcode string to parse
   * @param {Array} fields - Array of field configurations
   * @param {string} targetFieldName - The field name to extract
   * @returns {string|null} The extracted field value or null if not found
   */
  static parseField(barcode, fields, targetFieldName) {
    try {
      // Filter checked fields and sort by order
      const orderedFields = fields
        .filter(field => field.isChecked)
        .sort((a, b) => a.order - b.order);

      // Find target field and its position
      const targetFieldIndex = orderedFields.findIndex(
        field => field.fieldName === targetFieldName
      );

      if (targetFieldIndex === -1) return null;

      // Calculate starting position in barcode string
      let startPosition = 0;
      for (let i = 0; i < targetFieldIndex; i++) {
        startPosition += orderedFields[i].value.length;
      }

      // Get the length of the target field value
      const fieldLength = orderedFields[targetFieldIndex].value.length;

      // Extract and return the field value
      return barcode.substring(startPosition, startPosition + fieldLength);
    } catch (error) {
      console.error(`Error parsing field ${targetFieldName}:`, error);
      return null;
    }
  }

  /**
   * Parses multiple fields from a barcode string
   * @param {string} barcode - The barcode string to parse
   * @param {Array} fields - Array of field configurations
   * @param {Array} targetFields - Array of field names to extract
   * @returns {Object} Object containing the parsed fields
   */
  static parseFields(barcode, fields, targetFields) {
    const result = {};
    
    targetFields.forEach(fieldName => {
      result[fieldName] = this.parseField(barcode, fields, fieldName);
    });

    return result;
  }

  /**
   * Parses all fields from a barcode string
   * @param {string} barcode - The barcode string to parse
   * @param {Array} fields - Array of field configurations
   * @returns {Object} Object containing all parsed fields
   */
  static parseAllFields(barcode, fields) {
    const checkedFields = fields
      .filter(field => field.isChecked)
      .map(field => field.fieldName);
    
    return this.parseFields(barcode, fields, checkedFields);
  }
}

// export default BarcodeParser; 
module.exports = BarcodeParser;
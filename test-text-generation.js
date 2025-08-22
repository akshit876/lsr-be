/**
 * Test script for text file generation
 * Demonstrates the new text file format
 */

import { TextFileGenerator } from "./utils/generateTextFile.js";

async function testTextGeneration() {
  console.log("🧪 Testing Text File Generation");
  console.log("================================\n");

  try {
    const generator = new TextFileGenerator();

    // Get current values
    console.log("📊 Current Values:");
    const values = generator.getCurrentValues();
    console.log(`   Julian Date: ${values.julianDate}`);
    console.log(`   Year Code: ${values.yearCode}`);
    console.log(`   Company Code: ${values.companyCode}`);
    console.log(`   DMC Code: ${values.dmcCode}`);

    console.log("\n📝 Generated Content:");
    const content = generator.generateContent();
    console.log(content);

    console.log("\n💾 Writing to file...");
    const success = generator.generateAndWrite();

    if (success) {
      console.log("\n✅ Test completed successfully!");
    } else {
      console.log("\n❌ Test failed!");
    }
  } catch (error) {
    console.error("❌ Error during test:", error);
  }
}

// Run the test
testTextGeneration();

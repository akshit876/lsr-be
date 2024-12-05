const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputImagePath = 'D:\\cameraimage\\R08211210M02L20021224A0001==1.jpg'; // Base image path
const outputDir = 'D:\\cameraimage\\fake_dataset'; // Directory to save generated images
const totalImages = 1000000; // Number of images to generate

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Generate a unique file name similar to the base path
function generateFileName(index) {
    // Simulate variations by incrementing or modifying numeric values
    const prefix = 'R08211210M02L'; // Fixed part of the base path
    const uniqueId = (20021224 + index).toString().padStart(8, '0'); // Generate unique 8-digit ID
    const suffix = `A${(10001 + index).toString().padStart(5, '0')}==${index % 10}.jpg`; // Suffix variation
    return `${prefix}${uniqueId}${suffix}`;
}

async function generateImage(index) {
    const fileName = generateFileName(index);
    const outputFilePath = path.join(outputDir, fileName);

    // Apply random transformations
    await sharp(inputImagePath)
        .rotate(Math.random() * 360) // Random rotation
        .resize({
            width: 1024,
            height: 768,
            fit: sharp.fit.cover,
            position: sharp.strategy.entropy,
        }) // Resize to original size
        .modulate({
            brightness: Math.random() * 0.5 + 0.75, // Random brightness
            saturation: Math.random() * 0.5 + 0.75, // Random saturation
        })
        .toFile(outputFilePath);
}

async function generateDataset() {
    console.log(`Starting dataset generation in: ${outputDir}`);

    for (let i = 1; i <= totalImages; i++) {
        try {
            await generateImage(i);
            if (i % 1000 === 0) {
                console.log(`Generated ${i} images...`);
            }
        } catch (error) {
            console.error(`Error generating image ${i}:`, error);
        }
    }

    console.log('Dataset generation complete!');
}

// Start the generation process
generateDataset().catch(console.error);

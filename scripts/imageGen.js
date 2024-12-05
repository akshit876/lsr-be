const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const inputImagePath = 'D:/cameraimage/base.jpg'; // Replace with your base image path
const outputDir = 'D:/cameraimage/fake_dataset'; // Directory to save generated images
const totalImages = 1000000; // Number of images to generate

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function generateImage(index) {
    const outputFilePath = path.join(outputDir, `image_${index}.jpg`);

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

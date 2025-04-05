const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const { createCanvas } = require('canvas');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = 3000;

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(fileUpload({
    useTempFiles: false, // Don't use temp files to keep everything in memory
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
}));

app.post('/convert', async (req, res) => {
    try {
        // Check if files were uploaded
        if (!req.files || !req.files.media) {
            return res.status(400).send('No files were uploaded.');
        }

        const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
        const results = [];

        // Process each file
        for (const file of files) {
            // Validate file type
            if (!file.mimetype.includes('pdf')) {
                results.push({
                    filename: file.name,
                    error: 'Not a PDF file'
                });
                continue;
            }

            try {
                // Get file data as buffer
                const pdfBuffer = file.data;

                // Process the PDF using pdf.js
                const pdfjsLib = require('pdfjs-dist');

                // Load the PDF document
                const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
                const pdfDocument = await loadingTask.promise;
                const pageCount = pdfDocument.numPages;

                const fileImages = [];

                // Process each page
                for (let i = 1; i <= pageCount; i++) {
                    const page = await pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality

                    // Create a canvas to render the PDF page
                    const canvas = createCanvas(viewport.width, viewport.height);
                    const context = canvas.getContext('2d');

                    // Render the page to the canvas
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };

                    await page.render(renderContext).promise;

                    // Convert canvas to PNG buffer
                    const pngBuffer = canvas.toBuffer('image/png');

                    // Save the PNG to the output directory
                    const imageName = `${path.parse(file.name).name}_page${i}_${uuidv4()}.png`;
                    const outputPath = path.join(outputDir, imageName);
                    await fs.promises.writeFile(outputPath, pngBuffer);

                    fileImages.push({
                        page: i,
                        imagePath: outputPath
                    });
                }

                results.push({
                    filename: file.name,
                    pages: pageCount,
                    images: fileImages,
                    success: true
                });

            } catch (error) {
                console.error(`Error processing ${file.name}:`, error);
                results.push({
                    filename: file.name,
                    error: error.message,
                    success: false
                });
            }
        }

        res.json({
            message: 'Files processed',
            results
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).send('Server error: ' + error.message);
    }
});

app.listen(port, () => {
    console.log(`PDF to Image server running on port ${port}`);
});
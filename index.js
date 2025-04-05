import express from 'express';
import fileUpload from 'express-fileupload';
// import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import * as pdfjsLib from 'pdfjs-dist';
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const app = express();

// Middleware to handle file uploads
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    useTempFiles: false // Process in memory
}));

// Ensure output directory exists
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Route to handle PDF to image conversion
app.post('/convert', async (req, res) => {
    try {
        // Check if files were uploaded
        if (!req.files || !req.files.media) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        // Handle both single file and multiple files
        const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
        const results = [];

        // Process each PDF file
        for (const file of files) {
            // Validate file type
            if (file.mimetype !== 'application/pdf') {
                results.push({
                    filename: file.name,
                    status: 'error',
                    message: 'File must be a PDF'
                });
                continue;
            }

            try {
                // Convert buffer to Uint8Array for pdfjs
                const data = new Uint8Array(file.data);

                // Load PDF document in memory
                const pdf = await pdfjsLib.getDocument({ data }).promise;
                const numPages = pdf.numPages;
                const pageResults = [];

                // Process each page
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdf.getPage(i);

                    // Get viewport at 100% scale
                    const viewport = page.getViewport({ scale: 1.0 });

                    // Create canvas in memory
                    const canvas = createCanvas(viewport.width, viewport.height);
                    const context = canvas.getContext('2d');

                    // Render PDF page to canvas
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;

                    // Convert canvas to buffer
                    const imageBuffer = canvas.toBuffer('image/png');

                    // Generate output filename
                    const outputFilename = `${path.parse(file.name).name}_page${i}.png`;
                    const outputPath = path.join(outputDir, outputFilename);

                    // Write image buffer to disk
                    fs.writeFileSync(outputPath, imageBuffer);

                    pageResults.push({
                        page: i,
                        outputPath: outputPath,
                        filename: outputFilename
                    });
                }

                results.push({
                    filename: file.name,
                    status: 'success',
                    pages: pageResults
                });

            } catch (error) {
                results.push({
                    filename: file.name,
                    status: 'error',
                    message: error.message
                });
            }
        }

        res.json({
            status: 'completed',
            results: results
        });

    } catch (error) {
        res.status(500).json({
            error: 'Server error',
            message: error.message
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
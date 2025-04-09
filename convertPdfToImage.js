const fs = require('fs');
const path = require('path');
const { createCanvas, DOMMatrix } = require('canvas');
const pdfjsLib = require('pdfjs-dist');

// Add polyfills for browser APIs that PDF.js requires
global.DOMMatrix = DOMMatrix;
global.Path2D = require('canvas').Path2D;
global.ImageData = require('canvas').ImageData;

// Process the incoming message from the parent (main process)
process.on('message', async (message) => {
    if (message.type === 'complete') {
        process.exit(0);
    }
    const { files } = message;
    try {
        for (const fileData of files) {
            let pdfData;
            
            // Check if we have a temp file path (from express-fileupload)
            if (fileData.tempFilePath) {
                // Read from the temp file
                pdfData = fs.readFileSync(fileData.tempFilePath);
            } 
            // Check if we have binary data
            else if (fileData.data) {
                // For data passed directly from benchmark tests
                pdfData = fileData.data.data || fileData.data;
            }
            // Handle case where we have a path
            else if (fileData.path) {
                pdfData = fs.readFileSync(fileData.path);
            }
            else {
                throw new Error('Invalid file format: no data or file path provided');
            }
            
            // Load the PDF
            const loadingTask = pdfjsLib.getDocument({ data: pdfData });
            const pdfDoc = await loadingTask.promise;
            
            // Only process the first page
            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = createCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');

            await page.render({ canvasContext: context, viewport }).promise;

            // Create filename using the original file name if available
            const originalName = fileData.name ? path.parse(fileData.name).name : 'converted';
            const fileName = `${originalName}.png`;

            const buffer = canvas.toBuffer('image/png');
            
            // Send the image buffer back to the main process
            process.send({ type: 'imageBuffer', buffer, fileName });
        }
        process.send({ type: 'done' });

    } catch (err) {
        console.error(err);
        process.send({ type: 'error', error: err.message || 'Failed to convert PDFs.' });
        process.exit(1); // Exit with error code
    }
});

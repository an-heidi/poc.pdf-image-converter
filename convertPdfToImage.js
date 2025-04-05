const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const pdfjsLib = require('pdfjs-dist');

// Process the incoming message from the parent (main process)
process.on('message', async (message) => {
    if (message.type === 'complete') {
        process.exit(0);
    }
    const { files } = message;
    try {
        for (const fileData of files) {
            // Ensure that the file data is a Buffer
            const loadingTask = pdfjsLib.getDocument({ data: fileData.data.data });
            const pdfDoc = await loadingTask.promise;
            const numPages = pdfDoc.numPages;

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);

                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = createCanvas(viewport.width, viewport.height);
                const context = canvas.getContext('2d');

                await page.render({ canvasContext: context, viewport }).promise;

                const buffer = canvas.toBuffer('image/png');
                const fileName = `converted_page${pageNum}.png`;

                // Send the image buffer back to the main process
                process.send({ type: 'imageBuffer', buffer, fileName });
            }
        }
        process.send({ type: 'done' });

        // Inform the main process that the conversion is done
    } catch (err) {
        console.error(err);
        process.send({ type: 'error', error: 'Failed to convert PDFs.' });
        process.exit(1); // Exit with error code
    }
});

const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const pdfjsLib = require('pdfjs-dist');

const app = express();
const PORT = 3000;

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

app.use(fileUpload());

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.media) {
        return res.status(400).send('No files uploaded.');
    }

    const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
    const resultImages = [];

    try {
        for (const file of files) {
            const loadingTask = pdfjsLib.getDocument({ data: file.data });
            const pdfDoc = await loadingTask.promise;
            const numPages = pdfDoc.numPages;

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const page = await pdfDoc.getPage(pageNum);

                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = createCanvas(viewport.width, viewport.height);
                const context = canvas.getContext('2d');

                await page.render({ canvasContext: context, viewport }).promise;

                const buffer = canvas.toBuffer('image/png');
                const fileName = `${path.parse(file.name).name}-page${pageNum}.png`;
                const outputPath = path.join(outputDir, fileName);
                fs.writeFileSync(outputPath, buffer);
                resultImages.push(outputPath);
            }
        }

        res.json({ message: 'PDFs converted using pdf.js', images: resultImages });
    } catch (err) {
        console.error(err);
        res.status(500).send('Failed to convert PDFs.');
    }
});

app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to the PDF to Image Converter API',
        endpoints: {
            upload: '/upload (POST)',
        },
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

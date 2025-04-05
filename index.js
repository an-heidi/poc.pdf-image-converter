const express = require('express');
const fileUpload = require('express-fileupload');
const { pdfToPng } = require('pdf-to-png-converter');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(fileUpload());
app.use(express.json());

// Ensure output folder exists
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

app.post('/upload', async (req, res) => {
    if (!req.files || !req.files.media) {
        return res.status(400).send('No files were uploaded.');
    }

    const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
    const results = [];

    try {
        for (const file of files) {
            if (file.mimetype !== 'application/pdf') {
                return res.status(400).send(`Unsupported file type: ${file.name}`);
            }

            // Convert PDF buffer to PNGs
            const pngPages = await fromBuffer(file.data, {
                outputFileMask: `${path.parse(file.name).name}-%d`,
                disableFontFace: true,
                useSystemFonts: false,
                viewportScale: 2.0,
            });

            // Save PNGs to /output
            for (let i = 0; i < pngPages.length; i++) {
                const page = pngPages[i];
                const outputPath = path.join(outputDir, `${path.parse(file.name).name}-page${i + 1}.png`);
                fs.writeFileSync(outputPath, page.content);
                results.push(outputPath);
            }
        }

        res.json({ message: 'Files processed', images: results });
    } catch (err) {
        console.error(err);
        res.status(500).send('Error processing PDFs.');
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

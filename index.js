const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs');
const pdf2pic = require('pdf2pic');

const app = express();
app.use(fileUpload());

if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
}

app.post('/convert', async (req, res) => {
    if (!req.files || !req.files.media) {
        return res.status(400).send('No files uploaded.');
    }

    const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
    for (const file of files) {
        const pdfBuffer = file.data; // Access file data in memory
        await processPDF(pdfBuffer, path.parse(file.name).name); // Process each PDF
    }
    res.send('Conversion completed.');
});

const processPDF = async (pdfBuffer, filename) => {
    const options = {
        density: 100, // Image quality
        format: 'png', // Output format
        width: 800, // Image width
    };

    const convert = new pdf2pic.fromBuffer(pdfBuffer, options); // Create converter instance
    const pages = await convert.bulk(-1); // Convert all pages
    const images = Object.values(pages); // Get images from conversion
    console.log(`Converted ${images.length} pages from ${filename}.`);
    // Save each image to /output folder
    images.forEach((image, index) => {
        const outputPath = path.join(__dirname, 'output', `${filename}_page${index + 1}.png`);
        fs.writeFileSync(outputPath, image.buffer); // Write to disk for output
    });
};

app.listen(3000, () => {
    console.log('Server started on http://localhost:3000');
});
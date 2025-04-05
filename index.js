const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const app = express();
const PORT = 3000;

const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

app.use(fileUpload());

app.post('/upload', (req, res) => {
    if (!req.files || !req.files.media) {
        return res.status(400).send('No files uploaded.');
    }

    const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
    const resultImages = [];

    // Start a child process for PDF conversion
    const childProcess = fork(path.join(__dirname, 'convertPdfToImage.js'));

    childProcess.on('message', (message) => {
        if (message.type === 'imageBuffer') {
            const { buffer, fileName } = message;
            const outputPath = path.join(outputDir, fileName);

            // Save the image buffer to disk
            fs.writeFileSync(outputPath, Buffer.from(buffer.data));
            resultImages.push(outputPath);
        } else if (message.type === 'done') {
            res.json({ message: 'PDFs converted and saved successfully.', images: resultImages });
            childProcess.send({ type: 'complete' });
        }
    });

    childProcess.send({ files });

    childProcess.on('error', (err) => {
        console.error('Child process error:', err);
        res.status(500).send('Failed to convert PDFs.');
    });

    childProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`Child process exited with code ${code}`);
            res.status(500).send('Failed to convert PDFs.');
        }else if (code === 0) {
            console.log('Child process completed successfully');
        }
    });
    console.log('main process completed');
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

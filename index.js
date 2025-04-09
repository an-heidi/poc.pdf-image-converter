const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const app = express();
const PORT = 3000;

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, 'output');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

// Configure express-fileupload
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    abortOnLimit: true,
    useTempFiles: true,
    tempFileDir: path.join(__dirname, 'tmp')
}));

// Ensure temp directory exists
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
}

// Handle file uploads and PDF conversion
app.post('/upload', (req, res) => {
    if (!req.files || !req.files.media) {
        return res.status(400).send('No files uploaded.');
    }

    // Handle both single and multiple file uploads
    const files = Array.isArray(req.files.media) ? req.files.media : [req.files.media];
    
    // Validate files are PDFs
    for (const file of files) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return res.status(400).send(`File ${file.name} is not a PDF file.`);
        }
    }
    
    const resultImages = [];

    // Start a child process for PDF conversion
    const childProcess = fork(path.join(__dirname, 'convertPdfToImage.js'));
    
    // Set timeout to kill the process if it takes too long
    const timeoutId = setTimeout(() => {
        console.error('PDF conversion timeout - killing child process');
        childProcess.kill();
        return res.status(500).send('PDF conversion timeout.');
    }, 60000); // 1 minute timeout

    // Handle messages from the child process
    childProcess.on('message', (message) => {
        if (message.type === 'imageBuffer') {
            const { buffer, fileName } = message;
            
            // Create a unique filename to avoid collisions
            const timestamp = Date.now();
            const uniqueFileName = `${timestamp}_${fileName}`;
            const outputPath = path.join(outputDir, uniqueFileName);

            // Save the image buffer to disk
            fs.writeFileSync(outputPath, Buffer.from(buffer.data));
            
            // Store relative path for response
            resultImages.push({
                path: `/output/${uniqueFileName}`,
                originalName: fileName
            });
        } else if (message.type === 'done') {
            clearTimeout(timeoutId);
            res.json({ 
                message: 'PDFs converted and saved successfully.', 
                images: resultImages 
            });
            childProcess.send({ type: 'complete' });
        } else if (message.type === 'error') {
            clearTimeout(timeoutId);
            console.error('Child process error:', message.error);
            res.status(500).send(`Failed to convert PDFs: ${message.error}`);
            childProcess.kill();
        }
    });

    // Send files to the child process - pass the full file objects
    // No need to extract data manually, convertPdfToImage.js is updated to handle the files
    childProcess.send({ files });

    // Handle child process errors
    childProcess.on('error', (err) => {
        clearTimeout(timeoutId);
        console.error('Child process error:', err);
        res.status(500).send('Failed to convert PDFs.');
    });

    // Handle child process exit
    childProcess.on('exit', (code) => {
        clearTimeout(timeoutId);
        if (code !== 0 && !res.headersSent) {
            console.error(`Child process exited with code ${code}`);
            res.status(500).send('Failed to convert PDFs.');
        }
    });
});

// Serve converted images
app.use('/output', express.static(outputDir));

// API info endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'PDF to Image Converter API',
        endpoints: {
            upload: '/upload (POST) - Convert PDF files to images',
            output: '/output/:filename - Access converted images'
        },
        usage: 'Send POST requests with PDF files using form field "media"'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Output directory: ${outputDir}`);
});

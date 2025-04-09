const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { exec } = require('child_process');
const { performance } = require('perf_hooks');
const os = require('os');

// Configuration
const SERVER_URL = 'http://localhost:3000/upload';
const TEST_PDF_SIZE_MB = 19; // Target size in MB
const OUTPUT_DIR = path.join(__dirname, 'test_pdfs');
const RESULTS_DIR = path.join(__dirname, 'benchmark_results');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR);
}

// System resource monitoring
class ResourceMonitor {
  constructor() {
    this.cpuUsageHistory = [];
    this.memoryUsageHistory = [];
    this.monitoringInterval = null;
    this.startTime = 0;
  }

  start() {
    this.cpuUsageHistory = [];
    this.memoryUsageHistory = [];
    this.startTime = performance.now();

    // Get initial CPU measurements for calculating usage
    this.previousCpuInfo = os.cpus();
    
    // Monitor every 100ms
    this.monitoringInterval = setInterval(() => {
      // Get memory usage
      const memUsage = process.memoryUsage();
      const usedMem = memUsage.rss / 1024 / 1024; // Convert to MB
      this.memoryUsageHistory.push({
        timestamp: performance.now() - this.startTime,
        value: usedMem
      });

      // Get CPU usage
      const currentCpuInfo = os.cpus();
      const cpuUsage = this.calculateCpuUsage(this.previousCpuInfo, currentCpuInfo);
      this.previousCpuInfo = currentCpuInfo;
      
      this.cpuUsageHistory.push({
        timestamp: performance.now() - this.startTime,
        value: cpuUsage
      });
    }, 100);
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  calculateCpuUsage(previousCpuInfo, currentCpuInfo) {
    let totalUser = 0;
    let totalSystem = 0;
    let totalIdle = 0;
    let totalTick = 0;

    for (let i = 0; i < currentCpuInfo.length; i++) {
      const prev = previousCpuInfo[i];
      const curr = currentCpuInfo[i];

      const userDiff = curr.times.user - prev.times.user;
      const sysDiff = curr.times.sys - prev.times.sys;
      const idleDiff = curr.times.idle - prev.times.idle;
      const totalDiff = userDiff + sysDiff + idleDiff;

      totalUser += userDiff;
      totalSystem += sysDiff;
      totalIdle += idleDiff;
      totalTick += totalDiff;
    }

    // Calculate average CPU usage percentage across all cores
    return totalTick ? ((totalUser + totalSystem) / totalTick) * 100 : 0;
  }

  getResults() {
    // Calculate averages
    const avgCpu = this.cpuUsageHistory.reduce((sum, item) => sum + item.value, 0) / this.cpuUsageHistory.length || 0;
    const avgMem = this.memoryUsageHistory.reduce((sum, item) => sum + item.value, 0) / this.memoryUsageHistory.length || 0;
    
    // Find peaks
    const peakCpu = this.cpuUsageHistory.length ? Math.max(...this.cpuUsageHistory.map(item => item.value)) : 0;
    const peakMem = this.memoryUsageHistory.length ? Math.max(...this.memoryUsageHistory.map(item => item.value)) : 0;
    
    return {
      cpu: {
        average: avgCpu.toFixed(2),
        peak: peakCpu.toFixed(2),
        samples: this.cpuUsageHistory.length
      },
      memory: {
        average: avgMem.toFixed(2),
        peak: peakMem.toFixed(2),
        samples: this.memoryUsageHistory.length
      }
    };
  }
}

// Look for test PDF or use existing one
function getTestPDFPath() {
  const pdfPath = path.join(OUTPUT_DIR, 'test.pdf');
  
  if (fs.existsSync(pdfPath)) {
    console.log(`Using existing PDF file: ${pdfPath}`);
    return pdfPath;
  } else {
    throw new Error(`Test PDF file not found at ${pdfPath}. Please create a test PDF file first.`);
  }
}

// Send a single file to the server and measure performance
async function uploadSingleFile(filePath) {
  // Verify the file exists and has content
  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`Test file at ${filePath} is empty (0 bytes).`);
      return {
        success: false,
        duration: 0,
        error: 'Test file is empty',
        resources: { cpu: { average: 0, peak: 0 }, memory: { average: 0, peak: 0 } }
      };
    }
    
    // Quick sanity check to verify this is actually a PDF file
    const header = fs.readFileSync(filePath, { encoding: 'utf8', length: 8 });
    if (!header.startsWith('%PDF')) {
      console.error(`Test file at ${filePath} does not appear to be a valid PDF file.`);
      return {
        success: false,
        duration: 0,
        error: 'Test file is not a valid PDF',
        resources: { cpu: { average: 0, peak: 0 }, memory: { average: 0, peak: 0 } }
      };
    }
  } catch (error) {
    console.error(`Error reading test file: ${error.message}`);
    return {
      success: false,
      duration: 0,
      error: `Test file error: ${error.message}`,
      resources: { cpu: { average: 0, peak: 0 }, memory: { average: 0, peak: 0 } }
    };
  }

  const formData = new FormData();
  formData.append('media', fs.createReadStream(filePath), {
    filename: path.basename(filePath),
    contentType: 'application/pdf'
  });
  
  const startTime = performance.now();
  const monitor = new ResourceMonitor();
  monitor.start();
  
  try {
    const response = await axios.post(SERVER_URL, formData, {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000 // 2 minute timeout
    });
    
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds
    
    monitor.stop();
    const resources = monitor.getResults();
    
    return {
      success: true,
      duration,
      response: response.data,
      resources
    };
  } catch (error) {
    const endTime = performance.now();
    const duration = (endTime - startTime) / 1000;
    
    monitor.stop();
    const resources = monitor.getResults();
    
    return {
      success: false,
      duration,
      error: error.message,
      resources
    };
  }
}

// Send multiple files simultaneously
async function uploadMultipleFiles(filePath, count) {
  console.log(`Starting ${count} simultaneous uploads...`);
  
  const totalMonitor = new ResourceMonitor();
  totalMonitor.start();
  const startTime = performance.now();
  
  const uploads = Array(count).fill().map(() => uploadSingleFile(filePath));
  const results = await Promise.all(uploads);
  
  const endTime = performance.now();
  totalMonitor.stop();
  
  const totalDuration = (endTime - startTime) / 1000;
  
  const successes = results.filter(r => r.success).length;
  const failures = count - successes;
  
  const durations = results.map(r => r.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / count;
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  
  // Calculate resource stats across all requests
  const totalResources = totalMonitor.getResults();
  
  return {
    totalDuration,
    avgDuration,
    minDuration,
    maxDuration,
    successes,
    failures,
    resources: totalResources
  };
}

// Run benchmarks
async function runBenchmarks() {
  try {
    // Make sure the server is running
    console.log('Checking if server is running...');
    try {
      await axios.get('http://localhost:3000/');
      console.log('Server is running.');
    } catch (error) {
      console.error('Server is not running. Please start the server before running benchmarks.');
      process.exit(1);
    }
    
    // Get test PDF path
    const testFilePath = getTestPDFPath();
    
    // Display system info
    console.log('\n=== System Information ===');
    console.log(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
    console.log(`Total Memory: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`Free Memory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`Platform: ${os.platform()} ${os.release()}`);
    console.log(`Node.js version: ${process.version}`);
    
    // Single file test
    console.log('\n=== Benchmark: Single 19MB PDF file ===');
    const singleResult = await uploadSingleFile(testFilePath);
    console.log(`Single file upload ${singleResult.success ? 'succeeded' : 'failed'}`);
    console.log(`Time taken: ${singleResult.duration.toFixed(2)} seconds`);
    console.log(`CPU usage: ${singleResult.resources.cpu.average}% avg, ${singleResult.resources.cpu.peak}% peak`);
    console.log(`Memory usage: ${singleResult.resources.memory.average} MB avg, ${singleResult.resources.memory.peak} MB peak`);
    
    // 10 simultaneous uploads
    console.log('\n=== Benchmark: 10 simultaneous uploads of 19MB PDF files ===');
    const result10 = await uploadMultipleFiles(testFilePath, 10);
    console.log('Results:');
    console.log(`Total duration: ${result10.totalDuration.toFixed(2)} seconds`);
    console.log(`Average request duration: ${result10.avgDuration.toFixed(2)} seconds`);
    console.log(`Min duration: ${result10.minDuration.toFixed(2)} seconds`);
    console.log(`Max duration: ${result10.maxDuration.toFixed(2)} seconds`);
    console.log(`Successful requests: ${result10.successes} / 10`);
    console.log(`CPU usage: ${result10.resources.cpu.average}% avg, ${result10.resources.cpu.peak}% peak`);
    console.log(`Memory usage: ${result10.resources.memory.average} MB avg, ${result10.resources.memory.peak} MB peak`);
    
    // 30 simultaneous uploads
    console.log('\n=== Benchmark: 20 simultaneous uploads of 19MB PDF files ===');
    const result30 = await uploadMultipleFiles(testFilePath, 20);
    console.log('Results:');
    console.log(`Total duration: ${result30.totalDuration.toFixed(2)} seconds`);
    console.log(`Average request duration: ${result30.avgDuration.toFixed(2)} seconds`);
    console.log(`Min duration: ${result30.minDuration.toFixed(2)} seconds`);
    console.log(`Max duration: ${result30.maxDuration.toFixed(2)} seconds`);
    console.log(`Successful requests: ${result30.successes} / 20`);
    console.log(`CPU usage: ${result30.resources.cpu.average}% avg, ${result30.resources.cpu.peak}% peak`);
    console.log(`Memory usage: ${result30.resources.memory.average} MB avg, ${result30.resources.memory.peak} MB peak`);
    
    // Performance summary
    console.log('\n=== Performance Summary ===');
    console.log(`Single file processing time: ${singleResult.duration.toFixed(2)}s`);
    console.log(`10 simultaneous files: ${result10.totalDuration.toFixed(2)}s total, ${result10.avgDuration.toFixed(2)}s avg`);
    console.log(`20 simultaneous files: ${result30.totalDuration.toFixed(2)}s total, ${result30.avgDuration.toFixed(2)}s avg`);
    
    const scaling10x = (singleResult.duration * 10) / result10.totalDuration;
    const scaling30x = (singleResult.duration * 20) / result30.totalDuration;
    
    console.log(`Scaling efficiency at 10x load: ${(scaling10x * 100).toFixed(2)}%`);
    console.log(`Scaling efficiency at 30x load: ${(scaling30x * 100).toFixed(2)}%`);
    console.log('(100% means perfect scaling, higher is better)');
    
  } catch (error) {
    console.error('Error running benchmarks:', error);
  }
}

// Run the benchmarks
runBenchmarks(); 
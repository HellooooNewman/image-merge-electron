const { app, ipcMain, BrowserWindow, screen } = require('electron');
const path = require('path');
const sharp = require('sharp');
const os = require('os');
const fs = require('fs');
require('@electron/remote/main').initialize()

// Function to merge images
const mergeImagesSideBySide = async (img1Path, img2Path, outputPath, padding = 10, textPadding = 125) => {
  try {
    // Validate that the files exist
    if (!fs.existsSync(img1Path) || !fs.existsSync(img2Path)) {
      throw new Error('One or both image paths are invalid.');
    }

    // Read image buffers directly
    const img1Buffer = fs.readFileSync(img1Path);
    const img2Buffer = fs.readFileSync(img2Path);

    const img1 = sharp(img1Buffer);
    const img2 = sharp(img2Buffer);

    const img1Metadata = await img1.metadata();
    const img2Metadata = await img2.metadata();

    // Resize img2 to match img1's height
    const resizedImg2 = img2.resize({
      height: img1Metadata.height,
      fit: 'contain',
    });

    // Calculate total width and height considering the padding and text
    const totalWidth = img1Metadata.width + img2Metadata.width + padding;
    const totalHeight = img1Metadata.height + textPadding + padding; // Include space for text and additional padding
    const fontSize = Math.max(16, img1Metadata.height * 0.05);

    // Create the base image with the new total height
    const { data, info } = await sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
      },
    })
      .composite([
        { input: img1Buffer, left: 0, top: 0 }, // Position for img1
        { input: await resizedImg2.toBuffer(), left: img1Metadata.width + padding, top: 0 }, // Position for img2 with padding
      ])
      .toBuffer({ resolveWithObject: true });
      

    const pixelArray = new Uint8ClampedArray(data.buffer);

    // When you are done changing the pixelArray, sharp takes the `pixelArray` as an input
    const { width, height, channels } = info;

    // // Create SVG text for the labels
    const createLabelSVG = (text, width, height) => {
      return Buffer.from(`
        <svg width="${width}" height="${height}">
          <style>
            .big { font: bold ${fontSize}px sans-serif; fill: black; }
          </style>
          <text class="big" x="50%" y="100%" text-anchor="middle" dominant-baseline="middle">${text}</text>
        </svg>
      `);
    };

    const labelBefore = createLabelSVG("Before", img1Metadata.width, textPadding);
    const labelAfter = createLabelSVG("After", img2Metadata.width, textPadding);

    // Final composite with labels
    await sharp(pixelArray, { raw: { width, height, channels } })
      .composite([
        { input: labelBefore, left: 0, top: img1Metadata.height - padding }, // Position label for img1
        { input: labelAfter, left: img1Metadata.width + padding, top: img1Metadata.height - padding }, // Position label for img2
      ])
      .toFile(outputPath);

    return outputPath;
  } catch (error) {
    console.error('Error merging images:', error);
    return 'Error merging images: ' + error.message;
  }
};

let mainWindow;
let lastWindowPosition = { x: 100, y: 100 };

const loadWindowPosition = () => {
  const filePath = path.join(__dirname, 'windowPosition.json'); // Adjust the path as necessary

  // Check if the file exists
  if (!fs.existsSync(filePath)) {
    console.log('Window position file does not exist. Using default position.');
    return { x: 100, y: 100 }; // Default position
  }

  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const position = JSON.parse(data); // This line may throw an error

    // Validate position
    if (typeof position.x === 'number' && typeof position.y === 'number') {
      return position;
    } else {
      throw new Error('Invalid window position data');
    }
  } catch (error) {
    console.error('Failed to load window position:', error);
    // Return a default position in case of error
    return { x: 100, y: 100 }; // Default position
  }
};

function saveWindowPosition() {
  const positionData = JSON.stringify(lastWindowPosition);
  fs.writeFileSync(path.join(app.getPath('userData'), 'window-position.json'), positionData);
}

const createWindow = () => {
  const { x, y } = lastWindowPosition;
  const displays = screen.getAllDisplays();
  const bounds = displays.map(display => display.bounds);

  // Check if last known position is within any screen's bounds
  const isWithinScreen = bounds.some(bound =>
    x >= bound.x && x <= bound.x + bound.width &&
    y >= bound.y && y <= bound.y + bound.height
  );
  
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    x: isWithinScreen ? x : 100,
    y: isWithinScreen ? y : 100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
    },
  });

  mainWindow.on('close', (event) => {
    const { x, y } = mainWindow.getBounds();
    lastWindowPosition = { x, y }; // Store the position
    saveWindowPosition(); // Save position to file
  });

  // Enable remote module for the window's web contents
  require('@electron/remote/main').enable(mainWindow.webContents);

  mainWindow.loadFile('index.html');

  // Open the DevTools (optional)
  // mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  loadWindowPosition();
  createWindow();

  console.log('Node.js version:', process.versions.node);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } 
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle the merge images request from renderer
ipcMain.handle('merge-images', async (event, beforePath, afterPath) => {
  const desktopDir = path.join(os.homedir(), 'Desktop');  // Saving to Desktop
  let outputPath = path.join(desktopDir, 'merged_image.png'); // Initial name of merged image file

  // Check if the file already exists and increment the name if it does
  let counter = 1;
  while (fs.existsSync(outputPath)) {
    outputPath = path.join(desktopDir, `merged_image_${counter}.png`);
    counter++;
  }

  const result = await mergeImagesSideBySide(beforePath, afterPath, outputPath);
  return result;
});

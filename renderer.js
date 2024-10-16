const { ipcRenderer, webUtils } = require('electron');
const { dialog } = require('@electron/remote');

const dropArea = document.getElementById('dropArea');
const selectFilesButton = document.getElementById('selectFilesButton');
const mergeButton = document.getElementById('mergeButton');
const messageDiv = document.getElementById('message');

// Image preview elements
const beforeImageElement = document.getElementById('beforeImage');
const afterImageElement = document.getElementById('afterImage');

let beforePath = '';
let afterPath = '';

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
  document.body.addEventListener(eventName, preventDefaults, false);
});

// Highlight drop area when dragging over it
dropArea.addEventListener('dragover', () => dropArea.classList.add('hover'), false);
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('hover'), false);

// Handle dropped files
dropArea.addEventListener('drop', handleDrop, false);

// Handle button click to select files
selectFilesButton.addEventListener('click', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }]
  });

  if (result.canceled) {
    messageDiv.textContent = 'File selection was canceled.';
    messageDiv.className = 'error';
    return;
  }

  const files = result.filePaths;
  if (files.length >= 2) {
    beforePath = files[0]; // First file is before image
    afterPath = files[1];   // Second file is after image

    // Update message and show image previews
    messageDiv.textContent = `Images ready: ${beforePath} and ${afterPath}`;
    messageDiv.className = 'result';

    // Set the src for image previews
    beforeImageElement.src = beforePath;
    beforeImageElement.style.display = 'block'; // Show the before image
    afterImageElement.src = afterPath;
    afterImageElement.style.display = 'block'; // Show the after image
  } else {
    messageDiv.textContent = 'Please select two images.';
    messageDiv.className = 'error';
  }
});

mergeButton.addEventListener('click', async () => {
  // Validate that both paths are selected
  if (!beforePath || !afterPath) {
    messageDiv.textContent = 'Please drop or select both before and after images.';
    messageDiv.className = 'error';
    return;
  }

  // Merge images and display result
  const result = await ipcRenderer.invoke('merge-images', beforePath, afterPath);
  console.log('Result from merge:', result);

  if (result.startsWith('Error')) {
    messageDiv.textContent = result;
    messageDiv.className = 'error';
  } else {
    messageDiv.textContent = 'Merged image created successfully! Saved at: ' + result;
    messageDiv.className = 'result';
  }
});

// Prevent default behavior (Prevent file from being opened)
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Handle dropped files
function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  // Get the paths for the first two files
  if (files.length >= 2) {
    beforePath = webUtils.getPathForFile(files[0]); // First file is before image
    afterPath = webUtils.getPathForFile(files[1]);   // Second file is after image

    // Update message and show image previews
    // messageDiv.textContent = `Images ready: ${beforePath} and ${afterPath}`;
    messageDiv.className = 'result';

    // Set the src for image previews
    beforeImageElement.src = beforePath;
    beforeImageElement.style.display = 'block'; // Show the before image
    afterImageElement.src = afterPath;
    afterImageElement.style.display = 'block'; // Show the after image
  } else {
    messageDiv.textContent = 'Please drop two images.';
    messageDiv.className = 'error';
  }
}

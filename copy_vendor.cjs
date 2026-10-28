const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

// 1. Copy bootstrap css & js
const bVendor = path.join(__dirname, 'public', 'vendor', 'bootstrap');
fs.mkdirSync(bVendor, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'node_modules', 'bootstrap', 'dist', 'css', 'bootstrap.min.css'), path.join(bVendor, 'bootstrap.min.css'));
fs.copyFileSync(path.join(__dirname, 'node_modules', 'bootstrap', 'dist', 'js', 'bootstrap.bundle.min.js'), path.join(bVendor, 'bootstrap.bundle.min.js'));

// 2. Copy bootstrap-icons
const biVendor = path.join(__dirname, 'public', 'vendor', 'bootstrap-icons');
const biSrc = path.join(__dirname, 'node_modules', 'bootstrap-icons', 'font');
copyFolderSync(biSrc, biVendor);

console.log('VENDOR_FILES_COPIED_SUCCESSFULLY');

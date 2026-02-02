# Fix App Crash - Convert ES6 Imports to CommonJS

## Issue
The app crashed with "Cannot use import statement outside a module" because studentController.js uses ES6 imports while the project is configured for CommonJS.

## Steps
- [ ] Convert ES6 import statements in studentController.js to CommonJS require statements
- [ ] Test the app to ensure it starts without errors

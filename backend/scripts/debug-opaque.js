// backend/scripts/debug-opaque.js
const opaque = require('@serenity-kit/opaque');

console.log('Opaque package structure:');
console.log(Object.keys(opaque));

// Try to see what's available
if (opaque.server) {
    console.log('\nserver methods:', Object.keys(opaque.server));
} else if (opaque.Server) {
    console.log('\nServer class available');
}

// Check for any exports
console.log('\nFull export:', opaque);
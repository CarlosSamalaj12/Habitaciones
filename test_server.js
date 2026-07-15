process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

process.on('exit', (code) => {
    console.log('Process exiting with code:', code);
});

console.log('Starting...');
try {
    const server = require('./server/server.js');
    console.log('Server module loaded (require returned)');
} catch(e) {
    console.error('Error loading server:', e);
    process.exit(1);
}

setTimeout(() => {
    console.log('Timeout reached, exiting');
    process.exit(0);
}, 10000);

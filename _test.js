try {
    require('./src/routes/index');
    console.log('ROUTES_OK');
} catch (e) {
    console.error('FAIL:', e.message);
}


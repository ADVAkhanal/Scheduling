const express = require('express');
const path = require('path');
const app = express();

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on port ${PORT}`));

const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();
const fs = require('fs');
const morgan = require('morgan');
const cron = require('node-cron');
const archiver = require('archiver');

const app = express();
const PORT = process.env.PORT || 3000;

// Create LOG directory if it doesn't exist
const logDirectory = path.join(__dirname, 'LOG');
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory);
}

// Set up logging
const date = new Date();
const logFileName = `${date.toISOString().split('T')[0]}.log`;
const logFilePath = path.join(logDirectory, logFileName);
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
app.use(morgan('combined', { stream: logStream }));

// Set EJS as the templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Route for the index page
app.get('/', (req, res) => {
    res.render('index');
});

// Route to handle form submission
app.post('/contact', (req, res) => {
    const { name, phone, email, message } = req.body;
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: email,
        to: process.env.SMTP_USER,
        subject: `New Contact Form Submission from ${name}`,
        text: `Name: ${name}\nPhone: ${phone}\nEmail: ${email}\nMessage: ${message}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error occurred:', error);
            return res.status(500).send('Something went wrong, please try again.');
        }
        console.log('Email sent:', info.response);
        res.send('Thank you for your message!');
    });
});

// Function to zip log files
const zipLogFiles = () => {
    const zipFileName = `LOG/logs_${new Date().toISOString().split('T')[0]}.zip`;
    const output = fs.createWriteStream(path.join(__dirname, zipFileName));
    const archive = archiver('zip', {
        zlib: { level: 9 } // Set the compression level
    });

    output.on('close', function () {
        console.log(archive.pointer() + ' total bytes');
        console.log('Zip file has been finalized and the output file descriptor has closed.');
    });

    archive.on('error', function (err) {
        throw err;
    });

    archive.pipe(output);

    // Append all log files in the LOG directory
    fs.readdir(logDirectory, (err, files) => {
        if (err) {
            console.error('Error reading log directory:', err);
            return;
        }
        files.forEach((file) => {
            if (file.endsWith('.log')) {
                archive.file(path.join(logDirectory, file), { name: file });
            }
        });
        archive.finalize();
    });
};

// Function to delete old log files
const deleteOldLogFiles = (days) => {
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000; // Calculate cutoff timestamp

    fs.readdir(logDirectory, (err, files) => {
        if (err) {
            console.error('Error reading log directory:', err);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(logDirectory, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error('Error getting file stats:', err);
                    return;
                }
                // Check if the file is older than the cutoff
                if (stats.mtimeMs < cutoff) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error('Error deleting file:', err);
                        } else {
                            console.log(`Deleted old log file: ${file}`);
                        }
                    });
                }
            });
        });
    });
};

// Schedule the zipLogFiles function to run every Sunday at midnight
cron.schedule('0 0 * * 0', () => {
    console.log('Zipping log files...');
    zipLogFiles();
});

// Schedule the deleteOldLogFiles function to run every day at 1 AM
cron.schedule('0 1 * * *', () => {
    console.log('Deleting old log files...');
    deleteOldLogFiles(7); // Change the number to set how many days of logs to keep
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
